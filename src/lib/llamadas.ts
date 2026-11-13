// Reparto de las citas en las pestañas de «Llamadas» (V2-2). Sin base de datos.
// Pre-call: citas abiertas que aún no han pasado. Post-call: lo que ya pasó, por estado.
export const ABIERTAS = ["pendiente", "confirmacion_pendiente", "confirmada"] as const;
// Las 4 columnas de Pre-call: cada una es un estado de la cita
const CLAVES_PRECALL = [
  { v: "pendiente", t: "Pendiente" },
  { v: "confirmacion_pendiente", t: "Confirmación pendiente" },
  { v: "confirmada", t: "Confirmado" },
  { v: "no_califica", t: "No califica" },
] as const;
export const SUB_POSTCALL = [
  { v: "pendientes", t: "Pendientes", d: "Ya pasaron y falta registrar el resultado" },
  { v: "reagendadas", t: "Reagendadas", d: "Citas que se movieron a otra fecha" },
  { v: "reserva", t: "Reserva", d: "Ventas con reserva (seña) y resto por cobrar" },
  { v: "cuotas", t: "Cuotas", d: "Ventas a cuotas con dinero por cobrar" },
  { v: "cerradas", t: "Cerradas", d: "Ventas de este mes pagadas del todo" }, // Paso H6 (Cristian, 10 oct 2026)
  { v: "seguimiento", t: "En seguimiento", d: "Leads pendientes de decidir" },
  { v: "no_show", t: "No-show", d: "No se presentaron" },
  { v: "cancelada", t: "Canceladas", d: "Canceladas antes de la llamada" },
  { v: "perdida", t: "Perdidas", d: "Asistieron y no compraron" },
] as const;
export type SubPostcall = (typeof SUB_POSTCALL)[number]["v"];

type CitaL = { id: string; lead_id: string; fecha: string; estado: string };
type VentaL = { id: string; lead_id: string; tipo_pago: string; pendiente: number; fecha?: string };

const abierta = (e: string) => (ABIERTAS as readonly string[]).includes(e);

// Cristian, 3 nov: citas sin closer del equipo (el suyo se borró, o GHL no le puso a nadie). Las ven los jefes con
// el nombre de quien la llevaba («Felipe (ya no está)») o «Sin llamar», y en rojo hasta que tengan resultado.
type CitaCloser = { closer_id: string | null; closer_antes?: string | null; estado: string };
export const porRecuperar = (c: CitaCloser) => !c.closer_id && abierta(c.estado);
export const quienLlevaba = (c: CitaCloser, nombrePersona: (id: string | null) => string) =>
  c.closer_id ? nombrePersona(c.closer_id) : c.closer_antes ? `${c.closer_antes} (ya no está)` : "Sin llamar";

export function esPrecall(c: CitaL, ahora: number) {
  return (abierta(c.estado) || c.estado === "no_califica") && new Date(c.fecha).getTime() >= ahora;
}

export function enPostcall(c: CitaL, sub: SubPostcall, ahora: number) {
  if (sub === "pendientes") return abierta(c.estado) && new Date(c.fecha).getTime() < ahora;
  if (sub === "reagendadas") return c.estado === "reagendada";
  if (esColumnaVentas(sub)) return false; // salen de las ventas
  return c.estado === sub;
}

export const esColumnaVentas = (sub: SubPostcall): sub is "reserva" | "cuotas" | "cerradas" => sub === "reserva" || sub === "cuotas" || sub === "cerradas";

// Reserva y Cuotas: con dinero por cobrar. Cerradas: pagadas del todo y vendidas desde `desdeMs` (el día 1 del mes)
export function ventasPostcall<V extends VentaL>(ventas: V[], sub: "reserva" | "cuotas" | "cerradas", desdeMs = 0): V[] {
  if (sub === "cerradas") return ventas.filter((v) => v.pendiente <= 0.001 && !!v.fecha && new Date(v.fecha).getTime() >= desdeMs);
  return ventas.filter((v) => v.tipo_pago === sub && v.pendiente > 0.001);
}

