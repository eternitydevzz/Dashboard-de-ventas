// 1c (26 oct 2026): la pestaña «Leads» de KPIs pide todos los leads compactos. Solo CEO y directores; el embudo por
// lead sale de las llamadas y citas de verdad.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agendaPorLink, borrarEscenario, como, crearEscenario, db, falla, ok, type Escenario } from "../apoyo/escenario";
import { cargarLeadsPestana, cargarUtmsPestana } from "@/app/(panel)/kpis/acciones";
import { descompactarLeads, MARCA } from "@/lib/leads-vista";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("Pestaña Leads: datos", () => {
  it("un caller no puede pedirlos", async () => {
    como(e, e.p.callerA);
    await falla(cargarLeadsPestana(), /acceso|No tienes|permiso/i);
  });

  it("el director recibe todos los leads del proyecto, con sus 🔗 y su embudo", async () => {
    // LeadA: una llamada contestada · LeadB: agendado por link · LeadLibre: nada
    await db.from("actividades").insert({ proyecto_id: e.proyecto.id, lead_id: e.leads.LeadA, perfil_id: e.p.callerA.id, tipo: "llamada", resultado: "contestado" });
    await agendaPorLink(e, e.leads.LeadB, e.p.callerB, e.p.closerA.id, "2037-03-10T10:00");
    const { data: p2 } = await db.from("pipelines").insert({ proyecto_id: e.proyecto.id, nombre: "Leads WhatsApp test", orden: 5 }).select().single();
    const { data: et } = await db.from("etapas").insert({ pipeline_id: p2!.id, nombre: "Grupo 1", orden: 0 }).select().single();
    await db.from("tarjetas_extra").insert({ proyecto_id: e.proyecto.id, lead_id: e.leads.LeadA, pipeline_id: p2!.id, etapa_id: et!.id });

    como(e, e.p.director);
    const d = descompactarLeads(await ok(cargarLeadsPestana()));
    const de = (id: string) => d.leads.find((l) => l.id === id)!;
    expect(d.leads.map((l) => l.id).sort()).toEqual(Object.values(e.leads).sort());
    expect(de(e.leads.LeadA)).toMatchObject({ nombre: "LeadA", pipelineId: e.pipeline.id, etapaId: e.etapas.Nuevos, callerId: e.p.callerA.id, marcas: MARCA.contactado | MARCA.contesta, tarjetas: [{ pipelineId: p2!.id, etapaId: et!.id }] });
    expect(de(e.leads.LeadB).marcas).toBe(MARCA.contactado | MARCA.contesta | MARCA.agendado);
    expect(de(e.leads.LeadLibre).marcas).toBe(0);
    expect(d.pipelines.map((p) => p.id)).toEqual(expect.arrayContaining([e.pipeline.id, p2!.id]));
    expect(d.gente.map((g) => g.id)).toContain(e.p.callerA.id);
  });
});

describe("Pestaña UTMs: datos (B1)", () => {
  it("un caller no puede pedirlos", async () => {
    como(e, e.p.callerA);
    await falla(cargarUtmsPestana(), /acceso|No tienes|permiso/i);
  });

  it("el director recibe una fila por lead del proyecto", async () => {
    como(e, e.p.director);
    const filas = (await ok(cargarUtmsPestana())) as { id: string }[];
    expect(filas.map((l) => l.id).sort()).toEqual(Object.values(e.leads).sort());
  });
});
