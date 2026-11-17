// Fase C (Cristian, 17 nov 2026): el reporte diario usa los mismos números que KPIs (calcularKpis), por mercado.
import { afterEach, describe, expect, it, vi } from "vitest";
import { armarReporte, textoReporte, ZONA_REPORTE } from "@/lib/reporte-diario";
import { calcularKpis } from "@/lib/kpis";
import { rangoDe } from "@/lib/formato";
import type { Base } from "@/lib/metricas";
import type { Mercado } from "@/lib/mercado";
import type { Avance } from "@/lib/objetivos";
import type { AvisoCeo } from "@/lib/avisos-ceo";
import { esCloser, type ParteReporte, type Perfil } from "@/lib/tipos";

const persona = (id: string, nombre: string, rol: Perfil["rol"]): Perfil =>
  ({ id, nombre, email: `${id}@t`, rol, telefono: null, whatsapp: null, admin_activo: false, onboarding_completo: true, activo: true }) as Perfil;

// 2 callers de España, 1 caller de USA y 1 closer de USA
const gente = [persona("cEs1", "Ana", "caller"), persona("cEs2", "Bea", "caller"), persona("cUs", "Carl", "caller"), persona("clUs", "Dan", "closer")];
const mercados: Record<string, Mercado> = { cEs1: "es", cEs2: "es", cUs: "latam", clUs: "latam" };

const act = (perfil: string, lead: string, creado_en: string, tipo = "llamada", resultado: string | null = "contestado") => ({ lead_id: lead, perfil_id: perfil, tipo, resultado, creado_en });
const base = (): Base => ({
  gente,
  leads: [],
  actividades: [
    // Ana: 2 botones al mismo lead el mismo día = 1 llamada
    act("cEs1", "L1", "2026-11-17T15:00:00Z"),
    act("cEs1", "L1", "2026-11-17T15:30:00Z", "whatsapp", null),
    act("cEs2", "L2", "2026-11-17T18:00:00Z"),
    // Carl (USA): 2 llamadas el 17 en Nueva York (la de las 23:00Z son las 18:00 allí) y 1 del 3 de noviembre
    act("cUs", "L3", "2026-11-17T14:00:00Z"),
    act("cUs", "L4", "2026-11-17T23:00:00Z"),
    act("cUs", "L5", "2026-11-03T15:00:00Z"),
  ],
  citas: [
    { id: "c1", lead_id: "L1", closer_id: null, agendada_por: "cEs1", fecha: "2026-11-19T16:00:00Z", estado: "pendiente", creado_en: "2026-11-17T16:00:00Z" },
    { id: "c3", lead_id: "L3", closer_id: "clUs", agendada_por: "cUs", fecha: "2026-11-20T16:00:00Z", estado: "pendiente", creado_en: "2026-11-17T14:30:00Z" },
  ],
  ventas: [
    // Dan (closer USA): 1 venta el 17 y 1 el 5 (con una cuota cobrada el 17)
    { id: "v1", lead_id: "L3", vendedor_id: "clUs", facturacion: 1000, cash_collected: 500, fecha: "2026-11-17T22:00:00Z", producto_id: null },
    { id: "v2", lead_id: "L9", vendedor_id: "clUs", facturacion: 2000, cash_collected: 1000, fecha: "2026-11-05T22:00:00Z", producto_id: null },
    // Carl: 1 low ticket el 17
    { id: "v3", lead_id: "L4", vendedor_id: "cUs", facturacion: 50, cash_collected: 50, fecha: "2026-11-17T20:00:00Z", producto_id: null },
  ],
  pagos: [{ importe: 200, fecha: "2026-11-17T21:00:00Z", venta_id: "v2" }],
});

// 21:00 en Nueva York del 17 de noviembre (EST, UTC−5)
const AHORA_USA = new Date("2026-11-18T02:00:00Z");
// 21:00 en Madrid del 17 de noviembre (CET, UTC+1)
const AHORA_ES = new Date("2026-11-17T20:00:00Z");
const avisos: AvisoCeo[] = [{ tipo: "envio_rojo", cuantos: 2, texto: "2 envío(s) en rojo que no llegaron a GHL" }];
const avance = (cifra: Avance["cifra"], hecho: number, meta: number): Avance => ({ objetivoId: `o-${cifra}`, cifra, periodo: "dia", etiqueta: "Hoy", meta, hecho, pct: (hecho / meta) * 100, dePersona: false });
const avances = new Map<string, Avance[]>([
  ["cUs", [avance("llamadas", 2, 10)]],
  ["cEs1", [avance("agendas", 1, 3)]],
]);

const armar = (mercado: "es" | "latam", ahora: Date) => armarReporte(base(), { mercado, mercados, zona: ZONA_REPORTE[mercado], ahora, avisos, avances });

