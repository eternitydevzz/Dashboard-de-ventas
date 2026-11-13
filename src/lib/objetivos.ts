import "server-only";
import { enMemoria, UN_MINUTO } from "@/lib/memoria";
import { db, todas, equipo, conBajas } from "@/lib/datos";
import { rangoDe, porcentaje, hoyEnZona, sumarDias, type Rango } from "@/lib/formato";
import { cashNeto, enRango, type Base } from "@/lib/metricas";
import { indices, kpiCaller, kpiCloser, type Indices } from "@/lib/kpis";
import type { Perfil } from "@/lib/tipos";

// Objetivos (Paso H3, decisiones de Cristian del 10 oct 2026):
// - por rol o por persona (manda la persona); el del director es del equipo entero
// - diario (por defecto L-V), semanal (lunes a domingo), mensual y de lanzamiento
// - cada cambio es una fila nueva: un periodo usa el último objetivo puesto antes de que acabe
//   (si se cambia el miércoles, vale para esa semana; las anteriores guardan el suyo)
// - lanzamiento con evento: solo cuentan los leads de ese evento; sin evento, todo lo de sus fechas

export { CIFRAS, PERIODOS, DIAS, type Cifra, type PeriodoObjetivo, type RolObjetivo } from "@/lib/objetivos-constantes";
import { CIFRAS, type Cifra, type PeriodoObjetivo, type RolObjetivo } from "@/lib/objetivos-constantes";

export type FilaObjetivo = {
  id: string;
  rol: RolObjetivo | null;
  perfil_id: string | null;
  periodo: PeriodoObjetivo;
  lanzamiento_id: string | null;
  cifra: Cifra;
  valor: number | null;
  dias: number[];
  creado_en: string;
};
export type Lanzamiento = { id: string; nombre: string; inicio: string; fin: string; evento: string | null };

// `enFecha`: solo carga los leads de los lanzamientos en curso ese día (los únicos que se usan). Sin fecha, todos.
// 25 oct 2026: compartido 1 minuto entre todo el equipo (lib/memoria.ts)
export function cargarObjetivos(proyectoId: string, enFecha?: string) {
  return enMemoria(`objetivos:${proyectoId}:${enFecha ?? "todo"}`, UN_MINUTO, () => cargarObjetivosDeLaBase(proyectoId, enFecha));
}

async function cargarObjetivosDeLaBase(proyectoId: string, enFecha?: string) {
  const [filas, lanzamientos] = await Promise.all([
    todas<FilaObjetivo>((a, b) =>
      db().from("objetivos").select("id, rol, perfil_id, periodo, lanzamiento_id, cifra, valor, dias, creado_en").eq("proyecto_id", proyectoId).order("id").range(a, b)
    ),
    todas<Lanzamiento>((a, b) => db().from("lanzamientos").select("id, nombre, inicio, fin, evento").eq("proyecto_id", proyectoId).order("id").range(a, b)),
  ]);
  // Leads de cada evento unido a un lanzamiento
  // Pendiente 9 (10 oct 2026): «Mis objetivos» se recarga cada minuto; ya no lee los leads de lanzamientos pasados
  const usados = enFecha ? lanzamientos.filter((l) => l.inicio <= enFecha && enFecha <= l.fin) : lanzamientos;
  const eventos = [...new Set(usados.map((l) => l.evento).filter((e): e is string => !!e))];
  const leadsEvento = new Map<string, Set<string>>();
  for (const ev of eventos) {
    const ids = await todas<{ id: string }>((a, b) => db().from("leads").select("id").eq("proyecto_id", proyectoId).eq("evento", ev).order("id").range(a, b));
    leadsEvento.set(ev, new Set(ids.map((l) => l.id)));
  }
  return { filas: filas.map((f) => ({ ...f, valor: f.valor === null ? null : Number(f.valor) })), lanzamientos, leadsEvento };
}
export type DatosObjetivos = Awaited<ReturnType<typeof cargarObjetivosDeLaBase>>;

const clave = (f: FilaObjetivo) => [f.rol ?? "", f.perfil_id ?? "", f.periodo, f.lanzamiento_id ?? "", f.cifra].join("|");

