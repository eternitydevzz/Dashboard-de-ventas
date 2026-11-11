// MCP, Fase 3 (11 nov 2026): herramientas para leer (plan en VENTAS/API-DASHBOARD/fase-3.md). Cada una frente a la misma
// función que usa su pantalla, con su periodo por defecto, sus filtros y sus permisos.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";
import { getSesion } from "@/lib/sesion";
import { conSesionMcp, sesionMcp } from "@/lib/mcp/sesion-mcp";
import { sesionMcpDe } from "@/lib/mcp/clave";
import { herramientaAgenda, herramientaBuscarLeads, herramientaFichaLead, herramientaFinanzas, herramientaFunnel, herramientaRanking } from "@/lib/mcp/lectura";
import { cargarBase, calcularFunnel } from "@/lib/metricas";
import { calcularKpis } from "@/lib/kpis";
import { rangoNav } from "@/lib/periodos";
import { rangoDe } from "@/lib/formato";
import { cargarFinanzas } from "@/lib/finanzas-datos";
import { resumenFinanzas } from "@/lib/finanzas";
import type { Perfil } from "@/lib/tipos";

let e: Escenario;
let zona: string;
const como = async <T,>(p: Perfil, fn: () => Promise<T>) => conSesionMcp(await sesionMcpDe(p.id, e.proyecto.id), fn);
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();

