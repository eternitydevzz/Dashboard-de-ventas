// Paso 0.3 del plan: medir la velocidad con muchos leads. NO corre con `npm test`: solo con
//   MEDIR=1 npx vitest run tests/rendimiento            (por defecto 10.000 leads)
//   MEDIR=1 LEADS=30000 npx vitest run tests/rendimiento
// Crea un proyecto de prueba aparte con datos inventados (proporciones parecidas a Maestria),
// mide lo que cargan las pantallas que leen todo y lo borra todo al terminar.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendFileSync } from "node:fs";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";
import { cargarBase, calcularFunnel } from "@/lib/metricas";
import { cargarAgendas } from "@/lib/agendas-datos";
import { metricasAgendas } from "@/lib/metricas-agendas";
import { cargarFinanzas } from "@/lib/finanzas-datos";
import { resumenFinanzas } from "@/lib/finanzas";
import { guardarLeads } from "@/lib/leads";
import { rangoDe } from "@/lib/formato";
import { calcularKpis } from "@/lib/kpis";
import { cargarObjetivos, calcularAvances, panelObjetivos } from "@/lib/objetivos";

const N = Number(process.env.LEADS ?? 10_000);
const ZONA = "America/New_York";
let e: Escenario;
const tiempos: [string, number][] = [];

async function medir<T>(nombre: string, fn: () => Promise<T> | T): Promise<T> {
  const t0 = performance.now();
  const r = await fn();
  tiempos.push([nombre, Math.round(performance.now() - t0)]);
  return r;
}
async function enLotes(tabla: string, filas: Record<string, unknown>[]) {
  const ids: string[] = [];
  for (let i = 0; i < filas.length; i += 1000) {
    const { data, error } = await db.from(tabla).insert(filas.slice(i, i + 1000)).select("id");
    if (error) throw new Error(`${tabla}: ${error.message}`);
    ids.push(...(data ?? []).map((x) => x.id as string));
  }
  return ids;
}
const dia = (d: number) => new Date(Date.UTC(2026, 9, 10, 15) - d * 86_400_000).toISOString(); // hasta 1 año atrás

