// Paso H7 + Paso 0 (decisiones de Cristian del 10 oct 2026): un solo CRM con los pipelines del equipo, como GHL.
// Pipelines de origen (columnas por nombre) · «Callers» (leads con caller, por su llamada) · «Closers» (Pre-call y
// Post-call) · permisos por pipeline: Editar / Ver / Sin acceso, por rol o por persona.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, falla, ok, type Escenario } from "../apoyo/escenario";
import { borrarPipeline, crearEtapa, guardarPermisoPipeline, moverCitaColumna, moverLead, unirEstado } from "@/app/(panel)/crm/acciones";
import { agendarCita, registrarLlamada, volverANuevo } from "@/app/(panel)/leads/acciones";
import { cambiarEstadoCita } from "@/app/(panel)/closer/acciones";

let e: Escenario;
let callers: string; // pipeline «Callers»
let closers: string; // pipeline «Closers»
const col = async (pipeline: string, nombre: string) => (await db.from("etapas").select("id").eq("pipeline_id", pipeline).eq("nombre", nombre).single()).data!.id as string;
const lead = async (id: string) => (await db.from("leads").select("etapa_id, etapa_callers_id").eq("id", id).single()).data!;

beforeAll(async () => {
  e = await crearEscenario();
  await db.from("leads").update({ pipeline_id: e.pipeline.id, etapa_id: e.etapas.Nuevos }).in("id", [e.leads.LeadA, e.leads.LeadB]);
  const { data } = await db.from("pipelines").select("id, tipo").eq("proyecto_id", e.proyecto.id);
  callers = data!.find((p) => p.tipo === "callers")!.id;
  closers = data!.find((p) => p.tipo === "closers")!.id;
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("Pipelines del equipo", () => {
  it("al crear un proyecto se crean «Callers» y «Closers» con sus columnas unidas, y no se pueden borrar", async () => {
    const { data: c } = await db.from("etapas").select("nombre, estado_caller").eq("pipeline_id", callers).order("orden");
    expect(c!.map((x) => x.estado_caller)).toEqual(["nuevo", "llamado", "wsp_enviado", "no_responde", "no_interesa", "seguimiento", "llamar_luego", "agendado", "confirma_agenda", "reagendado", "descartado", "vendido"]); // C11: 12
    const { data: k } = await db.from("etapas").select("columna_cita").eq("pipeline_id", closers).order("orden");
    expect(k!.map((x) => x.columna_cita)).toEqual(["pendiente", "confirmacion_pendiente", "confirmada", "no_califica", "pendientes", "reagendadas", "reserva", "cuotas", "cerradas", "seguimiento", "no_show", "cancelada", "perdida"]);
    como(e, e.p.ceo);
    await falla(borrarPipeline(callers), /no borrar/);
  });
});

describe("Uniones de columnas", () => {
  it("solo en «Callers» y «Closers»; solo con «Editar»; un estado, una columna", async () => {
    como(e, e.p.closerA);
    await falla(unirEstado(await col(callers, "Leads"), "nuevo"), /acceso|permiso/);
    como(e, e.p.director); // sin Administración: «Ver»
    await falla(crearEtapa(callers, "Libre", "#7c3aed"), /permiso/);
    como(e, e.p.directorAdmin);
    await falla(unirEstado(e.etapas.Nuevos, "nuevo"), /Callers/); // pipeline de origen
    await ok(crearEtapa(callers, "Libre", "#7c3aed"));
    const libre = await col(callers, "Libre");
    await falla(unirEstado(libre, "llamado"), /ya está unida/);
    await falla(unirEstado(libre, "no_contesta"), /no válido/); // C11: ya no existe
    await falla(unirEstado(libre, "inventado"), /no válido/);
    await ok(crearEtapa(closers, "Revisar", "#7c3aed"));
    await falla(unirEstado(await col(closers, "Revisar"), "nuevo"), /no válido/); // en «Closers», estados de la cita
  });
});

describe("Los botones del caller", () => {
  it("en «Callers» la tarjeta va sola a su columna; en el de origen, por el nombre (como antes del H7)", async () => {
    como(e, e.p.callerA);
    await ok(registrarLlamada(e.leads.LeadA, "llamado", ""));
    expect(await lead(e.leads.LeadA)).toEqual({ etapa_id: e.etapas.Nuevos, etapa_callers_id: await col(callers, "Llamado") });
    await ok(volverANuevo(e.leads.LeadA));
    expect((await lead(e.leads.LeadA)).etapa_callers_id).toBe(await col(callers, "Leads"));
    // C11: «Seguimiento» (el de origen no tiene esa columna) y agenda un jefe
    await ok(registrarLlamada(e.leads.LeadA, "seguimiento", "", 4));
    expect(await lead(e.leads.LeadA)).toEqual({ etapa_id: e.etapas.Nuevos, etapa_callers_id: await col(callers, "Seguimiento") });
    como(e, e.p.director);
    await ok(agendarCita(e.leads.LeadA, e.p.closerA.id, "2026-11-20T16:00", "", 4));
    expect(await lead(e.leads.LeadA)).toEqual({ etapa_id: e.etapas.Agendados, etapa_callers_id: await col(callers, "Agendado") });
  });
});

describe("Arrastrar en «Callers»", () => {
  it("cada uno los suyos; a una columna libre sí; a una unida a otro estado, solo con su botón", async () => {
    const libre = await col(callers, "Libre");
    como(e, e.p.callerA);
    await ok(moverLead(e.leads.LeadA, libre));
    expect(await lead(e.leads.LeadA)).toEqual({ etapa_id: e.etapas.Agendados, etapa_callers_id: libre }); // el de origen no cambia
    await falla(moverLead(e.leads.LeadA, await col(callers, "Llamado")), /unida a un estado/);
    await falla(moverLead(e.leads.LeadB, libre), /no está asignado a ti/);
    await ok(moverLead(e.leads.LeadA, await col(callers, "Agendado"))); // la de su mismo estado: sí
  });
});

describe("Permisos por pipeline (como GHL)", () => {
  it("solo el admin los cambia; el closer no ve «Callers» hasta que se lo dan; manda la persona", async () => {
    como(e, e.p.director);
    await falla(guardarPermisoPipeline(callers, { rol: "closer" }, "ver"), /permiso/);
    como(e, e.p.closerA); // LeadA tiene a closerA desde que se agendó
    await falla(moverLead(e.leads.LeadA, await col(callers, "Libre")), /No tienes acceso/);
    como(e, e.p.directorAdmin);
    await ok(guardarPermisoPipeline(callers, { perfilId: e.p.closerA.id }, "ver"));
    como(e, e.p.closerA);
    await ok(moverLead(e.leads.LeadA, await col(callers, "Libre")));
    como(e, e.p.directorAdmin);
    await ok(guardarPermisoPipeline(e.pipeline.id, { rol: "caller" }, "sin_acceso"));
    await ok(guardarPermisoPipeline(e.pipeline.id, { perfilId: e.p.callerA.id }, "editar")); // la persona manda
    como(e, e.p.callerB);
    await falla(moverLead(e.leads.LeadB, e.etapas.Cerrados), /No tienes acceso/);
    como(e, e.p.callerA);
    await ok(crearEtapa(e.pipeline.id, "De Carla", "#7c3aed"));
    await falla(crearEtapa(callers, "No", "#7c3aed"), /permiso/); // en «Callers» solo «Ver»
    como(e, e.p.directorAdmin);
    await falla(guardarPermisoPipeline(callers, { perfilId: e.p.ceo.id }, "ver"), /CEO/);
    await falla(guardarPermisoPipeline(callers, { rol: "caller" }, "todo"), /no válido/);
    await ok(guardarPermisoPipeline(e.pipeline.id, { rol: "caller" }, null)); // lo de siempre
    como(e, e.p.callerB);
    await ok(moverLead(e.leads.LeadB, e.etapas.Cerrados));
  });
});

describe("«Closers»: columnas libres", () => {
  it("la cita se queda en la libre hasta que cambia su estado; a una unida, con su botón", async () => {
    const { data: cita } = await db.from("citas").select("id").eq("lead_id", e.leads.LeadA).single();
    const revisar = await col(closers, "Revisar");
    como(e, e.p.closerB);
    await falla(moverCitaColumna(cita!.id, revisar), /no es tuya/);
    como(e, e.p.closerA);
    await falla(moverCitaColumna(cita!.id, await col(closers, "Confirmado")), /unida a un estado/);
    await ok(moverCitaColumna(cita!.id, revisar));
    const donde = async () => (await db.from("citas").select("etapa_closers_id").eq("id", cita!.id).single()).data!.etapa_closers_id;
    expect(await donde()).toBe(revisar);
    await ok(cambiarEstadoCita(cita!.id, "confirmada", ""));
    expect(await donde()).toBeNull(); // vuelve a «Confirmado»
    await ok(moverCitaColumna(cita!.id, revisar));
    await ok(moverCitaColumna(cita!.id, null)); // de vuelta a la de su estado
    expect(await donde()).toBeNull();
  });
});
