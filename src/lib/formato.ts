import { ETIQUETA_ESTADO } from "@/lib/estados-caller";
import type { Proyecto } from "@/lib/tipos";
import { ErrorUsuario } from "@/lib/error-usuario";

const LOCALE = { USD: "en-US", EUR: "es-ES" } as const;

// Lo único del proyecto que puede llegar al navegador de cualquier usuario (barra lateral).
// Nunca el secreto del webhook ni la URL de avisos.
export type ProyectoMenu = Pick<Proyecto, "id" | "nombre" | "color">;
export function proyectoParaMenu(p: Proyecto): ProyectoMenu {
  return { id: p.id, nombre: p.nombre, color: p.color };
}

export function dinero(valor: number, proyecto: Pick<Proyecto, "moneda">, decimales = 0) {
  return new Intl.NumberFormat(LOCALE[proyecto.moneda], {
    style: "currency",
    currency: proyecto.moneda,
    maximumFractionDigits: decimales,
    minimumFractionDigits: decimales,
  }).format(valor);
}

export function fechaHora(iso: string, proyecto: Pick<Proyecto, "zona_horaria">) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: proyecto.zona_horaria,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function fecha(iso: string, proyecto: Pick<Proyecto, "zona_horaria">) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: proyecto.zona_horaria,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function porcentaje(parte: number, total: number) {
  if (!total) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

// Porcentaje como en España (decisión de Cristian, 9 oct 2026): coma decimal y espacio duro antes del % → «66,7 %»
export function pct(n: number | string | null | undefined, decimales = 1) {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v.toLocaleString("es-ES", { maximumFractionDigits: decimales })}\u00a0%`;
}

// Primera letra entera: con letras «especiales» o emojis (2 unidades UTF-16), `p[0]` se queda con media letra
// y el servidor y el navegador la pintan distinto (error #418 de React, 13 nov).
export const primeraLetra = (p: string) => Array.from(p)[0] ?? "";

export function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => primeraLetra(p).toUpperCase())
    .join("");
}

// ---------- Periodos ----------
export type Periodo = "hoy" | "semana" | "mes" | "todo" | "rango";

// Fecha "YYYY-MM-DD" de hoy en la zona del proyecto.
export function hoyEnZona(zona: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date());
}

// Desplazamiento (en minutos) de una zona para una fecha concreta.
function offsetMin(zona: string, d: Date) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    timeZoneName: "longOffset",
  }).formatToParts(d);
  const tz = partes.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = tz.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  const signo = m[1] === "-" ? -1 : 1;
  return signo * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

// Inicio del día "YYYY-MM-DD" en la zona dada, como Date UTC.
export function inicioDia(ymd: string, zona: string) {
  const base = new Date(`${ymd}T00:00:00Z`);
  return new Date(base.getTime() - offsetMin(zona, base) * 60_000);
}

export function sumarDias(ymd: string, dias: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export type Rango = { desde: Date | null; hasta: Date | null; etiqueta: string; previo: { desde: Date; hasta: Date } | null };

export function rangoDe(periodo: Periodo, zona: string, desdeTxt?: string, hastaTxt?: string): Rango {
  const hoy = hoyEnZona(zona);
  if (periodo === "todo") return { desde: null, hasta: null, etiqueta: "Todo el histórico", previo: null };
  let d: string;
  let h: string;
  let etiqueta: string;
  if (periodo === "hoy") {
    d = hoy;
    h = sumarDias(hoy, 1);
    etiqueta = "Hoy";
  } else if (periodo === "semana") {
    const dow = (new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0
    d = sumarDias(hoy, -dow);
    h = sumarDias(d, 7);
    etiqueta = "Esta semana";
  } else if (periodo === "rango" && desdeTxt && hastaTxt) {
    d = desdeTxt;
    h = sumarDias(hastaTxt, 1);
    etiqueta = `Del ${desdeTxt} al ${hastaTxt}`;
  } else {
    d = `${hoy.slice(0, 8)}01`;
    const sig = new Date(`${d}T12:00:00Z`);
    sig.setUTCMonth(sig.getUTCMonth() + 1);
    h = sig.toISOString().slice(0, 10);
    etiqueta = "Desde el día 1 de este mes";
  }
  const desde = inicioDia(d, zona);
  const hasta = inicioDia(h, zona);
  const dur = hasta.getTime() - desde.getTime();
  return {
    desde,
    hasta,
    etiqueta,
    previo: { desde: new Date(desde.getTime() - dur), hasta: desde },
  };
}

// C11: los nombres de los 12 estados (y los viejos del historial) salen de lib/estados-caller.ts
export const ETIQUETA_ESTADO_CALLER: Record<string, string> = ETIQUETA_ESTADO;

export const ETIQUETA_ESTADO_CITA: Record<string, string> = {
  pendiente: "Pendiente",
  confirmacion_pendiente: "Confirmación pendiente",
  confirmada: "Confirmada",
  no_califica: "No califica",
  cerrada: "Cerrada",
  seguimiento: "En seguimiento",
  no_show: "No show",
  reagendada: "Reagendada",
  cancelada: "Cancelada",
  perdida: "Perdida",
};

export const ETIQUETA_ROL: Record<string, string> = {
  ceo: "CEO",
  director: "Director de ventas",
  closer: "Closer",
  caller: "Caller",
};

// Momento de la petición (los Server Components se renderizan una vez por petición).
export function ahoraMs() {
  return Date.now();
}

// Fecha de una cita que manda GHL (11 oct 2026). calendar.startTime llega como "2026-10-14T15:30:00": hora del
// reloj de la zona del calendario, sin zona. Si trae zona (Z o ±hh:mm) se respeta; si no, se lee en `zona`
// (la que manda GHL o la del proyecto). Una zona que no existe se trata como UTC. Si no es una fecha, null.
export function fechaDeGhl(valor: string, zona: string): Date | null {
  const v = valor.trim();
  const sinZona = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (sinZona) {
    try {
      return new Date(localAIso(`${sinZona[1]}T${sinZona[2]}`, zona));
    } catch {
      return new Date(`${sinZona[1]}T${sinZona[2]}:00Z`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(v)) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// "2026-10-15T16:30" (hora local del proyecto) -> ISO en UTC.
// Calcula el desfase para esa hora exacta (vale también en los días de cambio de hora).
export function localAIso(local: string, zona: string) {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) throw new ErrorUsuario("Fecha no válida."); // arreglo 28: el usuario ve el motivo
  const [, y, mo, d, hh = "00", mm = "00"] = m;
  const comoUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm));
  // Arreglo 35: una sola función de desfase (antes había dos iguales)
  let t = comoUtc - offsetMin(zona, new Date(comoUtc)) * 60_000;
  t = comoUtc - offsetMin(zona, new Date(t)) * 60_000;
  return new Date(t).toISOString();
}

// 13 oct 2026: los pipelines se llaman como en GHL («1. Biblioteca Recursos»). Un nombre que llega de GHL vale
// sin el número de delante, sin tildes y sin mayúsculas («Biblioteca Recursos», «Agendas órganico»…).
export function mismoNombre(a: string | null | undefined, b: string | null | undefined) {
  const n = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^\d+\.\s*/, "").trim().toLowerCase();
  return n(a) === n(b);
}

// 1b (Cristian, 26 oct 2026): el país del lead se guarda como código («ES», «DO»…) o «Sin país»; vacío = aún sin
// calcular, y se enseña igual que «Sin país». El nombre, en español («Estados Unidos», «República Dominicana»).
export const SIN_PAIS = "Sin país";
const NOMBRES_PAIS = new Intl.DisplayNames(["es"], { type: "region" });
export function nombrePais(pais: string | null | undefined) {
  if (!pais || pais === SIN_PAIS) return SIN_PAIS;
  try {
    return NOMBRES_PAIS.of(pais) ?? pais;
  } catch {
    return pais;
  }
}

// F13 (plan Callers, 7 nov): el nombre corto de cada persona en un selector. El nombre de pila si nadie más lo
// tiene; si se repite, con la inicial del apellido («Ana L.», «Ana M.») para no confundirlas.
export function nombresCortos(personas: { id: string; nombre: string }[]) {
  const pila = (n: string) => n.trim().split(/\s+/)[0] ?? "";
  const veces = new Map<string, number>();
  for (const p of personas) veces.set(pila(p.nombre), (veces.get(pila(p.nombre)) ?? 0) + 1);
  return new Map(
    personas.map((p) => {
      const [primero, segundo] = p.nombre.trim().split(/\s+/);
      return [p.id, (veces.get(primero ?? "") ?? 0) > 1 && segundo ? `${primero} ${segundo[0]}.` : primero ?? p.nombre];
    })
  );
}
