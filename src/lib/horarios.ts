// Horario de cada persona, como los calendarios de GHL (bloque 1 de 1.0, Cristian 11 oct 2026):
// varios tramos por día (los huecos son los descansos) y fechas sueltas que mandan sobre la semana
// (una fecha sin tramos = libre todo el día). Siempre en la hora del proyecto.
export type Tramo = { desde: string; hasta: string }; // «HH:MM»; «hasta» puede ser «24:00»
export type Horario = { semana: Record<number, Tramo[]>; fechas: Record<string, Tramo[]> } | null; // semana: 1 = lunes … 7 = domingo
export const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];
export const NOMBRES_DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const HORA = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TRAMOS = 8;

// Botones rápidos del onboarding (Cristian, 11 oct 2026): de lunes a viernes
export const PLANTILLAS: { v: string; t: string; tramos: Tramo[] }[] = [
  { v: "manana", t: "Mañana (9:00–13:00)", tramos: [{ desde: "09:00", hasta: "13:00" }] },
  { v: "tarde", t: "Tarde (14:00–18:00)", tramos: [{ desde: "14:00", hasta: "18:00" }] },
  { v: "todo", t: "Todo el día (9:00–18:00)", tramos: [{ desde: "09:00", hasta: "18:00" }] },
];
export function deplantilla(v: string): Horario {
  const p = PLANTILLAS.find((x) => x.v === v);
  if (!p) return null;
  return { semana: Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, p.tramos.map((t) => ({ ...t }))])), fechas: {} };
}

// Tramos válidos, ordenados y sin solaparse (los que se pisan se unen). null si alguno está mal escrito.
export function tramosValidos(t: unknown): Tramo[] | null {
  if (!Array.isArray(t)) return null;
  const lista: Tramo[] = [];
  for (const x of t) {
    const y = x as Partial<Tramo>;
    if (typeof y?.desde !== "string" || typeof y?.hasta !== "string" || !HORA.test(y.desde) || !HORA.test(y.hasta) || y.desde === "24:00" || y.desde >= y.hasta) return null;
    lista.push({ desde: y.desde, hasta: y.hasta });
  }
  lista.sort((a, b) => a.desde.localeCompare(b.desde));
  const unidos: Tramo[] = [];
  for (const x of lista) {
    const u = unidos[unidos.length - 1];
    if (u && x.desde <= u.hasta) u.hasta = x.hasta > u.hasta ? x.hasta : u.hasta;
    else unidos.push({ ...x });
  }
  return unidos.length > MAX_TRAMOS ? null : unidos;
}

// Lee un horario guardado. Acepta también el formato de V2-11 ({ dias, desde, hasta }, un tramo igual cada día;
// si pasa de medianoche, se parte en dos: hasta las 24:00 y desde las 00:00 del día siguiente).
// Devuelve null si no hay ningún tramo en la semana (sin horario) o si algo está mal escrito.
export function horarioValido(h: unknown): Horario {
  if (!h || typeof h !== "object") return null;
  const x = h as { dias?: unknown; desde?: unknown; hasta?: unknown; semana?: unknown; fechas?: unknown };
  if (Array.isArray(x.dias)) return deV211(x);
  if (!x.semana || typeof x.semana !== "object") return null;
  const semana: Record<number, Tramo[]> = {};
  for (const [k, v] of Object.entries(x.semana as Record<string, unknown>)) {
    const d = Number(k);
    if (!Number.isInteger(d) || d < 1 || d > 7) return null;
    const t = tramosValidos(v);
    if (!t) return null;
    if (t.length) semana[d] = t;
  }
  if (!Object.keys(semana).length) return null;
  const fechas: Record<string, Tramo[]> = {};
  if (x.fechas && typeof x.fechas === "object") {
    for (const [k, v] of Object.entries(x.fechas as Record<string, unknown>)) {
      const t = tramosValidos(v);
      if (!FECHA.test(k) || !t) return null;
      fechas[k] = t;
    }
  }
  return { semana, fechas };
}

