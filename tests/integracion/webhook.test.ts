// Webhook de GHL con datos simulados (el formato real de GHL se comprobará al publicar).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { crearEscenario, borrarEscenario, db, type Escenario } from "../apoyo/escenario";
import { POST } from "@/app/api/webhooks/ghl/[proyectoId]/route";

let e: Escenario;
let secreto: string;
beforeAll(async () => {
  e = await crearEscenario();
  secreto = (await db.from("proyectos").select("webhook_secreto").eq("id", e.proyecto.id).single()).data!.webhook_secreto;
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

function enviar(cuerpo: unknown, clave = secreto, proyectoId = e.proyecto.id) {
  const req = new NextRequest(`http://localhost/api/webhooks/ghl/${proyectoId}?secreto=${clave}`, {
    method: "POST",
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
    headers: { "content-type": "application/json" },
  });
  return POST(req, { params: Promise.resolve({ proyectoId }) } as never);
}

describe("Webhook de GHL", () => {
  it("rechaza una clave incorrecta o un proyecto que no existe", async () => {
    expect((await enviar({ tipo: "lead_nuevo" }, "mala")).status).toBe(401);
    expect((await enviar({ tipo: "lead_nuevo" }, secreto, "00000000-0000-0000-0000-000000000000")).status).toBe(401);
    expect((await enviar({ tipo: "lead_nuevo" }, secreto, "no-es-un-id")).status).toBe(404);
  });
  it("rechaza JSON roto", async () => {
    expect((await enviar("{roto")).status).toBe(400);
  });
  it("lead nuevo con respuestas del formulario", async () => {
    const r = await enviar({
      tipo: "lead_nuevo",
      contact_id: `${e.pref}-wh1`,
      first_name: "Web",
      last_name: "Hook",
      email: `${e.pref}-wh1@x.test`,
      phone: "+15550000099",
      tags: "webinar1, form completado",
      customData: { "¿Cuándo quieres empezar?": "Ya mismo" },
    });
    expect(r.status).toBe(200);
    const { data } = await db.from("leads").select("*").eq("ghl_contact_id", `${e.pref}-wh1`).single();
    expect(data).toMatchObject({ nombre: "Web", apellido: "Hook", origen: "ghl", etiquetas: ["webinar1", "form completado"] });
    expect(data!.respuestas).toEqual([{ pregunta: "¿Cuándo quieres empezar?", respuesta: "Ya mismo" }]);
  });
  it("el mismo lead dos veces no se duplica", async () => {
    await enviar({ tipo: "lead_nuevo", contact_id: `${e.pref}-wh1`, email: `${e.pref}-wh1@x.test`, first_name: "Web" });
    expect((await db.from("leads").select("id").eq("ghl_contact_id", `${e.pref}-wh1`)).data).toHaveLength(1);
  });
  it("cita agendada: se asigna al closer por su email y el lead pasa a «agendado»", async () => {
    const r = await enviar({ tipo: "cita_agendada", contact_id: `${e.pref}-wh1`, calendar: { startTime: "2026-10-12T15:00:00-04:00" }, closer_email: e.p.closerA.email });
    expect(r.status).toBe(200);
    const { data: lead } = await db.from("leads").select("id, estado_caller, closer_id").eq("ghl_contact_id", `${e.pref}-wh1`).single();
    expect(lead).toMatchObject({ estado_caller: "agendado", closer_id: e.p.closerA.id });
    const { data: cita } = await db.from("citas").select("fecha, origen").eq("lead_id", lead!.id).single();
    expect(cita!.origen).toBe("ghl");
    expect(new Date(cita!.fecha).toISOString()).toBe("2026-10-12T19:00:00.000Z");
  });
  it("cita sin fecha: error claro y queda registrado", async () => {
    const r = await enviar({ tipo: "cita_agendada", contact_id: `${e.pref}-wh1` });
    expect(r.status).toBe(422);
    const { data } = await db.from("webhook_eventos").select("procesado, error").eq("proyecto_id", e.proyecto.id).eq("tipo", "cita_agendada").order("recibido_en", { ascending: false }).limit(1).single();
    expect(data).toMatchObject({ procesado: false, error: "La cita no trae fecha" });
  });
  it("cambio de etapa por nombre de columna", async () => {
    expect((await enviar({ tipo: "cambio_etapa", contact_id: `${e.pref}-wh1`, pipeline_stage: "Cerrados" })).status).toBe(200);
    const { data } = await db.from("leads").select("etapa_id").eq("ghl_contact_id", `${e.pref}-wh1`).single();
    expect(data!.etapa_id).toBe(e.etapas.Cerrados);
    expect((await enviar({ tipo: "cambio_etapa", contact_id: `${e.pref}-wh1`, pipeline_stage: "No existe" })).status).toBe(422);
  });
  it("tipo desconocido", async () => {
    expect((await enviar({ tipo: "venta" })).status).toBe(422);
  });
});

describe("Arreglos 18, 19 y 20 del webhook de GHL", () => {
  const citaDe = async (leadId: string) => (await db.from("citas").select("id, closer_id, fecha").eq("lead_id", leadId)).data ?? [];
  it("18: encuentra el lead por teléfono (últimas 9 cifras); sin email, teléfono ni contacto da un error claro", async () => {
    const { data: l } = await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre: "PorTel", telefono: "+34 622 333 444" }).select("id").single();
    expect((await enviar({ tipo: "cita_agendada", phone: "622333444", fecha: "2026-11-02T15:00:00Z" })).status).toBe(200);
    expect(await citaDe(l!.id)).toHaveLength(1);
    expect((await db.from("leads").select("id").eq("proyecto_id", e.proyecto.id).like("telefono", "%622%333%444%")).data).toHaveLength(1); // no creó otro
    const r = await enviar({ tipo: "cita_agendada", fecha: "2026-11-02T15:00:00Z", first_name: "Nadie" });
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/no viene email, teléfono ni contacto/);
  });
  it("19: la misma cita sin id de GHL enviada dos veces no se duplica", async () => {
    const email = `${e.pref}-sin-id@x.test`;
    for (let i = 0; i < 2; i++) expect((await enviar({ tipo: "cita_agendada", email, fecha: "2026-11-03T15:00:00Z" })).status).toBe(200);
    const { data: l } = await db.from("leads").select("id").eq("proyecto_id", e.proyecto.id).eq("email", email).single();
    expect(await citaDe(l!.id)).toHaveLength(1);
    expect((await enviar({ tipo: "cita_agendada", email, fecha: "2026-11-04T15:00:00Z" })).status).toBe(200); // otra hora: otra cita
    expect(await citaDe(l!.id)).toHaveLength(2);
  });
  it("cita con el formato real de GHL: la hora sin zona se lee en la zona del calendario (11 oct 2026)", async () => {
    // Copia del webhook que mandó GHL en la primera reserva de prueba (Webhook normal + Custom data)
    const r = await enviar({
      contact_id: `${e.pref}-real`,
      email: `${e.pref}-real@x.test`,
      first_name: "Real",
      calendar: { startTime: "2026-10-14T15:30:00", selectedTimezone: "America/New_York", appointmentId: `${e.pref}-cita-real` },
      customData: { tipo: "cita_agendada", fecha: "Wednesday, October 14, 2026 9:30 PM", closer_email: e.p.closerA.email },
    });
    expect(r.status).toBe(200);
    const { data: cita } = await db.from("citas").select("fecha, closer_id").eq("ghl_cita_id", `${e.pref}-cita-real`).single();
    expect(new Date(cita!.fecha).toISOString()).toBe("2026-10-14T19:30:00.000Z"); // 15:30 de Nueva York
    expect(cita!.closer_id).toBe(e.p.closerA.id);
  });
  it("20: un closer que no es de este proyecto no se asigna", async () => {
    await db.from("miembros_proyecto").delete().eq("proyecto_id", e.proyecto.id).eq("perfil_id", e.p.closerB.id);
    try {
      const email = `${e.pref}-otro-closer@x.test`;
      expect((await enviar({ tipo: "cita_agendada", email, fecha: "2026-11-05T15:00:00Z", closer_email: e.p.closerB.email })).status).toBe(200);
      const { data: l } = await db.from("leads").select("id").eq("proyecto_id", e.proyecto.id).eq("email", email).single();
      expect((await citaDe(l!.id))[0].closer_id).toBeNull();
    } finally {
      await db.from("miembros_proyecto").insert({ proyecto_id: e.proyecto.id, perfil_id: e.p.closerB.id, orden: 9 });
    }
  });
});

