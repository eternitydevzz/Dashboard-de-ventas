// Workflows, 4a-2 (docs/plan-workflows.md, aprobado por Cristian el 7 nov 2026): el MODO REAL, con un GHL de mentira.
// Pasar a real y volver a lo de hoy (sin que manden los dos ni ninguno), las mismas llamadas a GHL que hoy, 5 fallos →
// error + email, y que «Mandar a GHL» no se pueda encender mientras lo manda el workflow.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { crearEscenario, borrarEscenario, como, db, type Escenario } from "../apoyo/escenario";
import { POST } from "@/app/api/webhooks/entrada/[token]/route";
import { crearWorkflowDePrueba, devolverAHoy, guardarEntradaCompleta, pasarWorkflowAReal } from "@/app/(panel)/admin/acciones";
import { avanzarEjecuciones } from "@/lib/workflows-motor";

let e: Escenario;
let token: string;
let entradaId: string;
let workflowId: string;
const AG_BIB = "wym2Ue4VUqkhsFoQJ5PK";
const AG_GEN = "zuQjPVJNbPpRlL0voy6d";
const CONFIG_GHL = {
  ghl_activo: true,
  ghl_campos: { "quiz.situacion": "ILrgHLZsc1TX8lBYWzfM" },
  ghl_oportunidades: [{ pipeline_id: AG_BIB, etapa_id: null }, { pipeline_id: AG_GEN, etapa_id: null }],
  ghl_pipeline_id: AG_BIB,
  ghl_etapa_id: null,
  ghl_etiqueta_base: "Biblioteca-agenda",
  ghl_etiquetas_extra: ["agenda biblioteca"],
  ghl_espera_seg: 300,
  ghl_campo_completo: "quiz_completed",
};

// GHL de mentira: contactos, etiquetas (en minúsculas, como el real) y oportunidades
const ghl = { contactos: [] as { id: string; email: string; tags: string[] }[], opps: [] as { id: string; contactId: string; pipelineId: string; pipelineStageId: string }[], upserts: 0, falla: false };
let n = 0;
const falsoGhl = (async (url: string, init?: { method?: string; body?: string }) => {
  if (ghl.falla) return new Response("{}", { status: 401 });
  const u = new URL(url);
  const metodo = init?.method ?? "GET";
  const cuerpo = init?.body ? JSON.parse(init.body) : {};
  if (u.pathname === "/contacts/upsert") {
    ghl.upserts++;
    let c = ghl.contactos.find((x) => x.email === cuerpo.email);
    if (!c) ghl.contactos.push((c = { id: `c${++n}`, email: cuerpo.email, tags: [] }));
    return Response.json({ contact: { id: c.id, tags: [...c.tags] } });
  }
  const t = u.pathname.match(/^\/contacts\/([^/]+)\/tags$/);
  if (t) {
    const c = ghl.contactos.find((x) => x.id === decodeURIComponent(t[1]))!;
    const tags = (cuerpo.tags as string[]).map((x) => x.toLowerCase());
    c.tags = metodo === "DELETE" ? c.tags.filter((x) => !tags.includes(x)) : [...new Set([...c.tags, ...tags])];
    return Response.json({ tags: c.tags });
  }
  if (u.pathname === "/opportunities/search") {
    const q = u.searchParams;
    return Response.json({ opportunities: ghl.opps.filter((o) => o.contactId === q.get("contact_id") && o.pipelineId === q.get("pipeline_id")), meta: {} });
  }
  if (u.pathname === "/opportunities/" && metodo === "POST") {
    const o = { id: `o${++n}`, contactId: cuerpo.contactId, pipelineId: cuerpo.pipelineId, pipelineStageId: cuerpo.pipelineStageId };
    ghl.opps.push(o);
    return Response.json({ opportunity: o }, { status: 201 });
  }
  if (u.pathname === "/opportunities/pipelines")
    return Response.json({ pipelines: [{ id: AG_BIB, name: "0. Agendas Biblioteca", stages: [{ id: "bib-form", name: "Form", position: 0 }] }, { id: AG_GEN, name: "0. Agendas General", stages: [{ id: "gen-form", name: "Form", position: 0 }] }] });
  return new Response("{}", { status: 404 });
}) as unknown as typeof fetch;
const avisos: { entrada: string; lead: string; error: string }[] = [];
const conGhl = { locationId: "loc-test", token: "tok", fetchImpl: falsoGhl, avisar: async (a: { entrada: string; lead: string; error: string }) => void avisos.push(a) };

