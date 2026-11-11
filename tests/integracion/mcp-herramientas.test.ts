// MCP, Fase 2 (11 nov 2026): herramientas `kpis` y `asignar_leads` (plan en VENTAS/API-DASHBOARD/fase-2.md, Tarea 3)
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";
import { getSesion } from "@/lib/sesion";
import { conSesionMcp, sesionMcp } from "@/lib/mcp/sesion-mcp";
import { sesionMcpDe } from "@/lib/mcp/clave";
import { herramientaAsignar, herramientaKpis } from "@/lib/mcp/herramientas";
import { cargarBase } from "@/lib/metricas";
import { calcularKpis } from "@/lib/kpis";
import { rangoNav } from "@/lib/periodos";
import type { Perfil } from "@/lib/tipos";

let e: Escenario;
const como = async <T,>(p: Perfil, fn: () => Promise<T>) => conSesionMcp(await sesionMcpDe(p.id, e.proyecto.id), fn);
const lead = async (id: string) => (await db.from("leads").select("caller_id, closer_id").eq("id", id).single()).data!;

beforeAll(async () => {
  e = await crearEscenario();
  // El setup simula getSesion: aquí devuelve la sesión del MCP, como en la app
  vi.mocked(getSesion).mockImplementation(async () => {
    const s = sesionMcp();
    if (!s) throw new Error("Test sin sesión del MCP");
    return s;
  });
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("MCP: kpis", () => {
  it("da las mismas cifras que KPIs → Por persona (mes)", async () => {
    const r = await como(e.p.director, () => herramientaKpis({}));
    const z = e.proyecto.zona_horaria;
    const esperado = calcularKpis(await cargarBase(e.proyecto), rangoNav("mes", 0, z), z);
    expect(r.pantalla).toBe("KPIs → Por persona");
    expect(r.periodo).toBe("Este mes");
    expect(r.callers.map((c) => [c.id, c.llamadas, c.contactados, c.agendados])).toEqual(esperado.callers.map((c) => [c.perfil.id, c.llamadas, c.contactados, c.agendados]));
    expect(r.closers.map((c) => [c.id, c.citas, c.cerradas, c.facturacion])).toEqual(esperado.closers.map((c) => [c.perfil.id, c.citas, c.cerradas, c.facturacion]));
  });
});

describe("MCP: asignar_leads", () => {
  it("asigna por nombre y lo apunta en el historial", async () => {
    expect(await como(e.p.director, () => herramientaAsignar({ leadIds: [e.leads.LeadLibre], caller: e.p.callerB.nombre.toUpperCase() }))).toEqual({ asignados: 1 });
    expect((await lead(e.leads.LeadLibre)).caller_id).toBe(e.p.callerB.id);
    const { data } = await db.from("actividades").select("tipo").eq("lead_id", e.leads.LeadLibre).eq("tipo", "asignacion");
    expect(data!.length).toBeGreaterThan(0);
  });

  it("con null, desasigna", async () => {
    await como(e.p.director, () => herramientaAsignar({ leadIds: [e.leads.LeadLibre], caller: null }));
    expect((await lead(e.leads.LeadLibre)).caller_id).toBeNull();
  });

  it("con dos personas del mismo nombre, no asigna y pregunta", async () => {
    await db.from("perfiles").update({ nombre: e.p.callerA.nombre }).eq("id", e.p.callerC.id);
    await expect(como(e.p.director, () => herramientaAsignar({ leadIds: [e.leads.LeadLibre], caller: e.p.callerA.nombre }))).rejects.toThrow(/Hay 2 personas/);
    expect((await lead(e.leads.LeadLibre)).caller_id).toBeNull();
    await db.from("perfiles").update({ nombre: "Test callerc" }).eq("id", e.p.callerC.id);
  });

  it("un lead de otro proyecto no se toca", async () => {
    await expect(como(e.p.director, () => herramientaAsignar({ leadIds: [e.leads.LeadLibre, "00000000-0000-0000-0000-000000000000"], caller: e.p.callerB.id }))).rejects.toThrow(/no son de/);
    expect((await lead(e.leads.LeadLibre)).caller_id).toBeNull();
  });

  it("un caller no puede asignar (como en la app)", async () => {
    await expect(como(e.p.callerA, () => herramientaAsignar({ leadIds: [e.leads.LeadLibre], caller: e.p.callerB.id }))).rejects.toThrow(/No tienes permiso|No tienes acceso/);
    expect((await lead(e.leads.LeadLibre)).caller_id).toBeNull();
  });
});
