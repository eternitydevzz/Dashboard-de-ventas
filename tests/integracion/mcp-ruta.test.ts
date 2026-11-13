// MCP, Fase 2 (11 nov 2026): la ruta /api/mcp de punta a punta, sin servidor (plan en VENTAS/API-DASHBOARD/fase-2.md, Tarea 4)
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";
import { getSesion } from "@/lib/sesion";
import { sesionMcp } from "@/lib/mcp/sesion-mcp";
import { huellaClave } from "@/lib/mcp/clave";
import { POST } from "@/app/api/mcp/route";

let e: Escenario;
const DIRECTOR = `clave-dir-${Math.random().toString(36).slice(2)}`;
const CEO = `clave-ceo-${Math.random().toString(36).slice(2)}`;
const ANULADA = `clave-anulada-${Math.random().toString(36).slice(2)}`;

const llamar = (clave: string | null, cuerpo: object) =>
  POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(clave ? { Authorization: `Bearer ${clave}` } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...cuerpo }),
    })
  );
const herramienta = async (clave: string, name: string, args: object) => (await (await llamar(clave, { method: "tools/call", params: { name, arguments: args } })).json()).result;

beforeAll(async () => {
  e = await crearEscenario();
  await db.from("proyectos").insert({ nombre: `TEST-AUTO ${e.id} B` }); // el CEO tiene varios proyectos
  await db.from("claves_mcp").insert([
    { perfil_id: e.p.director.id, huella: huellaClave(DIRECTOR), nombre: "test" },
    { perfil_id: e.p.ceo.id, huella: huellaClave(CEO), nombre: "test" },
    { perfil_id: e.p.director.id, huella: huellaClave(ANULADA), nombre: "test", anulada_en: new Date().toISOString() },
  ]);
  vi.mocked(getSesion).mockImplementation(async () => {
    const s = sesionMcp();
    if (!s) throw new Error("Test sin sesión del MCP");
    return s;
  });
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("MCP: ruta /api/mcp", () => {
  it("sin clave o con una anulada, 401", async () => {
    expect((await llamar(null, { method: "tools/list" })).status).toBe(401);
    expect((await llamar(ANULADA, { method: "tools/list" })).status).toBe(401);
  });

  it("con clave, lista las herramientas", async () => {
    const r = await (await llamar(DIRECTOR, { method: "tools/list" })).json();
    expect(r.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(["agenda_citas", "agendar_cita", "anadir_nota", "asignar_leads", "borrar_leads", "borrar_miembro", "buscar_leads", "cambiar_estado", "crear_lead", "crear_miembro", "dar_de_baja_miembro", "duplicados", "enlace_grabacion", "etiquetas_leads", "ficha_lead", "finanzas", "funnel", "grabaciones_pendientes", "kpis", "mover_cita", "mover_leads", "objetivos", "ranking", "registrar_venta", "subir_transcripcion", "transcripciones"]);
  });

  it("asignar_leads con la clave de un director cambia el lead", async () => {
    const r = await herramienta(DIRECTOR, "asignar_leads", { leadIds: [e.leads.LeadLibre], caller: e.p.callerA.id });
    expect(r.isError).toBeFalsy();
    expect((await db.from("leads").select("caller_id").eq("id", e.leads.LeadLibre).single()).data!.caller_id).toBe(e.p.callerA.id);
  });

  it("el CEO con varios proyectos tiene que decir cuál", async () => {
    const sin = await herramienta(CEO, "kpis", {});
    expect(sin.isError).toBe(true);
    expect(sin.content[0].text).toMatch(/Di el proyecto/);
    const con = await herramienta(CEO, "kpis", { proyecto: e.proyecto.nombre });
    expect(con.isError).toBeFalsy();
    expect(JSON.parse(con.content[0].text).pantalla).toBe("KPIs → Por persona");
  });
});
