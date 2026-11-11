// MCP, Fases 4 y 5 (11 nov 2026): herramientas para cambiar (con vista previa y confirmar) y de grabaciones.
// Plan en VENTAS/API-DASHBOARD/API-dashboard.md. Cada herramienta llama a la acción de la app: aquí se comprueba que
// la vista previa no cambia nada, que con confirmar sí, y los permisos.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";
import { getSesion } from "@/lib/sesion";
import { conSesionMcp, sesionMcp } from "@/lib/mcp/sesion-mcp";
import { sesionMcpDe } from "@/lib/mcp/clave";
import { herramientaAsignar } from "@/lib/mcp/herramientas";
import { herramientaAgendar, herramientaBorrar, herramientaCrearLead, herramientaEstado, herramientaEtiquetas, herramientaMover, herramientaNota, herramientaVenta } from "@/lib/mcp/cambiar";
import { herramientaGrabacionesPendientes, herramientaSubirTranscripcion, herramientaTranscripciones } from "@/lib/mcp/grabaciones";
import type { Perfil } from "@/lib/tipos";

let e: Escenario;
const como = async <T,>(p: Perfil, fn: () => Promise<T>) => conSesionMcp(await sesionMcpDe(p.id, e.proyecto.id), fn);
const lead = async (id: string) => (await db.from("leads").select("*").eq("id", id).maybeSingle()).data;
const previa = (r: unknown) => (r as { vistaPrevia?: boolean }).vistaPrevia === true;