// Último objetivo de cada clave puesto antes de `antesDe` (sin los quitados)
export function vigentes(filas: FilaObjetivo[], antesDe: Date | null) {
  const ultimo = new Map<string, FilaObjetivo>();
  for (const f of filas) {
    const t = new Date(f.creado_en).getTime();
    if (antesDe && t >= antesDe.getTime()) continue;
    const previo = ultimo.get(clave(f));
    if (!previo || t > new Date(previo.creado_en).getTime()) ultimo.set(clave(f), f);
  }
  return [...ultimo.values()].filter((f) => f.valor !== null);
}

// Solo las filas de unos leads (para los lanzamientos con evento)
function soloLeads(base: Base, leads: Set<string>): Base {
  const ventas = base.ventas.filter((v) => leads.has(v.lead_id));
  const idsVenta = new Set(ventas.map((v) => v.id));
  return {
    ...base,
    leads: base.leads.filter((l) => leads.has(l.id)),
    citas: base.citas.filter((c) => leads.has(c.lead_id)),
    actividades: base.actividades.filter((a) => leads.has(a.lead_id)),
    ventas,
    pagos: base.pagos.filter((p) => idsVenta.has(p.venta_id)),
  };
}

// Cuánto lleva un grupo de personas en una cifra. `memo` guarda los KPIs ya calculados de ese grupo.
export function hecho(ix: Indices, ids: Set<string>, cifra: Cifra, memo = new Map<string, unknown>()) {
  const { base, rango } = ix;
  const k = [...ids].sort().join(",");
  const caller = () => (memo.get(`ca|${k}`) ?? memo.set(`ca|${k}`, kpiCaller(ix, ids)).get(`ca|${k}`)) as ReturnType<typeof kpiCaller>;
  const closer = () => (memo.get(`cl|${k}`) ?? memo.set(`cl|${k}`, kpiCloser(ix, ids)).get(`cl|${k}`)) as ReturnType<typeof kpiCloser>;
  switch (cifra) {
    case "llamadas":
      return caller().llamadas;
    case "contactados":
      return caller().contactados;
    case "agendas":
      return caller().agendados;
    case "citas_atendidas":
      return closer().atendidas;
    case "asistencias":
      return closer().asistidas;
  }
  const suyas = base.ventas.filter((v) => v.vendedor_id && ids.has(v.vendedor_id));
  const delPeriodo = suyas.filter((v) => enRango(v.fecha, rango));
  if (cifra === "ventas") return delPeriodo.length;
  if (cifra === "facturacion") return delPeriodo.reduce((s, v) => s + v.facturacion, 0);
  return cashNeto(base, suyas, rango);
}

export type Avance = {
  objetivoId: string;
  cifra: Cifra;
  periodo: PeriodoObjetivo;
  etiqueta: string; // «Hoy», «Esta semana», «Este mes» o el nombre del lanzamiento
  meta: number;
  hecho: number;
  pct: number;
  dePersona: boolean; // objetivo propio (no el de su rol)
};