beforeAll(async () => {
  e = await crearEscenario();
  // «Pasar a real» exige GHL conectado; el motor recibe el token aparte (conGhl)
  await db.from("proyectos").update({ ghl_location_id: "loc-test", ghl_token: "token-de-prueba-no-real" }).eq("id", e.proyecto.id);
  const { data, error } = await db.from("entradas").insert({ proyecto_id: e.proyecto.id, nombre: "WF agenda", pipeline_id: e.pipeline.id, ...CONFIG_GHL }).select("id, token").single();
  if (error) throw new Error(error.message);
  token = data!.token;
  entradaId = data!.id;
  como(e, e.p.ceo);
  await crearWorkflowDePrueba(entradaId);
  workflowId = (await db.from("workflows").select("id").eq("entrada_id", entradaId).single()).data!.id;
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

function enviar(cuerpo: Record<string, unknown>) {
  const req = new NextRequest(`http://localhost/api/webhooks/entrada/${token}`, { method: "POST", body: JSON.stringify(cuerpo), headers: { "content-type": "application/json" } });
  return POST(req, { params: Promise.resolve({ token }) } as never);
}
const lead = async (email: string) => (await db.from("leads").select("id, ghl_contact_id, etiquetas").eq("proyecto_id", e.proyecto.id).eq("email", email).single()).data!;
const ejecucionesDe = async (email: string) => (await db.from("workflow_ejecuciones").select("*").eq("lead_id", (await lead(email)).id).order("creado_en")).data ?? [];
const eventosDe = async (email: string) => (await db.from("webhook_eventos").select("ghl_estado, ghl_error").eq("entrada_id", entradaId).eq("lead_id", (await lead(email)).id).order("recibido_en")).data ?? [];
const dentroDe = (seg: number) => new Date(Date.now() + seg * 1000);
const email1 = () => `${e.pref}-real1@x.test`;
const email2 = () => `${e.pref}-real2@x.test`;

describe("pasar a real", () => {
  it("un caller no puede", async () => {
    como(e, e.p.callerA);
    expect(await pasarWorkflowAReal(workflowId)).toMatchObject({ error: expect.any(String) });
  });
  it("el workflow pasa a real y la Entrada deja de mandar a GHL; lo que esperaba para GHL lo lleva el workflow", async () => {
    await enviar({ name: "Ana Real", email: email1(), phone: "+15550100011", step: "agenda_datos" });
    expect((await eventosDe(email1()))[0].ghl_estado).toBe("esperando");
    como(e, e.p.ceo);
    expect(await pasarWorkflowAReal(workflowId)).toMatchObject({ ok: true });
    expect((await db.from("workflows").select("modo, encendido").eq("id", workflowId).single()).data).toEqual({ modo: "real", encendido: true });
    expect((await db.from("entradas").select("ghl_activo").eq("id", entradaId).single()).data!.ghl_activo).toBe(false);
    // No se queda «esperando» para el camino de hoy (que ya no manda): lo manda su ejecución
    expect((await eventosDe(email1()))[0]).toEqual({ ghl_estado: null, ghl_error: "Lo manda su workflow" });
    expect((await ejecucionesDe(email1()))[0].estado).toBe("esperando");
  });
  it("con el workflow en real no se puede encender «Mandar a GHL» de la Entrada", async () => {
    como(e, e.p.ceo);
    const r = await guardarEntradaCompleta(entradaId, {
      entrada: { nombre: "WF agenda", pipeline_id: e.pipeline.id, etapa_id: null, reglas: [] },
      ghl: { activo: true, campos: CONFIG_GHL.ghl_campos, oportunidades: CONFIG_GHL.ghl_oportunidades, etiqueta_base: CONFIG_GHL.ghl_etiqueta_base, etiquetas_extra: CONFIG_GHL.ghl_etiquetas_extra, espera_seg: 300, campo_completo: "quiz_completed" },
    });
    expect(r).toMatchObject({ error: expect.stringMatching(/workflow/i) });
  });
});

describe("modo real: las mismas llamadas a GHL que hoy", () => {
  it("antes de su hora no hace nada", async () => {
    await avanzarEjecuciones(e.proyecto.id, { ahora: new Date(), ghl: conGhl });
    expect(ghl.upserts).toBe(0);
  });
  it("a su hora: contacto, etiquetas (con la fija) y 2 oportunidades en la primera columna; el lead guarda su contacto", async () => {
    const r = await avanzarEjecuciones(e.proyecto.id, { ahora: dentroDe(301), ghl: conGhl });
    expect(r.errores).toEqual([]);
    expect(ghl.upserts).toBe(1);
    const c = ghl.contactos.find((x) => x.email === email1())!;
    expect(c.tags.sort()).toEqual(["agenda biblioteca", "biblioteca-agenda-incompleto"]);
    expect(ghl.opps.filter((o) => o.contactId === c.id).map((o) => `${o.pipelineId}|${o.pipelineStageId}`).sort()).toEqual([`${AG_BIB}|bib-form`, `${AG_GEN}|gen-form`]);
    const l = await lead(email1());
    expect(l.ghl_contact_id).toBe(c.id);
    expect(l.etiquetas).toEqual(expect.arrayContaining(["biblioteca-agenda-incompleto", "agenda biblioteca"]));
    const ej = (await ejecucionesDe(email1()))[0];
    expect(ej).toMatchObject({ estado: "ok", coincide: null, error: null });
    expect((ej.registro as { modo?: string }[]).at(-1)).toMatchObject({ modo: "real" });
  });
  it("el cuestionario tarde: nueva ejecución, pasa a -completo y no duplica oportunidades", async () => {
    await enviar({ email: email1(), step: "cuestionario", quiz: { situacion: "Agencia" }, quiz_completed: true });
    expect((await eventosDe(email1())).at(-1)!.ghl_estado).toBeNull(); // la Entrada ya no manda a GHL
    await avanzarEjecuciones(e.proyecto.id, { ahora: dentroDe(301), ghl: conGhl });
    const c = ghl.contactos.find((x) => x.email === email1())!;
    expect(c.tags.sort()).toEqual(["agenda biblioteca", "biblioteca-agenda-completo"]);
    expect(ghl.opps.filter((o) => o.contactId === c.id)).toHaveLength(2);
  });
  it("si GHL falla 5 veces: «error» y UN email", async () => {
    await enviar({ name: "Beto Real", email: email2(), phone: "+15550100012" });
    ghl.falla = true;
    for (let i = 1; i <= 5; i++) await avanzarEjecuciones(e.proyecto.id, { ahora: dentroDe(300 + i * 61), ghl: conGhl });
    ghl.falla = false;
    expect((await ejecucionesDe(email2()))[0]).toMatchObject({ estado: "error", intentos: 5 });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ entrada: "WF agenda", lead: email2() });
  });
  it("sin GHL conectado, en real falla (no se pierde: queda para reintentar)", async () => {
    await db.from("workflow_ejecuciones").update({ estado: "esperando", intentos: 0, error: null, siguiente_en: new Date().toISOString() }).eq("lead_id", (await lead(email2())).id);
    await avanzarEjecuciones(e.proyecto.id, { ahora: dentroDe(1) });
    expect((await ejecucionesDe(email2()))[0]).toMatchObject({ estado: "esperando", intentos: 1, error: expect.stringMatching(/GHL/) });
  });
  it("«Mover en el dashboard» en real (Cristian, 7 nov): en su pipeline mueve el lead; en otro, su tarjeta", async () => {
    const l = await lead(email2());
    const columnas = Object.values(e.etapas) as string[];
    // Otro pipeline del proyecto con 2 columnas (la primera, por orden)
    const { data: p2 } = await db.from("pipelines").insert({ proyecto_id: e.proyecto.id, nombre: "Biblioteca test mover", orden: 9 }).select("id").single();
    const { data: cols } = await db.from("etapas").insert([{ pipeline_id: p2!.id, nombre: "Segunda", orden: 1 }, { pipeline_id: p2!.id, nombre: "Primera", orden: 0 }]).select("id, nombre");
    const primera = cols!.find((c) => c.nombre === "Primera")!.id;
    const pasos = [
      { id: "m1", tipo: "mover_dashboard", pipeline_id: e.pipeline.id, etapa_id: columnas[1] },
      { id: "m2", tipo: "mover_dashboard", pipeline_id: p2!.id, etapa_id: null },
    ];
    await db.from("leads").update({ pipeline_id: e.pipeline.id, etapa_id: columnas[0] }).eq("id", l.id);
    const { data: x } = await db.from("workflow_ejecuciones").insert({ workflow_id: workflowId, version: 1, pasos, proyecto_id: e.proyecto.id, lead_id: l.id, entrada_id: entradaId, siguiente_en: new Date().toISOString() }).select("id").single();
    await avanzarEjecuciones(e.proyecto.id, { ahora: dentroDe(2), ghl: conGhl });
    expect((await db.from("workflow_ejecuciones").select("estado, error").eq("id", x!.id).single()).data).toEqual({ estado: "ok", error: null });
    expect((await db.from("leads").select("pipeline_id, etapa_id").eq("id", l.id).single()).data).toEqual({ pipeline_id: e.pipeline.id, etapa_id: columnas[1] });
    expect((await db.from("tarjetas_extra").select("etapa_id").eq("lead_id", l.id).eq("pipeline_id", p2!.id).single()).data!.etapa_id).toBe(primera);
    await db.from("workflow_ejecuciones").delete().eq("id", x!.id);
  });
  it("«Mover» a un pipeline de otro proyecto: error, no se mueve", async () => {
    const l = await lead(email2());
    const otro = await crearEscenario();
    try {
      const { data: x } = await db.from("workflow_ejecuciones").insert({ workflow_id: workflowId, version: 1, pasos: [{ id: "m", tipo: "mover_dashboard", pipeline_id: otro.pipeline.id, etapa_id: null }], proyecto_id: e.proyecto.id, lead_id: l.id, entrada_id: entradaId, siguiente_en: new Date().toISOString() }).select("id").single();
      await avanzarEjecuciones(e.proyecto.id, { ahora: dentroDe(3), ghl: conGhl });
      expect((await db.from("workflow_ejecuciones").select("error").eq("id", x!.id).single()).data!.error).toMatch(/pipeline/);
      expect((await db.from("leads").select("pipeline_id").eq("id", l.id).single()).data!.pipeline_id).toBe(e.pipeline.id);
      await db.from("workflow_ejecuciones").delete().eq("id", x!.id);
    } finally {
      await borrarEscenario(otro);
    }
  });
});

describe("volver a lo de hoy", () => {
  it("la Entrada vuelve a mandar, el workflow se para y lo que esperaba lo manda el camino de hoy", async () => {
    // email2 tiene su ejecución esperando (de la prueba anterior)
    expect((await ejecucionesDe(email2()))[0].estado).toBe("esperando");
    como(e, e.p.ceo);
    expect(await devolverAHoy(workflowId)).toMatchObject({ ok: true });
    expect((await db.from("entradas").select("ghl_activo").eq("id", entradaId).single()).data!.ghl_activo).toBe(true);
    expect((await db.from("workflows").select("modo, encendido").eq("id", workflowId).single()).data).toEqual({ modo: "prueba", encendido: false });
    expect((await eventosDe(email2())).at(-1)!.ghl_estado).toBe("esperando");
    await avanzarEjecuciones(e.proyecto.id, { ahora: dentroDe(9999), ghl: conGhl });
    expect((await ejecucionesDe(email2()))[0].estado).toBe("parada");
  });
});