beforeAll(async () => {
  e = await crearEscenario();
  vi.mocked(getSesion).mockImplementation(async () => {
    const s = sesionMcp();
    if (!s) throw new Error("Test sin sesión del MCP");
    return s;
  });
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("MCP: varios leads piden confirmar", () => {
  it("mover: uno va directo; dos, vista previa sin cambios y después con confirmar", async () => {
    await como(e.p.director, () => herramientaMover({ leadIds: [e.leads.LeadA], pipeline: e.pipeline.id, columna: "Agendados" }));
    expect((await lead(e.leads.LeadA))!.etapa_id).toBe(e.etapas.Agendados);
    const v = await como(e.p.director, () => herramientaMover({ leadIds: [e.leads.LeadA, e.leads.LeadB], pipeline: "Pipeline test", columna: "cerrados" }));
    expect(previa(v)).toBe(true);
    expect((await lead(e.leads.LeadB))!.etapa_id).toBe(e.etapas.Nuevos);
    await como(e.p.director, () => herramientaMover({ leadIds: [e.leads.LeadA, e.leads.LeadB], pipeline: "Pipeline test", columna: "cerrados", confirmar: true }));
    expect((await lead(e.leads.LeadB))!.etapa_id).toBe(e.etapas.Cerrados);
  });

  it("asignar varios: vista previa y después con confirmar", async () => {
    const v = await como(e.p.director, () => herramientaAsignar({ leadIds: [e.leads.LeadA, e.leads.LeadB], closer: e.p.closerA.id }));
    expect(previa(v)).toBe(true);
    expect((await lead(e.leads.LeadA))!.closer_id).toBeNull();
    await como(e.p.director, () => herramientaAsignar({ leadIds: [e.leads.LeadA, e.leads.LeadB], closer: e.p.closerA.id, confirmar: true }));
    expect((await lead(e.leads.LeadB))!.closer_id).toBe(e.p.closerA.id);
  });

  it("etiquetas en un lead, directo", async () => {
    await como(e.p.director, () => herramientaEtiquetas({ leadIds: [e.leads.LeadA], anadir: ["mcp-test"] }));
    expect((await lead(e.leads.LeadA))!.etiquetas).toContain("mcp-test");
  });
});

describe("MCP: crear, estado y nota", () => {
  it("crea un lead y devuelve su id", async () => {
    const r = await como(e.p.director, () => herramientaCrearLead({ nombre: "Nuevo MCP", email: `${e.pref}-mcp@x.test` }));
    expect(r.leadId).toBeTruthy();
    expect((await lead(r.leadId!))!.origen).toBe("manual");
  });

  it("cambia el estado como el botón de la ficha y apunta la nota", async () => {
    await como(e.p.director, () => herramientaEstado({ leadId: e.leads.LeadLibre, estado: "no_responde" }));
    expect((await lead(e.leads.LeadLibre))!.estado_caller).toBe("no_responde");
    await como(e.p.director, () => herramientaNota({ leadId: e.leads.LeadLibre, nota: "nota desde el MCP" }));
    const { data } = await db.from("actividades").select("nota").eq("lead_id", e.leads.LeadLibre).eq("tipo", "nota");
    expect(data!.map((x) => x.nota)).toContain("nota desde el MCP");
  });
});

describe("MCP: borrar, agendar y vender siempre piden confirmar", () => {
  it("borrar: vista previa sin cambios; un director no puede; el CEO sí y se salta los que tienen cita", async () => {
    const { data: n1 } = await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre: "Borrar1", email: `${e.pref}-b1@x.test` }).select("id").single();
    const v = await como(e.p.ceo, () => herramientaBorrar({ leadIds: [n1!.id] }));
    expect(previa(v)).toBe(true);
    expect(await lead(n1!.id)).not.toBeNull();
    await expect(como(e.p.director, () => herramientaBorrar({ leadIds: [n1!.id], confirmar: true }))).rejects.toThrow(/No tienes permiso/);
    await db.from("citas").insert({ proyecto_id: e.proyecto.id, lead_id: e.leads.LeadB, closer_id: e.p.closerA.id, fecha: new Date().toISOString() });
    const r = await como(e.p.ceo, () => herramientaBorrar({ leadIds: [n1!.id, e.leads.LeadB], confirmar: true }));
    expect(r).toEqual({ hecho: "Borrados 1; saltados 1 (con citas o ventas)." });
    expect(await lead(n1!.id)).toBeNull();
    expect(await lead(e.leads.LeadB)).not.toBeNull();
  });

  it("agendar: vista previa sin cita; con confirmar, la cita existe", async () => {
    const fecha = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10) + "T10:00";
    const v = await como(e.p.director, () => herramientaAgendar({ leadId: e.leads.LeadA, closer: e.p.closerB.nombre, fecha }));
    expect(previa(v)).toBe(true);
    const antes = (await db.from("citas").select("id").eq("lead_id", e.leads.LeadA).eq("closer_id", e.p.closerB.id)).data!.length;
    expect(antes).toBe(0);
    await como(e.p.director, () => herramientaAgendar({ leadId: e.leads.LeadA, closer: e.p.closerB.nombre, fecha, confirmar: true }));
    expect((await db.from("citas").select("id").eq("lead_id", e.leads.LeadA).eq("closer_id", e.p.closerB.id)).data!.length).toBe(1);
  });

  it("vender: vista previa sin venta; con confirmar, la venta existe y el lead pasa a vendido", async () => {
    const args = { leadId: e.leads.LeadA, producto: "Low ticket", facturacion: 47, cash: 47, tipoPago: "completo" as const, metodo: "stripe" as const };
    const v = await como(e.p.director, () => herramientaVenta(args));
    expect(previa(v)).toBe(true);
    expect((await db.from("ventas").select("id").eq("lead_id", e.leads.LeadA)).data!.length).toBe(0);
    await como(e.p.director, () => herramientaVenta({ ...args, confirmar: true }));
    expect((await db.from("ventas").select("id").eq("lead_id", e.leads.LeadA)).data!.length).toBe(1);
    expect((await lead(e.leads.LeadA))!.estado_caller).toBe("vendido");
  });
});

describe("MCP: grabaciones", () => {
  it("lista las pendientes, guarda la transcripción y la devuelve para analizar", async () => {
    const { data: g } = await db.from("grabaciones_caller").insert({ proyecto_id: e.proyecto.id, lead_id: e.leads.LeadLibre, perfil_id: e.p.callerA.id, archivo_path: `${e.proyecto.id}/test.webm`, duracion_seg: 90 }).select("id").single();
    const p = await como(e.p.director, () => herramientaGrabacionesPendientes({}));
    expect(p.grabaciones.map((x) => x.id)).toContain(g!.id);
    await como(e.p.director, () => herramientaSubirTranscripcion({ grabacionId: g!.id, texto: "Hola, ¿qué tal? Te llamo por la biblioteca." }));
    const p2 = await como(e.p.director, () => herramientaGrabacionesPendientes({}));
    expect(p2.grabaciones.map((x) => x.id)).not.toContain(g!.id);
    const t = await como(e.p.director, () => herramientaTranscripciones({ fuente: "callers", persona: e.p.callerA.nombre }));
    expect(t.llamadas[0].texto).toContain("biblioteca");
  });

  it("un caller no trabaja con transcripciones", async () => {
    await expect(como(e.p.callerA, () => herramientaGrabacionesPendientes({}))).rejects.toThrow(/Solo el CEO y los directores|No tienes acceso/);
  });
});
