import { calcularKpis } from "@/lib/kpis";
import { dinero, rangoDe, sumarDias } from "@/lib/formato";
import { plantillaEmail } from "@/lib/plantilla-email";
import { urlApp } from "@/lib/email";
import { CIFRAS } from "@/lib/objetivos-constantes";
import { esCloser, type MercadoReporte, type ParteReporte } from "@/lib/tipos";
import type { Base } from "@/lib/metricas";
import type { Mercado } from "@/lib/mercado";
import type { AvisoCeo } from "@/lib/avisos-ceo";
import type { Avance } from "@/lib/objetivos";

// Fase C (Cristian, 17 nov 2026): el contenido del reporte diario de España (21:00 de Madrid) y de USA (21:00 de
// Nueva York). Sin base de datos: los números salen de calcularKpis (los mismos que KPIs) con la gente de su mercado
// (Jose, D4: callers y closers de ese mercado). La carga está en reporte-diario-datos.ts; el envío, en otro sitio.

export const ZONA_REPORTE: Record<MercadoReporte, string> = { es: "Europe/Madrid", latam: "America/New_York" };
export const NOMBRE_REPORTE: Record<MercadoReporte, string> = { es: "España", latam: "USA" };
// Supuesto (sin verificar con Cristian): España en euros y USA en dólares; DatosReporte no lleva la moneda del proyecto
const MONEDA_REPORTE = { es: { moneda: "EUR" }, latam: { moneda: "USD" } } as const;

type Totales = { llamadas: number; agendas: number; ventas: number; cash: number };
export type DatosReporte = {
  mercado: MercadoReporte;
  fecha: string; // «YYYY-MM-DD», el día en la zona del reporte
  personas: { nombre: string; rol: "caller" | "closer"; llamadas: number; agendas: number; ventas: number }[];
  dia: Totales;
  mes: Totales;
  vaMal: string[];
  objetivos: { nombre: string; cifra: string; hecho: number; meta: number }[];
};

// El día de `ahora` en la zona (a las 02:00Z del 18 de noviembre, en Nueva York aún es el 17)
export const fechaReporte = (ahora: Date, zona: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(ahora);

// Los mismos rangos que «hoy» y «mes» de rangoDe, pero del día de `ahora` y no del reloj (igual que tramosDe en objetivos.ts)
function rangosDe(fecha: string, zona: string) {
  const primero = `${fecha.slice(0, 8)}01`;
  const sig = new Date(`${primero}T12:00:00Z`);
  sig.setUTCMonth(sig.getUTCMonth() + 1);
  const ultimo = sumarDias(sig.toISOString().slice(0, 10), -1);
  return { dia: rangoDe("rango", zona, fecha, fecha), mes: rangoDe("rango", zona, primero, ultimo) };
}

type Kpis = ReturnType<typeof calcularKpis>;
// Ventas = las de los closers + el low ticket de los callers que no son también closers (sus ventas ya están en closers)
function totales(k: Kpis): Totales {
  const lowTicket = k.callers.filter((c) => !esCloser(c.perfil)).reduce((s, c) => s + c.lowTicketVentas, 0);
  return { llamadas: k.totalCallers.llamadas, agendas: k.totalCallers.agendados, ventas: k.totalClosers.ventas + lowTicket, cash: k.totalClosers.cash };
}

// Por persona (Cristian: las llamadas solo de callers): callers con llamadas, agendas y low ticket; closers con sus ventas
function porPersona(k: Kpis): DatosReporte["personas"] {
  const orden = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es");
  const callers = k.callers.map((c) => ({ nombre: c.perfil.nombre, rol: "caller" as const, llamadas: c.llamadas, agendas: c.agendados, ventas: c.lowTicketVentas }));
  const closers = k.closers.map((c) => ({ nombre: c.perfil.nombre, rol: "closer" as const, llamadas: 0, agendas: 0, ventas: c.ventas }));
  return [...callers.sort(orden), ...closers.sort(orden)];
}

const nombreCifra = (c: Avance["cifra"]) => CIFRAS.find((x) => x.v === c)?.t ?? c;

// `avances`: lo que devuelve calcularAvances (perfil_id → sus avances); solo entran los de la gente del reporte
export function armarReporte(
  base: Base,
  o: { mercado: MercadoReporte; mercados: Record<string, Mercado>; zona: string; ahora: Date; avisos: AvisoCeo[]; avances: Map<string, Avance[]> }
): DatosReporte {
  const gente = base.gente.filter((g) => (g.rol === "caller" || g.rol === "closer") && o.mercados[g.id] === o.mercado);
  const delMercado = { ...base, gente };
  const fecha = fechaReporte(o.ahora, o.zona);
  const r = rangosDe(fecha, o.zona);
  const hoy = calcularKpis(delMercado, r.dia, o.zona);
  const mes = calcularKpis(delMercado, r.mes, o.zona);
  const objetivos = gente.flatMap((g) =>
    (o.avances.get(g.id) ?? []).map((a) => ({ nombre: g.nombre, cifra: `${nombreCifra(a.cifra)} · ${a.etiqueta}`, hecho: a.hecho, meta: a.meta }))
  );
  return { mercado: o.mercado, fecha, personas: porPersona(hoy), dia: totales(hoy), mes: totales(mes), vaMal: o.avisos.map((a) => a.texto), objetivos };
}

// ---------- Texto y HTML ----------

const ORDEN: ParteReporte[] = ["por_persona", "totales_dia", "totales_mes", "va_mal", "objetivos"];
const TITULO: Record<ParteReporte, string> = {
  por_persona: "Por persona (hoy)",
  totales_dia: "Totales del día",
  totales_mes: "Totales del mes",
  va_mal: "Lo que va mal",
  objetivos: "Objetivos",
};

const num = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 2 });
const ddmmaaaa = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

