import { telefonoClave } from "@/lib/leads";

// D2 (plan GHL 4.3): posibles duplicados por teléfono (últimas 9 cifras, `telefonoClave`). Cada grupo trae sus leads
// del más antiguo al más nuevo: el primero es el que se queda al unir (D1: `unir_leads` rechaza si queda el más nuevo).
export type LeadTel = { id: string; telefono: string | null; creado_en: string };

export function agruparDuplicados<T extends LeadTel>(leads: T[]): { clave: string; leads: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const l of leads) {
    const clave = telefonoClave(l.telefono);
    if (clave.length >= 6) grupos.set(clave, [...(grupos.get(clave) ?? []), l]); // menos de 6 cifras no identifica a nadie
  }
  return [...grupos]
    .filter(([, ls]) => ls.length > 1)
    .map(([clave, ls]) => ({ clave, leads: ls.toSorted((a, b) => a.creado_en.localeCompare(b.creado_en) || a.id.localeCompare(b.id)) }));
}