describe("Formato de las plantillas de GUIA-GHL (clave en cabecera)", () => {
  const conCabecera = (cuerpo: unknown, clave = secreto) =>
    POST(
      new NextRequest(`http://localhost/api/webhooks/ghl/${e.proyecto.id}`, {
        method: "POST",
        body: JSON.stringify(cuerpo),
        headers: { "content-type": "application/json", "x-eternity-secreto": clave },
      }),
      { params: Promise.resolve({ proyectoId: e.proyecto.id }) } as never
    );
  it("la clave en la cabecera x-eternity-secreto funciona y una mala no", async () => {
    expect((await conCabecera({ tipo: "lead_nuevo", contact_id: `${e.pref}-cab`, email: `${e.pref}-cab@x.test`, first_name: "Cab" })).status).toBe(200);
    expect((await conCabecera({ tipo: "lead_nuevo" }, "mala")).status).toBe(401);
  });
  it("las plantillas de cita y de etapa (campos «fecha» y «etapa»)", async () => {
    expect((await conCabecera({ tipo: "cita_agendada", contact_id: `${e.pref}-cab`, fecha: "2026-10-20T10:00:00-04:00", closer_email: e.p.closerB.email })).status).toBe(200);
    const { data: lead } = await db.from("leads").select("id, closer_id").eq("ghl_contact_id", `${e.pref}-cab`).single();
    expect(lead!.closer_id).toBe(e.p.closerB.id);
    expect((await conCabecera({ tipo: "cambio_etapa", contact_id: `${e.pref}-cab`, pipeline: "Pipeline test", etapa: "Agendados" })).status).toBe(200);
    expect((await db.from("leads").select("etapa_id").eq("id", lead!.id).single()).data!.etapa_id).toBe(e.etapas.Agendados);
  });
  it("12 oct (Cristian): una cita que llega por el webhook deja su lead en «Orgánico → Agendados»", async () => {
    const { data: org } = await db.from("pipelines").insert({ proyecto_id: e.proyecto.id, nombre: "Orgánico", orden: 5 }).select().single();
    const { data: ets } = await db.from("etapas").insert(["Nuevos", "Agendados"].map((n, i) => ({ pipeline_id: org!.id, nombre: n, orden: i }))).select();
    const r = await enviar({ contact_id: `${e.pref}-org`, email: `${e.pref}-org@x.test`, first_name: "Org", calendar: { startTime: "2026-10-20T10:00:00", selectedTimezone: "America/New_York" }, customData: { tipo: "cita_agendada" } });
    expect(r.status).toBe(200);
    const { data: lead } = await db.from("leads").select("pipeline_id, etapa_id").eq("ghl_contact_id", `${e.pref}-org`).single();
    expect(lead).toEqual({ pipeline_id: org!.id, etapa_id: ets!.find((x) => x.nombre === "Agendados")!.id });
    await db.from("pipelines").delete().eq("id", org!.id);
  });
  it("13 oct (Cristian): la cita va a «Agendan» del pipeline que dice su workflow («pipeline» en Custom Data); sin él, o si no existe, no va ahí", async () => {
    const { data: yt } = await db.from("pipelines").insert({ proyecto_id: e.proyecto.id, nombre: "0. Agendas YT", orden: 9 }).select().single();
    const { data: ets } = await db.from("etapas").insert(["Form", "Agendan"].map((n, i) => ({ pipeline_id: yt!.id, nombre: n, orden: i }))).select();
    const agendan = ets!.find((x) => x.nombre === "Agendan")!.id;
    const fila = async (c: string) => (await db.from("leads").select("pipeline_id, etapa_id").eq("ghl_contact_id", c).single()).data;
    // Nombre sin número ni tildes ni mayúsculas: vale igual
    expect((await enviar({ tipo: "cita_agendada", contact_id: `${e.pref}-yt1`, email: `${e.pref}-yt1@x.test`, fecha: "2026-12-05T15:00:00Z", customData: { pipeline: "agendas yt" } })).status).toBe(200);
    expect(await fila(`${e.pref}-yt1`)).toEqual({ pipeline_id: yt!.id, etapa_id: agendan });
    expect((await enviar({ tipo: "cita_agendada", contact_id: `${e.pref}-yt2`, email: `${e.pref}-yt2@x.test`, fecha: "2026-12-06T15:00:00Z", customData: { pipeline: "No existe" } })).status).toBe(200);
    expect((await fila(`${e.pref}-yt2`))!.pipeline_id).not.toBe(yt!.id);
    expect((await enviar({ tipo: "cita_agendada", contact_id: `${e.pref}-yt3`, email: `${e.pref}-yt3@x.test`, fecha: "2026-12-07T15:00:00Z" })).status).toBe(200);
    expect((await fila(`${e.pref}-yt3`))!.pipeline_id).not.toBe(yt!.id);
  });
  it("las plantillas son JSON válido una vez rellenadas", async () => {
    const { PLANTILLAS_GHL } = await import("@/lib/plantillas-ghl");
    for (const p of PLANTILLAS_GHL) expect(() => JSON.parse(p.cuerpo), p.clave).not.toThrow();
  });

  it("plan GHL, fase 4: si el proyecto lee sus citas por la API, el aviso de cita del workflow solo se guarda", async () => {
    await db.from("proyectos").update({ ghl_calendarios: ["cal-x"] }).eq("id", e.proyecto.id);
    const r = await enviar({ tipo: "cita_agendada", contact_id: `${e.pref}-api1`, email: `${e.pref}-api1@x.test`, fecha: "2026-12-01T15:00:00Z" });
    await db.from("proyectos").update({ ghl_calendarios: [] }).eq("id", e.proyecto.id);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, ignorado: true });
    expect((await db.from("leads").select("id").eq("proyecto_id", e.proyecto.id).eq("ghl_contact_id", `${e.pref}-api1`)).data).toHaveLength(0);
  });
});