function deV211(x: { dias?: unknown; desde?: unknown; hasta?: unknown }): Horario {
  const dias = [...new Set((x.dias as unknown[]).map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))];
  if (!dias.length || typeof x.desde !== "string" || typeof x.hasta !== "string" || !HORA.test(x.desde) || !HORA.test(x.hasta) || x.desde === x.hasta) return null;
  const semana: Record<number, Tramo[]> = {};
  const poner = (d: number, t: Tramo) => (semana[d] = tramosValidos([...(semana[d] ?? []), t]) ?? []);
  for (const d of dias) {
    if (x.desde < x.hasta) poner(d, { desde: x.desde, hasta: x.hasta });
    else {
      poner(d, { desde: x.desde, hasta: "24:00" });
      if (x.hasta !== "00:00") poner(d === 7 ? 1 : d + 1, { desde: "00:00", hasta: x.hasta });
    }
  }
  return { semana, fechas: {} };
}

// Día de la semana (1-7), fecha «AAAA-MM-DD» y hora «HH:MM» de un instante en la zona del proyecto
export function enZona(instante: Date, zona: string) {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instante);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  return { dia: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p("weekday")) + 1, ymd: `${p("year")}-${p("month")}-${p("day")}`, hm: `${p("hour")}:${p("minute")}` };
}

// Los tramos de un día concreto: si la fecha tiene horario propio (o está libre), manda sobre la semana
export function tramosDelDia(h: Horario, ymd: string, dia: number): Tramo[] {
  if (!h) return [];
  if (h.fechas[ymd]) return h.fechas[ymd];
  return h.semana[dia] ?? [];
}

export function enHorario(h: Horario, ahora: Date, zona: string) {
  const { dia, ymd, hm } = enZona(ahora, zona);
  return tramosDelDia(h, ymd, dia).some((t) => hm >= t.desde && hm < t.hasta);
}

// Para enseñar un horario en una línea: «L-V 09:00–13:00, 14:00–18:00 · S 10:00–12:00»
export function resumenHorario(h: Horario) {
  if (!h) return "Sin horario";
  const grupos: { dias: number[]; txt: string }[] = [];
  for (let d = 1; d <= 7; d++) {
    const txt = (h.semana[d] ?? []).map((t) => `${t.desde}–${t.hasta}`).join(", ");
    if (!txt) continue;
    const g = grupos[grupos.length - 1];
    if (g && g.txt === txt && g.dias[g.dias.length - 1] === d - 1) g.dias.push(d);
    else grupos.push({ dias: [d], txt });
  }
  return grupos.map((g) => `${g.dias.length > 1 ? `${DIAS_SEMANA[g.dias[0] - 1]}-${DIAS_SEMANA[g.dias[g.dias.length - 1] - 1]}` : DIAS_SEMANA[g.dias[0] - 1]} ${g.txt}`).join(" · ");
}

// Pasa una hora «HH:MM» de la zona del proyecto a la zona de quien mira, en una fecha de referencia
// (para enseñar «10:00 Nueva York · 16:00 tu hora»). Devuelve null si las dos zonas dan la misma hora.
// 12 nov 2026: null también si la hora está a medio escribir (el campo queda vacío al borrar) o el navegador da una zona
// que no reconoce («Etc/Unknown»): antes lanzaba un error y se caía la pantalla entera (el onboarding de un caller).
export function horaEnOtraZona(hm: string, ymd: string, zonaProyecto: string, zonaLocal: string) {
  try {
    return calcularHoraEnOtraZona(hm, ymd, zonaProyecto, zonaLocal);
  } catch {
    return null;
  }
}

function calcularHoraEnOtraZona(hm: string, ymd: string, zonaProyecto: string, zonaLocal: string) {
  const [h, m] = hm.split(":").map(Number);
  const desfase = (zona: string, base: number) => {
    const p = enZona(new Date(base), zona);
    const [y, mo, d] = p.ymd.split("-").map(Number);
    const [hh, mm] = p.hm.split(":").map(Number);
    return (Date.UTC(y, mo - 1, d, hh, mm) - base) / 60000;
  };
  const [y, mo, d] = ymd.split("-").map(Number);
  const comoUtc = Date.UTC(y, mo - 1, d, h, m);
  const instante = comoUtc - desfase(zonaProyecto, comoUtc) * 60000;
  if (desfase(zonaProyecto, instante) === desfase(zonaLocal, instante)) return null;
  const local = enZona(new Date(instante), zonaLocal);
  const dif = local.ymd === ymd ? "" : local.ymd > ymd ? " (+1 día)" : " (−1 día)";
  return `${local.hm}${dif}`;
}
