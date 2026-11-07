// C11 (plan Callers, 7 nov): 12 columnas del pipeline «Callers». Sustituye a link-enviado.test.ts («Link enviado»
// desapareció). Contra la base local de GitHub, con todas las migraciones (también 20261107150200).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { borrarEscenario, como, crearEscenario, db, falla, ok, type Escenario } from "../apoyo/escenario";
import { agendarCita, confirmarAgenda, registrarLlamada } from "@/app/(panel)/leads/acciones";
import { POST } from "@/app/api/webhooks/ghl/[proyectoId]/route";
import { guardarLinkAgenda } from "@/app/(panel)/admin/acciones";

let e: Escenario;
let secreto: string;
beforeAll(async () => {
  e = await crearEscenario();
  secreto = (await db.from("proyectos").select("webhook_secreto").eq("id", e.proyecto.id).single()).data!.webhook_secreto;
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

const enviar = (cuerpo: unknown) =>
  POST(
    new NextRequest(`http://localhost/api/webhooks/ghl/${e.proyecto.id}?secreto=${secreto}`, { method: "POST", body: JSON.stringify(cuerpo), headers: { "content-type": "application/json" } }),
    { params: Promise.resolve({ proyectoId: e.proyecto.id }) } as never
  );
const lead = async (id: string) => (await db.from("leads").select("estado_caller, closer_id, estrellas_caller").eq("id", id).single()).data!;
const citaDe = async (id: string) => (await db.from("citas").select("id, agendada_por, closer_id, origen, estrellas_caller, estado").eq("lead_id", id).order("creado_en", { ascending: false }).limit(1).single()).data!;
const TODO = { semana: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, [{ desde: "00:00", hasta: "24:00" }]])), fechas: {} };
// Revisión del 7 nov: el caller solo agenda en horas libres del closer, así que el closer de la prueba tiene horario
const rotacion = (perfilId: string, pct: number) => db.from("miembros_proyecto").update({ rotacion_pct: pct, rotacion_cuenta: 0, horario: TODO }).eq("proyecto_id", e.proyecto.id).eq("perfil_id", perfilId);

describe("La base solo acepta los 12 estados", () => {
  it("los viejos «no_contesta» y «link_enviado» se rechazan", async () => {
    const { error } = await db.from("leads").update({ estado_caller: "no_contesta" }).eq("id", e.leads.LeadA);
    expect(error?.message).toMatch(/estado_caller_check/);
    const { error: e2 } = await db.from("leads").update({ estado_caller: "link_enviado" }).eq("id", e.leads.LeadA);
    expect(e2?.message).toMatch(/estado_caller_check/);
  });
});

describe("«Agendado» a mano por el caller (punto 13)", () => {
  it("sin closers en la rotación, avisa y no crea nada", async () => {
    como(e, e.p.callerA);
    await falla(agendarCita(e.leads.LeadA, "", "2026-12-01T10:00", "", 4), /rotación/);
  });
  it("con la rotación, el closer lo pone la app aunque se intente otro; estrellas obligatorias", async () => {
    await rotacion(e.p.closerA.id, 100);
    await rotacion(e.p.closerB.id, 0);
    como(e, e.p.callerA);
    await falla(agendarCita(e.leads.LeadA, e.p.closerB.id, "2026-12-01T10:00", ""), /de 2 a 5/);
    await ok(agendarCita(e.leads.LeadA, e.p.closerB.id, "2026-12-01T10:00", "Le interesa el VIP", 4));
    expect(await citaDe(e.leads.LeadA)).toMatchObject({ closer_id: e.p.closerA.id, agendada_por: e.p.callerA.id, estrellas_caller: 4 });
    expect(await lead(e.leads.LeadA)).toMatchObject({ estado_caller: "agendado", closer_id: e.p.closerA.id });
    const { data: m } = await db.from("miembros_proyecto").select("rotacion_cuenta").eq("proyecto_id", e.proyecto.id).eq("perfil_id", e.p.closerA.id).single();
    expect(m!.rotacion_cuenta).toBe(1);
  });
  it("la misma hora ya cogida no se puede volver a agendar (huecos del calendario)", async () => {
    como(e, e.p.callerA);
    await falla(agendarCita(e.leads.LeadA, "", "2026-12-01T10:00", "", 4), /ya no está libre/);
  });
  it("«Confirma Agenda» confirma también la cita (punto 14)", async () => {
    como(e, e.p.callerA);
    await ok(confirmarAgenda(e.leads.LeadA));
    expect((await lead(e.leads.LeadA)).estado_caller).toBe("confirma_agenda");
    expect((await citaDe(e.leads.LeadA)).estado).toBe("confirmada");
    como(e, e.p.callerB);
    await falla(confirmarAgenda(e.leads.LeadA), /no está asignado a ti/);
  });
});

describe("Cita que llega de GHL", () => {
  it("la agenda es del caller del lead (punto 10); sin caller, de nadie", async () => {
    como(e, e.p.callerB);
    await ok(registrarLlamada(e.leads.LeadB, "seguimiento", "", 3));
    expect((await enviar({ tipo: "cita_agendada", email: `${e.pref}-lb@x.test`, fecha: "2026-12-03T15:00:00Z" })).status).toBe(200);
    expect(await citaDe(e.leads.LeadB)).toMatchObject({ agendada_por: e.p.callerB.id, estrellas_caller: 3 });
    expect((await enviar({ tipo: "cita_agendada", email: `${e.pref}-ll@x.test`, fecha: "2026-12-04T15:00:00Z" })).status).toBe(200);
    expect((await citaDe(e.leads.LeadLibre)).agendada_por).toBeNull();
  });
});

describe("Link de agenda del proyecto", () => {
  it("solo un administrador lo guarda, y solo con https", async () => {
    como(e, e.p.callerA);
    await falla(guardarLinkAgenda("https://api.leadconnectorhq.com/widget/booking/abc"));
    como(e, e.p.ceo);
    await falla(guardarLinkAgenda("http://inseguro.test/agenda"), /https/);
    await ok(guardarLinkAgenda("https://api.leadconnectorhq.com/widget/booking/abc"));
    await ok(guardarLinkAgenda(""));
    expect((await db.from("proyectos").select("link_agenda").eq("id", e.proyecto.id).single()).data!.link_agenda).toBeNull();
  });
});
