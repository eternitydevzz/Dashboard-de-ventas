// B1 (plan GHL): pestaña «UTMs» de KPIs. Cálculo puro (sin base): filas, filtros y totales de los leads ya cargados.
export const SIN_DATO = "Sin dato";
export const CAMPOS_UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type CampoUtm = (typeof CAMPOS_UTM)[number];
export type Clave = CampoUtm | "landing" | "etiqueta";

export type FilaUtm = Record<CampoUtm, string> & { id: string; nombre: string; alta: number; landing: string; etiquetas: string[] };
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
export function filaUtm(l: LeadBase, entrada?: string): FilaUtm {
  const s = l.seguimiento ?? {};
  return {
    id: l.id,
    nombre: `${l.nombre ?? ""} ${l.apellido ?? ""}`.trim(),
    alta: Date.parse(l.creado_en),
    landing: landingDe(s.page_url, entrada),
    etiquetas: l.etiquetas ?? [],
    utm_source: s.utm_source ?? "",
    utm_medium: s.utm_medium ?? "",
    utm_campaign: s.utm_campaign ?? "",
    utm_content: s.utm_content ?? "",
    utm_term: s.utm_term ?? "",
  };
}

// Los valores de una fila para una clave (las etiquetas pueden ser varias; sin valor = «Sin dato»)
function valores(f: FilaUtm, clave: Clave): string[] {
  if (clave === "etiqueta") return f.etiquetas.length ? f.etiquetas : [SIN_DATO];
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