describe.skipIf(!process.env.MEDIR)(`Rendimiento con ${N} leads`, () => {
  beforeAll(async () => {
    e = await crearEscenario();
    const p = e.proyecto.id;
    const callers = [e.p.callerA.id, e.p.callerB.id, e.p.callerC.id];
    const closers = [e.p.closerA.id, e.p.closerB.id];
    const t0 = performance.now();
    const leads = await enLotes("leads", Array.from({ length: N }, (_, i) => ({ proyecto_id: p, nombre: `Rend ${i}`, email: `${e.pref}-r${i}@x.test`, telefono: `+1 555 ${String(i).padStart(7, "0")}`, caller_id: callers[i % 3], pipeline_id: e.pipeline.id, etapa_id: e.etapas.Nuevos, creado_en: dia(i % 365), respuestas: [{ pregunta: "Objetivo", respuesta: i % 2 ? "Vender más" : "Empezar" }] })));
    // 2 actividades por lead, 1 cita cada 3 leads, 1 venta cada 12, 1 cobro cada 2 ventas
    await enLotes("actividades", leads.flatMap((id, i) => [0, 1].map((k) => ({ proyecto_id: p, lead_id: id, perfil_id: callers[i % 3], tipo: "llamada", resultado: k ? "contestado" : "no_contesta", creado_en: dia(i % 365) }))));
    await enLotes("citas", leads.filter((_, i) => i % 3 === 0).map((id, i) => ({ proyecto_id: p, lead_id: id, closer_id: closers[i % 2], agendada_por: callers[i % 3], fecha: dia(i % 365), estado: ["cerrada", "perdida", "seguimiento", "no_show", "pendiente"][i % 5], creado_en: dia((i % 365) + 2) })));
    const ventas = await enLotes("ventas", leads.filter((_, i) => i % 12 === 0).map((id, i) => ({ proyecto_id: p, lead_id: id, producto_id: e.productos["Mentoría grupal"], vendedor_id: closers[i % 2], facturacion: 1997, cash_collected: 500, tipo_pago: "reserva", metodo: "stripe", fecha: dia(i % 365) })));
    await enLotes("pagos", ventas.filter((_, i) => i % 2 === 0).map((id, i) => ({ venta_id: id, importe: 300, metodo: "transferencia", fecha: dia(i % 300) })));
    tiempos.push([`(preparar ${N} leads y sus datos)`, Math.round(performance.now() - t0)]);
  }, 600_000);
  afterAll(async () => {
    if (e) await borrarEscenario(e);
    const texto = `=== Rendimiento con ${N} leads (ms) ===\n${tiempos.map(([n, t]) => `${String(t).padStart(7)}  ${n}`).join("\n")}\n`;
    console.log(texto);
    if (process.env.SALIDA) appendFileSync(process.env.SALIDA, texto + "\n"); // Vitest oculta los logs si todo pasa
  }, 600_000);

  it("Funnel y Ranking (cargan todo el proyecto y calculan en memoria)", async () => {
    const base = await medir("Funnel/Ranking: cargar datos", () => cargarBase(e.proyecto));
    expect(base.leads.length).toBeGreaterThanOrEqual(N); // + los 3 del escenario
    const anio = rangoDe("rango", ZONA, "2025-10-11", "2026-10-10"); // último año
    await medir("Funnel: calcular (año)", () => calcularFunnel(base, anio, null, ZONA));
    await medir("KPIs: calcular (año)", () => calcularKpis(base, anio, ZONA));
    // Objetivos (H3): uno de cada cifra para callers, closers y directores, por semana y por mes
    const cifras = ["llamadas", "contactados", "agendas", "citas_atendidas", "asistencias", "ventas", "facturacion", "cash"];
    await db.from("objetivos").insert(["caller", "closer", "director"].flatMap((rol) => ["semana", "mes"].flatMap((periodo) => cifras.map((cifra) => ({ proyecto_id: e.proyecto.id, rol, periodo, cifra, valor: 100 })))));
    await db.from("objetivos").insert(["llamadas", "contactados"].map((cifra) => ({ proyecto_id: e.proyecto.id, rol: "caller", periodo: "dia", cifra, valor: 1, dias: [1, 2, 3, 4, 5, 6, 7] })));
    const datos = await medir("Objetivos: cargar", () => cargarObjetivos(e.proyecto.id));
    await medir("Objetivos: avance de todos", () => calcularAvances(base, datos, base.gente, ZONA));
    await medir("Panel de un caller: suyo + racha + equipo", () => panelObjetivos(e.proyecto, e.p.callerA));
    await medir("Panel de un closer: suyo + equipo", () => panelObjetivos(e.proyecto, e.p.closerA));
  }, 300_000);

  it("Agendas (métricas)", async () => {
    const d = await medir("Agendas: cargar datos", () => cargarAgendas(e.proyecto));
    await medir("Agendas: calcular (año)", () => metricasAgendas(d, rangoDe("rango", ZONA, "2025-10-11", "2026-10-10"), { closerIds: d.gente.filter((g) => g.rol === "closer").map((g) => g.id) }));
  }, 300_000);

  it("Finanzas (resumen)", async () => {
    const f = await medir("Finanzas: cargar datos", () => cargarFinanzas(e.proyecto.id));
    await medir("Finanzas: calcular resumen (año)", () => resumenFinanzas(f, rangoDe("rango", ZONA, "2025-10-11", "2026-10-10"), ZONA));
  }, 300_000);

  it("Un envío de landing o webhook (busca solo por sus claves)", async () => {
    const r = await medir("Webhook: lead que ya existe", () => guardarLeads(e.proyecto, [{ ghl_contact_id: null, nombre: "", apellido: "", email: `${e.pref}-r${N - 1}@x.test`, telefono: null, etiquetas: [], respuestas: [], creado_en: null }], { pipelineId: null, origen: "ghl", perfilId: null, repartir: false }));
    expect(r.actualizados).toBe(1);
    await medir("Webhook: lead nuevo", () => guardarLeads(e.proyecto, [{ ghl_contact_id: null, nombre: "Nuevo", apellido: "", email: `${e.pref}-nuevo-rend@x.test`, telefono: null, etiquetas: [], respuestas: [], creado_en: null }], { pipelineId: null, origen: "ghl", perfilId: null, repartir: false }));
  }, 300_000);
});
