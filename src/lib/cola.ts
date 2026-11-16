import { puntosLead } from "@/lib/prioridad";
import type { Pesos } from "@/lib/cualificacion";
import type { Lead, Respuesta } from "@/lib/tipos";
import { nombrePais } from "@/lib/formato";

// Cristian, 14 nov (Ola 2): Mis leads manda cada pregunta del formulario una sola vez (antes, repetida en cada lead);
// cada lead lleva [posición de la pregunta, respuesta]. Compacta el servidor y descompacta la cola, sin perder nada.
export type RespuestasCompactas = [pregunta: number, respuesta: string][];
export function compactarRespuestas<T extends { respuestas: Respuesta[] }>(leads: T[]) {
  const preguntas: string[] = [];
  const pos = new Map<string, number>();
  const filas = leads.map(({ respuestas, ...l }) => ({
    ...l,
    r: respuestas.map(({ pregunta, respuesta }): [number, string] => {
      let i = pos.get(pregunta);
      if (i === undefined) pos.set(pregunta, (i = preguntas.push(pregunta) - 1));
      return [i, respuesta];
    }),
  }));
  return { preguntas, filas };
}
export const descompactarRespuestas = (preguntas: string[], r: RespuestasCompactas): Respuesta[] => r.map(([i, respuesta]) => ({ pregunta: preguntas[i], respuesta }));

// C11 (plan Callers, 7 nov; 7c.1): la cola se filtra por columna con una fila de pastillas. «todos» = «Leads», toda la
// cola (no hay pastilla solo para los nuevos). Sin fechas (punto 11): el caller mira las columnas y elige a quién llamar.
// Orden por defecto: los que entraron más tarde arriba; las cabeceras (C2) cambian el orden (ordenarCola).
// La prioridad A/B/C se calcula aquí (puntos) para enseñarla y para ordenar por ella.
export function colaCaller<T extends Pick<Lead, "estado_caller" | "respuestas" | "creado_en">>(leads: T[], filtro: string, pesos: Pesos | null = null) {
  return leads
    .filter((l) => filtro === "todos" || l.estado_caller === filtro)
    .map((l) => ({ ...l, puntos: puntosLead(l.respuestas, pesos) }))
    .sort((a, b) => b.creado_en.localeCompare(a.creado_en));
}

// Cuántos leads hay en cada columna (para el número de cada pastilla)
export function cuentaPorEstado(leads: Pick<Lead, "estado_caller">[]) {
  const m: Record<string, number> = { todos: leads.length };
  for (const l of leads) m[l.estado_caller] = (m[l.estado_caller] ?? 0) + 1;
  return m;
}

// C2 (plan Callers, 7 nov; 7c.1): las cabeceras Nombre · País · Prioridad · Entró ordenan en el servidor, sobre
// todos los leads del caller y antes del corte de 300 (así «Prioridad» pone arriba todas las A). Sin orden elegido,
// se queda el de siempre (colaCaller). Un clic = dir 1: A→Z, las A primero, y en «Entró» los más recientes arriba.
export type CampoOrden = "nombre" | "pais" | "prio" | "entro";
export type OrdenCola = { campo: CampoOrden; dir: 1 | -1 };
const CAMPOS: CampoOrden[] = ["nombre", "pais", "prio", "entro"];

export function leerOrden(campo: unknown, dir: unknown): OrdenCola | null {
  if (typeof campo !== "string" || !CAMPOS.includes(campo as CampoOrden)) return null;
  return { campo: campo as CampoOrden, dir: dir === "desc" ? -1 : 1 };
}

const texto = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" });

export function ordenarCola<T extends Pick<Lead, "nombre" | "apellido" | "pais" | "creado_en"> & { puntos: number }>(leads: T[], orden: OrdenCola | null): T[] {
  if (!orden) return leads;
  const { campo, dir } = orden;
  const comparar = (a: T, b: T) => {
    if (campo === "nombre") return texto(`${a.nombre} ${a.apellido}`.trim(), `${b.nombre} ${b.apellido}`.trim());
    if (campo === "pais") return texto(nombrePais(a.pais), nombrePais(b.pais));
    if (campo === "prio") return b.puntos - a.puntos; // más puntos = A = arriba
    return b.creado_en.localeCompare(a.creado_en); // más recientes arriba
  };
  return [...leads].sort((a, b) => dir * comparar(a, b));
}

// R8 / A3-02 (Fase 1): el buscador de Mis leads, igual en el servidor (?q=) y en la pantalla. Sin tildes ni mayúsculas
// (como mismoNombre de formato.ts), sin espacios de más, y en teléfonos da igual «00» o «+», espacios o guiones.
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const digitos = (s: string) => s.replace(/\D/g, "").replace(/^00/, "");
export function buscaCola(l: Pick<Lead, "nombre" | "apellido" | "telefono">, q: string) {
  const t = sinTildes(q);
  if (!t) return true;
  if (sinTildes(`${l.nombre} ${l.apellido}`).includes(t)) return true;
  const d = /^[\d\s()+.-]+$/.test(t) ? digitos(t) : "";
  return !!d && digitos(l.telefono ?? "").includes(d);
}