// ---------- Pipeline «Closers» (Paso 0): Pre-call y Post-call juntos ----------
// Cada columna puede estar unida a una «clave» (un estado de Pre-call o una columna de Post-call) o ser libre.
type ClavePrecall = (typeof CLAVES_PRECALL)[number]["v"];
export type ClaveCloser = ClavePrecall | SubPostcall;
export const CLAVES_CLOSER: { v: ClaveCloser; t: string }[] = [...CLAVES_PRECALL, ...SUB_POSTCALL.map((s) => ({ v: s.v, t: s.t }))];
export const esClavePrecall = (c: string | null | undefined): c is ClavePrecall => CLAVES_PRECALL.some((x) => x.v === c);

// La columna que le toca a una cita por su estado y su fecha (null = no sale: cerrada)
// «No califica» se ve siempre en su columna, aunque la cita ya pasara (Cristian, 13 oct 2026: antes se escondía)
export function claveNatural(c: CitaL, ahora: number): ClaveCloser | null {
  if (c.estado === "no_califica" || esPrecall(c, ahora)) return c.estado as ClavePrecall;
  return SUB_POSTCALL.find((s) => !esColumnaVentas(s.v) && enPostcall(c, s.v, ahora))?.v ?? null;
}

type EtapaC = { id: string; columna_cita?: string | null };
type CitaC = CitaL & { etapa_closers_id?: string | null };
// Reparte citas y ventas en las columnas de «Closers»: la cita movida a una columna libre se queda ahí;
// si no, va a la columna unida a su clave. Lo que no tiene columna (la borraron) sale aparte.
export function repartirCloser<C extends CitaC, V extends VentaL>(etapas: EtapaC[], citas: C[], ventas: V[], ahora: number, desdeMesMs: number) {
  const porColumna = new Map<string, { citas: C[]; ventas: V[] }>(etapas.map((e) => [e.id, { citas: [], ventas: [] }]));
  const unida = (clave: string) => etapas.find((e) => e.columna_cita === clave)?.id;
  const sinColumna: { citas: C[]; ventas: V[] } = { citas: [], ventas: [] };
  for (const c of citas) {
    const libre = c.etapa_closers_id && etapas.some((e) => e.id === c.etapa_closers_id && !e.columna_cita) ? c.etapa_closers_id : null;
    const natural = claveNatural(c, ahora);
    const destino = libre ?? (natural ? unida(natural) : undefined);
    if (destino) porColumna.get(destino)!.citas.push(c);
    else if (natural) sinColumna.citas.push(c);
  }
  for (const sub of ["reserva", "cuotas", "cerradas"] as const) {
    const destino = unida(sub);
    for (const v of ventasPostcall(ventas, sub, desdeMesMs)) (destino ? porColumna.get(destino)!.ventas : sinColumna.ventas).push(v);
  }
  return { porColumna, sinColumna };
}

// En Agendas: Pre-call son las columnas hasta la primera unida a Post-call; Post-call, el resto
export function partirCloser<E extends EtapaC>(etapas: E[]) {
  const i = etapas.findIndex((e) => e.columna_cita && !esClavePrecall(e.columna_cita));
  return i < 0 ? { pre: etapas, post: [] as E[] } : { pre: etapas.slice(0, i), post: etapas.slice(i) };
}

// «YYYY-MM-DD» de una fecha en la zona del proyecto
export function diaEnZona(iso: string, zona: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date(iso));
}

// Celdas de un mes (de lunes a domingo), con los huecos del principio y del final
export function celdasMes(ymd: string) {
  const primero = new Date(`${ymd.slice(0, 8)}01T12:00:00Z`);
  const desplazamiento = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const dias = new Date(Date.UTC(primero.getUTCFullYear(), primero.getUTCMonth() + 1, 0)).getUTCDate();
  const celdas: (string | null)[] = Array(desplazamiento).fill(null);
  for (let d = 1; d <= dias; d++) celdas.push(`${ymd.slice(0, 8)}${String(d).padStart(2, "0")}`);
  while (celdas.length % 7) celdas.push(null);
  return celdas;
}

// Texto para buscar: nombre, email, teléfono (sin acentos ni mayúsculas)
export const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export function coincide(q: string, ...campos: (string | null | undefined)[]) {
  if (!q.trim()) return true;
  const t = normal(campos.filter(Boolean).join(" "));
  const digitos = q.replace(/\D/g, "");
  return normal(q).split(/\s+/).every((p) => t.includes(p)) || (digitos.length >= 4 && t.replace(/\D/g, "").includes(digitos));
}