function lineasTotales(t: Totales, d: DatosReporte) {
  return [`Llamadas: ${num(t.llamadas)}`, `Agendas: ${num(t.agendas)}`, `Ventas: ${num(t.ventas)}`, `Cash: ${dinero(t.cash, MONEDA_REPORTE[d.mercado])}`];
}

function lineasPersona(p: DatosReporte["personas"][number]) {
  if (p.rol === "closer") return `${p.nombre} (closer): ${num(p.ventas)} venta(s)`;
  return `${p.nombre} (caller): ${num(p.llamadas)} llamada(s) · ${num(p.agendas)} agenda(s) · ${num(p.ventas)} venta(s)`;
}

// Las líneas de cada parte; si no hay nada, una frase en vez de una sección vacía
function lineasDe(parte: ParteReporte, d: DatosReporte): string[] {
  const oVacio = (l: string[], vacio: string) => (l.length ? l : [vacio]);
  switch (parte) {
    case "por_persona":
      return oVacio(d.personas.map(lineasPersona), "Nadie del equipo en este mercado");
    case "totales_dia":
      return lineasTotales(d.dia, d);
    case "totales_mes":
      return lineasTotales(d.mes, d);
    case "va_mal":
      return oVacio(d.vaMal, "Nada que avisar");
    case "objetivos":
      return oVacio(
        d.objetivos.map((o) => `${o.nombre} · ${o.cifra}: ${num(o.hecho)} de ${num(o.meta)}`),
        "Sin objetivos puestos"
      );
  }
}

export function textoReporte(d: DatosReporte, partes: ParteReporte[]): { asunto: string; texto: string; html: string } {
  const nombre = NOMBRE_REPORTE[d.mercado];
  const fecha = ddmmaaaa(d.fecha);
  const asunto = `Eternity · Reporte ${nombre} del ${fecha}`;
  const secciones = ORDEN.filter((p) => partes.includes(p)).map((p) => ({ titulo: TITULO[p], lineas: lineasDe(p, d) }));
  const intro = `Día ${fecha} (hora de ${d.mercado === "es" ? "Madrid" : "Nueva York"}). Mismos números que KPIs.`;
  const texto = [`Reporte ${nombre} · ${fecha}`, intro, ...secciones.map((s) => `\n${s.titulo}\n${s.lineas.map((l) => `- ${l}`).join("\n")}`)].join("\n");
  const html = plantillaEmail({
    urlBase: urlApp(),
    titulo: `Reporte ${nombre} · ${fecha}`,
    intro,
    filas: secciones.map((s): [string, string] => [s.titulo, s.lineas.join("\n")]),
    boton: { texto: "Ver KPIs", url: `${urlApp()}/kpis` },
    pie: "Reporte automático de la app de ventas de Eternity.",
  });
  return { asunto, texto, html };
}