function diaSemana(fecha: string) {
  return ((new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = lunes
}

// Día, semana (lunes a domingo) y mes que contienen la fecha `ref`, y los lanzamientos en curso ese día
export function tramosDe(ref: string, zona: string, lanzamientos: Lanzamiento[]) {
  const esHoy = ref === hoyEnZona(zona);
  const lunes = sumarDias(ref, -(diaSemana(ref) - 1));
  const primero = `${ref.slice(0, 8)}01`;
  const sig = new Date(`${primero}T12:00:00Z`);
  sig.setUTCMonth(sig.getUTCMonth() + 1);
  const ultimo = sumarDias(sig.toISOString().slice(0, 10), -1);
  const tramos: { periodo: PeriodoObjetivo; rango: Rango; etiqueta: string; lanzamiento?: Lanzamiento }[] = [
    { periodo: "dia", rango: rangoDe("rango", zona, ref, ref), etiqueta: esHoy ? "Hoy" : `El ${ref}` },
    { periodo: "semana", rango: rangoDe("rango", zona, lunes, sumarDias(lunes, 6)), etiqueta: esHoy ? "Esta semana" : `Semana del ${lunes}` },
    { periodo: "mes", rango: rangoDe("rango", zona, primero, ultimo), etiqueta: esHoy ? "Este mes" : `Mes ${ref.slice(0, 7)}` },
    ...lanzamientos
      .filter((l) => l.inicio <= ref && ref <= l.fin)
      .map((l) => ({ periodo: "lanzamiento" as const, rango: rangoDe("rango", zona, l.inicio, l.fin), etiqueta: l.nombre, lanzamiento: l })),
  ];
  return tramos;
}

// Avance de cada persona en sus objetivos del día `ref` (por defecto hoy): ese día, su semana, su mes y los
// lanzamientos en curso. Cada periodo usa los objetivos que había al acabar (el histórico se guarda).
export function calcularAvances(base: Base, datos: DatosObjetivos, personas: Perfil[], zona: string, ref = hoyEnZona(zona)) {
  const hoy = ref;
  const equipoIds = new Set(base.gente.filter((g) => g.rol === "caller" || g.rol === "closer").map((g) => g.id));
  const tramos = tramosDe(ref, zona, datos.lanzamientos);

  // Índices de cada tramo (una vez por periodo, no por persona)
  const ixTramo = tramos.map((tr) => indices(tr.lanzamiento?.evento ? soloLeads(base, datos.leadsEvento.get(tr.lanzamiento.evento) ?? new Set()) : base, tr.rango, zona));
  const memos = tramos.map(() => new Map<string, unknown>());
  const resultado = new Map<string, Avance[]>();
  for (const p of personas) {
    if (p.rol !== "caller" && p.rol !== "closer" && p.rol !== "director") continue;
    const lista: Avance[] = [];
    for (const [i, tr] of tramos.entries()) {
      const vig = vigentes(datos.filas, tr.rango.hasta).filter((f) => f.periodo === tr.periodo && f.lanzamiento_id === (tr.lanzamiento?.id ?? null));
      for (const c of CIFRAS) {
        if (!c.roles.includes(p.rol)) continue;
        const propio = vig.find((f) => f.perfil_id === p.id && f.cifra === c.v);
        const obj = propio ?? vig.find((f) => f.rol === p.rol && f.cifra === c.v);
        if (!obj || obj.valor === null) continue;
        // El diario solo cuenta los días marcados (por defecto de lunes a viernes)
        if (tr.periodo === "dia" && !obj.dias.includes(diaSemana(hoy))) continue;
        const ids = p.rol === "director" ? equipoIds : new Set([p.id]);
        const h = hecho(ixTramo[i], ids, c.v, memos[i]);
        lista.push({ objetivoId: obj.id, cifra: c.v, periodo: tr.periodo, etiqueta: tr.etiqueta, meta: obj.valor, hecho: h, pct: porcentaje(h, obj.valor), dePersona: !!propio });
      }
    }
    resultado.set(p.id, lista);
  }
  return resultado;
}

// ---------- «Mis objetivos» del caller o del closer ----------
// Su pantalla se recarga sola cada minuto: en vez de cargar todo el proyecto, solo sus datos
// desde el principio del periodo más largo que esté en curso.
const TROZO = 200;
async function porTrozos<T>(ids: string[], pedir: (trozo: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const filas: T[] = [];
  for (let i = 0; i < ids.length; i += TROZO) {
    const { data, error } = await pedir(ids.slice(i, i + TROZO));
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
  }
  return filas;
}

type VentaFila = Base["ventas"][number];
const COLS_VENTA = "id, lead_id, vendedor_id, facturacion, cash_collected, fecha, producto_id, devuelto, devuelto_en";
const COLS_CITA = "id, lead_id, closer_id, agendada_por, fecha, estado, creado_en";

async function baseDePersona(proyectoId: string, p: Perfil, desde: Date): Promise<Base> {
  const d = desde.toISOString();
  let actividades: Base["actividades"] = [];
  let citas: Base["citas"] = [];
  let ventas: VentaFila[] = [];
  // Velocidad (17 oct 2026): lo que no depende de otra consulta va a la vez (antes, todo en fila)
  if (p.rol === "caller") {
    const [acts, suyas, propias] = await Promise.all([
      todas<Base["actividades"][number]>((a, b) => db().from("actividades").select("lead_id, perfil_id, tipo, resultado, creado_en").eq("proyecto_id", proyectoId).eq("perfil_id", p.id).in("tipo", ["llamada", "whatsapp"]).gte("creado_en", d).order("id").range(a, b)),
      todas<Base["citas"][number]>((a, b) => db().from("citas").select(COLS_CITA).eq("proyecto_id", proyectoId).eq("agendada_por", p.id).gte("creado_en", d).order("id").range(a, b)),
      todas<VentaFila>((a, b) => db().from("ventas").select(COLS_VENTA).eq("proyecto_id", proyectoId).eq("vendedor_id", p.id).order("id").range(a, b)),
    ]);
    actividades = acts;
    const leads = [...new Set(suyas.map((c) => c.lead_id))];
    // Todas las citas y ventas de sus agendados (asistencia y cierre) + su low ticket
    const [deSusCitas, deSusLeads] = await Promise.all([
      porTrozos<Base["citas"][number]>(leads, (t) => db().from("citas").select(COLS_CITA).in("lead_id", t)),
      porTrozos<VentaFila>(leads, (t) => db().from("ventas").select(COLS_VENTA).in("lead_id", t)),
    ]);
    citas = deSusCitas;
    ventas = [...new Map([...deSusLeads, ...propias].map((v) => [v.id, v])).values()];
  } else {
    [citas, ventas] = await Promise.all([
      todas<Base["citas"][number]>((a, b) => db().from("citas").select(COLS_CITA).eq("proyecto_id", proyectoId).eq("closer_id", p.id).gte("fecha", d).order("id").range(a, b)),
      todas<VentaFila>((a, b) => db().from("ventas").select(COLS_VENTA).eq("proyecto_id", proyectoId).eq("vendedor_id", p.id).order("id").range(a, b)),
    ]);
  }
  const pagos = await porTrozos<{ importe: number; fecha: string; venta_id: string }>(ventas.map((v) => v.id), (t) => db().from("pagos").select("importe, fecha, venta_id").in("venta_id", t));
  return {
    leads: [],
    citas,
    actividades,
    ventas: ventas.map((v) => ({ ...v, facturacion: Number(v.facturacion), cash_collected: Number(v.cash_collected) })),
    pagos: pagos.map((x) => ({ ...x, importe: Number(x.importe) })),
    gente: [p],
  };
}

// Datos de todo el equipo, pero solo desde `desde` (para el objetivo del equipo en «Mis leads» / «Mis agendas»)
// Velocidad (13 nov 2026): la barra del equipo es igual para todos y leía todo lo del equipo desde el lunes o el día 1
// en cada carga de Callers, Mis agendas, KPIs y Mi Funnel (7+ consultas). Se comparte 1 minuto (lib/memoria.ts), como cargarBase.
function baseDelEquipo(proyectoId: string, desde: Date): Promise<Base> {
  return enMemoria(`base-equipo:${proyectoId}:${desde.toISOString()}`, UN_MINUTO, () => baseDelEquipoDeLaBase(proyectoId, desde));
}

async function baseDelEquipoDeLaBase(proyectoId: string, desde: Date): Promise<Base> {
  const d = desde.toISOString();
  const [actividades, citas, pagos, gente] = await Promise.all([
    todas<Base["actividades"][number]>((a, b) => db().from("actividades").select("lead_id, perfil_id, tipo, resultado, creado_en").eq("proyecto_id", proyectoId).in("tipo", ["llamada", "whatsapp"]).gte("creado_en", d).order("id").range(a, b)),
    todas<Base["citas"][number]>((a, b) => db().from("citas").select(COLS_CITA).eq("proyecto_id", proyectoId).or(`creado_en.gte.${d},fecha.gte.${d}`).order("id").range(a, b)),
    todas<{ importe: number; fecha: string; venta_id: string }>((a, b) => db().from("pagos").select("importe, fecha, venta_id, ventas!inner(proyecto_id)").eq("ventas.proyecto_id", proyectoId).gte("fecha", d).order("id").range(a, b)),
    equipo(proyectoId),
  ]);
  // Ventas del periodo, devueltas en el periodo o con cobros en el periodo (lo que usa el cash)
  const recientes = await todas<VentaFila>((a, b) => db().from("ventas").select(COLS_VENTA).eq("proyecto_id", proyectoId).or(`fecha.gte.${d},devuelto_en.gte.${d}`).order("id").range(a, b));
  const faltan = [...new Set(pagos.map((x) => x.venta_id))].filter((id) => !recientes.some((v) => v.id === id));
  const ventas = [...recientes, ...(await porTrozos<VentaFila>(faltan, (t) => db().from("ventas").select(COLS_VENTA).in("id", t)))];
  return {
    leads: [],
    citas,
    actividades,
    ventas: ventas.map((v) => ({ ...v, facturacion: Number(v.facturacion), cash_collected: Number(v.cash_collected) })),
    pagos: pagos.map((x) => ({ importe: Number(x.importe), fecha: x.fecha, venta_id: x.venta_id })),
    // Quien se fue a mitad de periodo sigue sumando lo que hizo (como en KPIs)
    gente: await conBajas(gente, [...ventas.map((v) => v.vendedor_id), ...citas.flatMap((c) => [c.closer_id, c.agendada_por]), ...actividades.map((x) => x.perfil_id)]),
  };
}

// Racha: días seguidos (hacia atrás) en que cumplió TODOS sus objetivos diarios (decisión de Cristian).
// Los días sin objetivo no la cortan; hoy solo suma si ya está cumplido. Se mira hasta 60 días atrás.
export const RACHA_MAX = 60;
export function calcularRacha(base: Base, filas: FilaObjetivo[], p: Perfil, zona: string) {
  const hoy = hoyEnZona(zona);
  let dias = 0;
  for (let i = 0; i <= RACHA_MAX; i++) {
    const fecha = sumarDias(hoy, -i);
    const rango = rangoDe("rango", zona, fecha, fecha);
    const vig = vigentes(filas, rango.hasta).filter((f) => f.periodo === "dia");
    const objetivos = CIFRAS.map((c) => vig.find((f) => f.perfil_id === p.id && f.cifra === c.v) ?? vig.find((f) => f.rol === p.rol && f.cifra === c.v)).filter(
      (f): f is FilaObjetivo => !!f && f.valor !== null && f.dias.includes(diaSemana(fecha)) && CIFRAS.find((c) => c.v === f.cifra)!.roles.includes(p.rol as RolObjetivo)
    );
    if (objetivos.length === 0) continue; // día libre: no corta
    const ix = indices(base, rango, zona);
    const memo = new Map<string, unknown>();
    const cumplido = objetivos.every((f) => hecho(ix, new Set([p.id]), f.cifra, memo) >= f.valor!);
    if (cumplido) dias++;
    else if (i > 0) break; // hoy aún puede cumplirlo
  }
  return { dias: Math.min(dias, RACHA_MAX), mas: dias > RACHA_MAX };
}

// Lo que ve cada caller o closer: sus objetivos, su racha y el objetivo del equipo (los del director)
export async function panelObjetivos(proyecto: { id: string; zona_horaria: string }, p: Perfil) {
  const zona = proyecto.zona_horaria;
  const hoy = hoyEnZona(zona);
  const datos = await cargarObjetivos(proyecto.id, hoy);
  // Velocidad (17 oct 2026): sin ningún objetivo puesto, el resultado es vacío; no hace falta leer actividades, citas ni ventas
  if (datos.filas.length === 0) return { mios: [], racha: null, equipo: [] };
  const inicios = [rangoDe("semana", zona).desde!, rangoDe("mes", zona).desde!, ...datos.lanzamientos.filter((l) => l.inicio <= hoy && hoy <= l.fin).map((l) => rangoDe("rango", zona, l.inicio, l.fin).desde!)];
  const desde = new Date(Math.min(...inicios.map((x) => x.getTime())));
  const hayDiarios = datos.filas.some((f) => f.periodo === "dia");
  const hayEquipo = datos.filas.some((f) => f.rol === "director");
  const desdePersona = hayDiarios ? new Date(Math.min(desde.getTime(), rangoDe("rango", zona, sumarDias(hoy, -RACHA_MAX), hoy).desde!.getTime())) : desde;
  const [basePersona, baseEquipo] = await Promise.all([
    p.rol === "caller" || p.rol === "closer" ? baseDePersona(proyecto.id, p, desdePersona) : null,
    hayEquipo ? baseDelEquipo(proyecto.id, desde) : null,
  ]);
  return {
    mios: basePersona ? calcularAvances(basePersona, datos, [p], zona).get(p.id) ?? [] : [],
    racha: basePersona && hayDiarios ? calcularRacha(basePersona, datos.filas, p, zona) : null,
    equipo: baseEquipo ? avancesDelEquipo(baseEquipo, datos, zona) : [],
  };
}

// Objetivo del equipo = los objetivos puestos al rol director (ya son del equipo entero)
export const EQUIPO: Perfil = { id: "__equipo__", nombre: "Equipo", email: "", rol: "director", telefono: null, whatsapp: null, admin_activo: false, onboarding_completo: true, activo: true };
export function avancesDelEquipo(base: Base, datos: DatosObjetivos, zona: string) {
  return calcularAvances(base, datos, [EQUIPO], zona).get(EQUIPO.id) ?? [];
}
