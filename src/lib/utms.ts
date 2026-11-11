// B1 (plan GHL): pestaña «UTMs» de KPIs. Cálculo puro (sin base): filas, filtros y totales de los leads ya cargados.
import { sumarDias } from "@/lib/formato";
import type { Barra } from "@/components/barras";
export const SIN_DATO = "Sin dato";
export const CAMPOS_UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type CampoUtm = (typeof CAMPOS_UTM)[number];
export type Clave = CampoUtm | "landing" | "etiqueta";

// `marcas`: las del embudo de KPIs → Leads (lib/leads-vista.ts, MARCA), para el embudo por utm_source (rediseño, 11 nov 2026)
export type FilaUtm = Record<CampoUtm, string> & { id: string; nombre: string; alta: number; landing: string; etiquetas: string[]; marcas: number };
export type FiltroUtm = Record<Clave, string> & { desde: number | null; hasta: number | null }; // "" = todos

// Landing = ruta de page_url (sin dominio ni parámetros); si no hay, la Entrada por la que llegó el lead
export function landingDe(pageUrl: string | undefined, entrada: string | undefined) {
  if (pageUrl) {
    try {
      return new URL(/^https?:\/\//i.test(pageUrl) ? pageUrl : `https://${pageUrl}`).pathname;
    } catch {
      // page_url roto: se usa la Entrada
    }
  }
  return entrada || SIN_DATO;
}

type LeadBase = { id: string; nombre: string | null; apellido: string | null; creado_en: string; etiquetas: string[] | null; seguimiento: Record<string, string> | null };
export function filaUtm(l: LeadBase, entrada?: string, marcas = 0): FilaUtm {
  const s = l.seguimiento ?? {};
  return {
    id: l.id,
    nombre: `${l.nombre ?? ""} ${l.apellido ?? ""}`.trim(),
    alta: Date.parse(l.creado_en),
    landing: landingDe(s.page_url, entrada),
    etiquetas: l.etiquetas ?? [],
    marcas,
    utm_source: s.utm_source ?? "",
    utm_medium: s.utm_medium ?? "",
    utm_campaign: s.utm_campaign ?? "",
    utm_content: s.utm_content ?? "",
    utm_term: s.utm_term ?? "",
  };
}

// Los valores de una fila para una clave (las etiquetas pueden ser varias; sin valor = «Sin dato»)
function valores(f: FilaUtm, clave: Clave): string[] {
  if (clave === "etiqueta") return f.etiquetas.length ? [...new Set(f.etiquetas)] : [SIN_DATO];
  return [f[clave] || SIN_DATO];
}

export function filtrarUtms(filas: FilaUtm[], f: FiltroUtm) {
  const claves: Clave[] = ["landing", "etiqueta", ...CAMPOS_UTM];
  return filas.filter(
    (x) => (f.desde === null || x.alta >= f.desde) && (f.hasta === null || x.alta < f.hasta) && claves.every((c) => !f[c] || valores(x, c).includes(f[c]))
  );
}

// Cuántos leads hay por cada valor, de más a menos (un lead cuenta en cada etiqueta que tiene)
export function totalesPor(filas: FilaUtm[], clave: Clave) {
  const m = new Map<string, number>();
  for (const x of filas) for (const v of valores(x, clave)) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([t, n]) => ({ t, n })).sort((a, b) => b.n - a.n);
}

// ---------- Rediseño de la pestaña (maqueta v1, Cristian 11 nov 2026) ----------
// Leads por día, contados en la hora del proyecto, del primer día (`desde` o el del primer lead) al último (`hasta`,
// sin incluir, o ahora). Los días sin leads salen a 0 para que la línea no se salte días.
export function porDiaUtm(filas: FilaUtm[], desde: number | null, hasta: number | null, zona: string) {
  if (!filas.length) return [];
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: zona });
  const ymd = (ms: number) => dia.format(new Date(ms));
  const cuenta = new Map<string, number>();
  for (const f of filas) cuenta.set(ymd(f.alta), (cuenta.get(ymd(f.alta)) ?? 0) + 1);
  const primero = ymd(desde ?? Math.min(...filas.map((f) => f.alta)));
  const ultimo = ymd((hasta ?? Date.now()) - 1);
  const out: { d: string; n: number }[] = [];
  for (let d = primero; d <= ultimo && out.length < 3660; d = sumarDias(d, 1)) out.push({ d: `${d.slice(8, 10)}/${d.slice(5, 7)}`, n: cuenta.get(d) ?? 0 });
  return out;
}

// Un día con más del triple que el segundo aplasta el gráfico: se corta un 15 % por encima del segundo (y ese día lleva
// su número en una etiqueta). Decisión de Cristian (11 nov 2026) por el pico del 26/10 (2182 leads en un día).
export function corteGrafico(valores: number[]) {
  const o = [...valores].sort((a, b) => b - a);
  if (o.length < 2 || !o[1] || o[0] <= o[1] * 3) return null;
  return Math.ceil(o[1] * 1.15);
}

// Campañas de más a menos, sin «Sin dato» (va aparte); el % es sobre los leads que tienen campaña
export function rankingCampanas(filas: FilaUtm[], max: number): Barra[] {
  const con = totalesPor(filas, "utm_campaign").filter((x) => x.t !== SIN_DATO);
  const total = con.reduce((s, x) => s + x.n, 0);
  return con.slice(0, max).map((x) => ({ t: x.t, n: x.n, pct: total ? Math.round((x.n / total) * 1000) / 10 : 0 }));
}