beforeAll(async () => {
  e = await crearEscenario();
  zona = e.proyecto.zona_horaria;
  vi.mocked(getSesion).mockImplementation(async () => {
    const s = sesionMcp();
    if (!s) throw new Error("Test sin sesión del MCP");
    return s;
  });
  const pid = e.proyecto.id;
  // Algo que contar: llamadas de los callers, una cita de hoy (pendiente), una pasada sin resultado y otra cerrada
  await db.from("actividades").insert([
    { proyecto_id: pid, lead_id: e.leads.LeadA, perfil_id: e.p.callerA.id, tipo: "llamada", creado_en: hace(0) },
    { proyecto_id: pid, lead_id: e.leads.LeadB, perfil_id: e.p.callerB.id, tipo: "llamada", creado_en: hace(0) },
  ]);
  await db.from("citas").insert([
    { proyecto_id: pid, lead_id: e.leads.LeadA, closer_id: e.p.closerA.id, agendada_por: e.p.callerA.id, fecha: new Date(Date.now() + 3_600_000).toISOString(), estado: "pendiente" },
    { proyecto_id: pid, lead_id: e.leads.LeadB, closer_id: e.p.closerA.id, agendada_por: e.p.callerB.id, fecha: hace(1), estado: "pendiente" },
    { proyecto_id: pid, lead_id: e.leads.LeadLibre, closer_id: e.p.closerB.id, agendada_por: e.p.callerA.id, fecha: hace(1), estado: "cerrada" },
  ]);
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("MCP: funnel", () => {
  it("da lo mismo que KPIs → Funnel (mes) y filtra por vendedor por su nombre", async () => {
    const r = await como(e.p.director, () => herramientaFunnel({}));
    const base = await cargarBase(e.proyecto);
    const esperado = calcularFunnel(base, rangoDe("mes", zona), null, zona, null);
    expect(r.pantalla).toBe("KPIs → Funnel");
    expect([r.totalLeads, r.agendados, r.ventas, r.facturacion, r.cash, r.tasas]).toEqual([esperado.totalLeads, esperado.agendados, esperado.ventas, esperado.facturacion, esperado.cash, esperado.tasas]);
    const v = await como(e.p.director, () => herramientaFunnel({ vendedor: e.p.callerA.nombre }));
    const caller = base.gente.find((g) => g.id === e.p.callerA.id)!;
    expect(v.llamadas).toBe(calcularFunnel(base, rangoDe("mes", zona), caller, zona, null).llamadas);
    expect(v.vendedor).toBe(e.p.callerA.nombre);
  });

  it("un caller no ve el Funnel (como en la app)", async () => {
    await expect(como(e.p.callerA, () => herramientaFunnel({}))).rejects.toThrow(/No tienes acceso|solo para el CEO/);
  });
});

describe("MCP: ranking", () => {
  it("mismo orden y cifras que Ranking (semana)", async () => {
    const r = await como(e.p.director, () => herramientaRanking({}));
    const { callers } = calcularKpis(await cargarBase(e.proyecto), rangoDe("semana", zona), zona);
    const orden = [...callers].sort((x, y) => y.agendados - x.agendados || y.cerrados - x.cerrados || y.llamadas - x.llamadas);
    expect(r.periodo).toBe("Esta semana");
    expect(r.callers.map((c) => [c.nombre, c.agendados, c.llamadas])).toEqual(orden.map((c) => [c.perfil.nombre, c.agendados, c.llamadas]));
    expect(r.callers[0].puesto).toBe(1);
  });
});

describe("MCP: finanzas", () => {
  it("el CEO recibe lo mismo que Finanzas → Resumen (mes), con los cobros por día en lista", async () => {
    const r = await como(e.p.ceo, () => herramientaFinanzas({}));
    const esperado = resumenFinanzas(await cargarFinanzas(e.proyecto.id), rangoNav("mes", 0, zona), zona);
    expect([r.facturacion, r.cash, r.profit, r.porCobrar]).toEqual([esperado.facturacion, esperado.cash, esperado.profit, esperado.porCobrar]);
    expect(Array.isArray(r.cobrosPorDia)).toBe(true);
    expect(r.cobrosPorDia.length).toBe(esperado.porDia.size);
  });

  it("un director sin la sección Finanzas no la ve (por defecto no la tiene)", async () => {
    await expect(como(e.p.director, () => herramientaFinanzas({}))).rejects.toThrow(/No tienes acceso a esta sección/);
  });
});

describe("MCP: buscar_leads", () => {
  it("por texto, sin caller y con límite", async () => {
    const t = await como(e.p.director, () => herramientaBuscarLeads({ texto: "leada" }));
    expect(t.leads.map((l) => l.id)).toEqual([e.leads.LeadA]);
    const sin = await como(e.p.director, () => herramientaBuscarLeads({ caller: null }));
    expect(sin.leads.map((l) => l.id)).toContain(e.leads.LeadLibre);
    expect(sin.leads.map((l) => l.id)).not.toContain(e.leads.LeadA);
    const uno = await como(e.p.director, () => herramientaBuscarLeads({ limite: 1 }));
    expect(uno.mostrados).toBe(1);
    expect(uno.total).toBeGreaterThanOrEqual(3);
  });

  it("sin actividad en 7 días: fuera los que tienen una de hoy", async () => {
    const r = await como(e.p.director, () => herramientaBuscarLeads({ sinActividadDias: 7 }));
    const ids = r.leads.map((l) => l.id);
    expect(ids).not.toContain(e.leads.LeadA);
    expect(ids).toContain(e.leads.LeadLibre);
  });

  it("un pipeline en «Sin acceso» para el director no sale", async () => {
    await db.from("permisos_pipeline").insert({ pipeline_id: e.pipeline.id, perfil_id: e.p.director.id, nivel: "sin_acceso" });
    const r = await como(e.p.director, () => herramientaBuscarLeads({}));
    expect(r.leads.map((l) => l.id)).not.toContain(e.leads.LeadA);
    await db.from("permisos_pipeline").delete().eq("pipeline_id", e.pipeline.id).eq("perfil_id", e.p.director.id);
  });
});

describe("MCP: ficha_lead", () => {
  it("trae los datos, el historial y las citas", async () => {
    const r = await como(e.p.director, () => herramientaFichaLead({ leadId: e.leads.LeadA }));
    expect(r.id).toBe(e.leads.LeadA);
    expect(r.caller).toBe(e.p.callerA.nombre);
    expect(r.historial.length).toBeGreaterThan(0);
    expect(r.citas.length).toBe(1);
  });

  it("un lead inventado no da datos", async () => {
    await expect(como(e.p.director, () => herramientaFichaLead({ leadId: "00000000-0000-0000-0000-000000000000" }))).rejects.toThrow(/No puedes ver este lead/);
  });
});

describe("MCP: agenda_citas", () => {
  it("las citas del mes, sin resultado y los contadores", async () => {
    const mes = await como(e.p.director, () => herramientaAgenda({}));
    expect(mes.citas.map((c) => c.leadId)).toContain(e.leads.LeadA);
    const sin = await como(e.p.director, () => herramientaAgenda({ sinResultado: true, periodo: "anio" }));
    expect(sin.citas.map((c) => c.leadId)).toEqual([e.leads.LeadB]); // la pasada y pendiente; no la cerrada ni la de dentro de 1 h
    expect(mes.contadores.pendientes).toBe(2);
    const anterior = await como(e.p.director, () => herramientaAgenda({ n: -1, periodo: "anio" }));
    expect(anterior.citas.map((c) => c.leadId)).not.toContain(e.leads.LeadA);
  });
});
