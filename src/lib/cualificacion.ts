// Cualificación (V2-10). Estudio: por cada respuesta del formulario, cuántos leads llegaron a llamada,
// cuántos cerraron y cuánto cash entró por llamada. Scoring: puntos por respuesta → nota de cada lead.
import { normal } from "@/lib/llamadas";

export type LeadQ = { id: string; respuestas: { pregunta: string; respuesta: string }[] | null };
type CitaQ = { lead_id: string; estado: string };
type VentaQ = { lead_id: string; cash_collected: number; devuelto: number | null; pagado: number };

const ASISTIDA = ["cerrada", "seguimiento", "perdida"]; // hubo llamada (igual que en Métricas)

type FilaEstudio = { pregunta: string; respuesta: string; leads: number; llamadas: number; cerradas: number; cierre: number; cash: number; cashPorLlamada: number };

export function estudioRespuestas(d: { leads: LeadQ[]; citas: CitaQ[]; ventas: VentaQ[] }, preguntas?: string[]) {
  const llamadas = new Map<string, number>();
  const cerrada = new Set<string>();
  for (const c of d.citas) {
    if (ASISTIDA.includes(c.estado)) llamadas.set(c.lead_id, (llamadas.get(c.lead_id) ?? 0) + 1);
    if (c.estado === "cerrada") cerrada.add(c.lead_id);
  }
  const cash = new Map<string, number>();
  for (const v of d.ventas) cash.set(v.lead_id, (cash.get(v.lead_id) ?? 0) + v.cash_collected + v.pagado - (v.devuelto ?? 0));
  const grupos = new Map<string, { pregunta: string; respuesta: string; leads: Set<string> }>();
  for (const l of d.leads)
    for (const r of l.respuestas ?? []) {
      if (!r?.pregunta || r.respuesta === undefined || r.respuesta === null) continue;
      const resp = String(r.respuesta).trim();
      if (!resp || (preguntas && !preguntas.includes(r.pregunta))) continue;
      const k = `${r.pregunta}\u0000${normal(resp)}`;
      const g = grupos.get(k) ?? { pregunta: r.pregunta, respuesta: resp, leads: new Set<string>() };
      g.leads.add(l.id);
      grupos.set(k, g);
    }
  return [...grupos.values()]
    .map((g): FilaEstudio => {
      const ids = [...g.leads];
      const ll = ids.reduce((s, id) => s + (llamadas.get(id) ?? 0), 0);
      const ce = ids.filter((id) => cerrada.has(id)).length;
      const ca = Math.round(ids.reduce((s, id) => s + (cash.get(id) ?? 0), 0) * 100) / 100;
      const conLlamada = ids.filter((id) => llamadas.has(id)).length;
      return { pregunta: g.pregunta, respuesta: g.respuesta, leads: ids.length, llamadas: ll, cerradas: ce, cierre: conLlamada ? Math.round((ce / conLlamada) * 100) : 0, cash: ca, cashPorLlamada: ll ? Math.round((ca / ll) * 100) / 100 : 0 };
    })
    .sort((a, b) => a.pregunta.localeCompare(b.pregunta) || b.cashPorLlamada - a.cashPorLlamada);
}

export const preguntasDe = (leads: LeadQ[]) => [...new Set(leads.flatMap((l) => (l.respuestas ?? []).map((r) => r?.pregunta).filter(Boolean)))].sort() as string[];

// Pesos {pregunta: {respuesta: puntos -10..10}} → nota del lead de 0 a 100 (50 = neutro)
export type Pesos = Record<string, Record<string, number>>;
export function notaLead(respuestas: LeadQ["respuestas"], pesos: Pesos) {
  let suma = 0;
  let max = 0;
  let encontradas = 0;
  for (const [pregunta, porRespuesta] of Object.entries(pesos)) {
    const valores = Object.values(porRespuesta);
    if (!valores.length) continue;
    max += Math.max(...valores.map((v) => Math.abs(v)), 1);
    const r = (respuestas ?? []).find((x) => x?.pregunta === pregunta);
    if (!r) continue;
    const clave = Object.keys(porRespuesta).find((k) => normal(k) === normal(String(r.respuesta).trim()));
    if (clave !== undefined) {
      suma += porRespuesta[clave];
      encontradas++;
    }
  }
  if (!encontradas || !max) return null;
  return Math.max(0, Math.min(100, Math.round(50 + (suma / max) * 50)));
}
