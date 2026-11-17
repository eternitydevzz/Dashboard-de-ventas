// Periodos navegables (v2): Día / Semana / Mes / Año / Personalizado, con ‹ › para ir atrás y adelante.
// `n` = cuántos periodos se mueve respecto al actual (0 = el actual, -1 = el anterior…).
import { fechaReal, hoyEnZona, inicioDia, sumarDias, type Rango } from "@/lib/formato";

export type PeriodoNav = "dia" | "semana" | "mes" | "anio" | "rango";
export const PERIODOS_NAV: { v: PeriodoNav; t: string }[] = [
  { v: "dia", t: "Día" },
  { v: "semana", t: "Semana" },
  { v: "mes", t: "Mes" },
  { v: "anio", t: "Año" },
  { v: "rango", t: "Personalizado" },
];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function sumarMeses(ymd: string, meses: number) {
  const d = new Date(`${ymd.slice(0, 8)}01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}
const corta = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1].slice(0, 3)}`;

export { fechaReal }; // vive en formato.ts para que rangoDe también la use (sin importación circular)

export function leerPeriodo(sp: Record<string, string | string[] | undefined>, porDefecto: PeriodoNav = "mes") {
  const v = typeof sp.p === "string" ? sp.p : porDefecto;
  const periodo = (PERIODOS_NAV.some((x) => x.v === v) ? v : porDefecto) as PeriodoNav;
  const n = Math.max(-600, Math.min(600, Math.trunc(Number(sp.n ?? 0)) || 0));
  const fecha = (k: string) => (fechaReal(sp[k]) ? (sp[k] as string) : undefined);
  return { periodo, n, desde: fecha("desde"), hasta: fecha("hasta") };
}

export function rangoNav(periodo: PeriodoNav, n: number, zona: string, desdeTxt?: string, hastaTxt?: string): Rango {
  const hoy = hoyEnZona(zona);
  const t = tramo(periodo, n, hoy, desdeTxt, hastaTxt);
  const desde = inicioDia(t.d, zona);
  const hasta = inicioDia(t.h, zona);
  // A5-07 (17 nov): el anterior de un mes es el mes anterior entero (con la duración, junio comparaba desde el 2 de mayo).
  // Un rango personalizado no tiene «anterior» natural: la misma duración justo antes.
  const previo = t.personalizado
    ? new Date(desde.getTime() - (hasta.getTime() - desde.getTime()))
    : inicioDia(tramo(periodo, n - 1, hoy).d, zona);
  return { desde, hasta, etiqueta: t.etiqueta, previo: { desde: previo, hasta: desde } };
}

function tramo(periodo: PeriodoNav, n: number, hoy: string, desdeTxt?: string, hastaTxt?: string) {
  let d: string;
  let h: string;
  let etiqueta: string;
  // El MCP llama aquí sin pasar por leerPeriodo: también se comprueba la fecha
  let personalizado = false;
  if (periodo === "rango" && fechaReal(desdeTxt) && fechaReal(hastaTxt)) {
    personalizado = true;
    const [a, b] = desdeTxt <= hastaTxt ? [desdeTxt, hastaTxt] : [hastaTxt, desdeTxt]; // A2-02 (Cristian, 17 nov): al revés, se dan la vuelta
    d = a;
    h = sumarDias(b, 1);
    etiqueta = `Del ${corta(a)} al ${corta(b)}`;
  } else if (periodo === "dia") {
    d = sumarDias(hoy, n);
    h = sumarDias(d, 1);
    etiqueta = n === 0 ? "Hoy" : n === -1 ? "Ayer" : n === 1 ? "Mañana" : corta(d);
  } else if (periodo === "semana") {
    const dow = (new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0
    d = sumarDias(sumarDias(hoy, -dow), 7 * n);
    h = sumarDias(d, 7);
    etiqueta = n === 0 ? "Esta semana" : n === -1 ? "Semana pasada" : `Semana del ${corta(d)}`;
  } else if (periodo === "anio") {
    const y = Number(hoy.slice(0, 4)) + n;
    d = `${y}-01-01`;
    h = `${y + 1}-01-01`;
    etiqueta = n === 0 ? "Este año" : String(y);
  } else {
    d = sumarMeses(hoy, n);
    h = sumarMeses(d, 1);
    const nombre = MESES[Number(d.slice(5, 7)) - 1];
    etiqueta = n === 0 ? "Este mes" : `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${d.slice(0, 4)}`;
  }
  return { d, h, etiqueta, personalizado };
}

export function enRango(iso: string | null | undefined, r: { desde: Date | null; hasta: Date | null }) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return (!r.desde || t >= r.desde.getTime()) && (!r.hasta || t < r.hasta.getTime());
}