// Lo que da KPIs con el mismo rango y la misma gente (rangoDe con el reloj puesto en `ahora`)
function deKpis(mercado: "es" | "latam", ahora: Date, periodo: "hoy" | "mes") {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(ahora);
  const zona = ZONA_REPORTE[mercado];
  const k = calcularKpis({ ...base(), gente: gente.filter((g) => mercados[g.id] === mercado) }, rangoDe(periodo, zona), zona);
  vi.useRealTimers();
  const lowTicket = k.callers.filter((c) => !esCloser(c.perfil)).reduce((s, c) => s + c.lowTicketVentas, 0);
  return { llamadas: k.totalCallers.llamadas, agendas: k.totalCallers.agendados, ventas: k.totalClosers.ventas + lowTicket, cash: k.totalClosers.cash };
}

afterEach(() => vi.useRealTimers());

describe("armarReporte: los números de KPIs, por mercado", () => {
  it("los totales del día y del mes son los de calcularKpis con el mismo rango y la misma gente (USA)", () => {
    const d = armar("latam", AHORA_USA);
    expect(d.dia).toEqual(deKpis("latam", AHORA_USA, "hoy"));
    expect(d.mes).toEqual(deKpis("latam", AHORA_USA, "mes"));
    // Y en cifras, para que no cuadren dos ceros: 2 llamadas, 1 agenda, 2 ventas (1 del closer + 1 low ticket), 500 + 200 de cash
    expect(d.dia).toEqual({ llamadas: 2, agendas: 1, ventas: 2, cash: 700 });
    expect(d.mes).toEqual({ llamadas: 3, agendas: 1, ventas: 3, cash: 1700 });
  });

  it("los totales del día de España cuadran con KPIs", () => {
    const d = armar("es", AHORA_ES);
    expect(d.dia).toEqual(deKpis("es", AHORA_ES, "hoy"));
    expect(d.dia).toEqual({ llamadas: 2, agendas: 1, ventas: 0, cash: 0 });
  });

  it("el caller de España no sale en el reporte de USA (ni en sus objetivos)", () => {
    const d = armar("latam", AHORA_USA);
    expect(d.personas.map((p) => p.nombre).sort()).toEqual(["Carl", "Dan"]);
    expect(d.objetivos.map((o) => o.nombre)).toEqual(["Carl"]);
    expect(d.personas.find((p) => p.nombre === "Carl")).toEqual({ nombre: "Carl", rol: "caller", llamadas: 2, agendas: 1, ventas: 1 });
    expect(d.personas.find((p) => p.nombre === "Dan")).toEqual({ nombre: "Dan", rol: "closer", llamadas: 0, agendas: 0, ventas: 1 });
    expect(armar("es", AHORA_ES).personas.map((p) => p.nombre).sort()).toEqual(["Ana", "Bea"]);
  });

  it("la fecha del reporte de USA a las 02:00Z del 18 es el 17 (día de Nueva York)", () => {
    expect(armar("latam", AHORA_USA).fecha).toBe("2026-11-17");
    expect(armar("es", AHORA_ES).fecha).toBe("2026-11-17");
  });

  it("va mal = el texto de los avisos del CEO", () => {
    expect(armar("latam", AHORA_USA).vaMal).toEqual(["2 envío(s) en rojo que no llegaron a GHL"]);
  });
});

describe("textoReporte", () => {
  const TODAS: ParteReporte[] = ["por_persona", "totales_dia", "totales_mes", "va_mal", "objetivos"];

  it("asunto con «USA» o «España» y la fecha DD/MM/AAAA", () => {
    expect(textoReporte(armar("latam", AHORA_USA), TODAS).asunto).toBe("Eternity · Reporte USA del 17/11/2026");
    expect(textoReporte(armar("es", AHORA_ES), TODAS).asunto).toBe("Eternity · Reporte España del 17/11/2026");
  });

  it("solo las partes elegidas: sin «objetivos» no sale «Objetivos»", () => {
    const con = textoReporte(armar("latam", AHORA_USA), TODAS);
    expect(con.texto).toContain("Objetivos");
    expect(con.html).toContain("Objetivos");
    const sin = textoReporte(armar("latam", AHORA_USA), ["por_persona", "totales_dia", "totales_mes", "va_mal"]);
    expect(sin.texto).not.toContain("Objetivos");
    expect(sin.html).not.toContain("Objetivos");
  });

  it("el texto lleva las cifras de cada parte", () => {
    const { texto, html } = textoReporte(armar("latam", AHORA_USA), TODAS);
    expect(texto).toContain("Carl");
    expect(texto).toContain("2 envío(s) en rojo");
    expect(texto).toContain("2 de 10");
    expect(html).toContain("<!doctype html>");
    const solo = textoReporte(armar("latam", AHORA_USA), ["totales_dia"]).texto;
    expect(solo).not.toContain("Carl");
    expect(solo).not.toContain("envío");
  });
});
