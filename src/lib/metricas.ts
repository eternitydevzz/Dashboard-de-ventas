import { esContacto } from "@/lib/estados-caller";
import "server-only";
import { enMemoria, UN_MINUTO } from "@/lib/memoria";
import { db, todas, equipo, conBajas, idsDePrueba, deVerdad } from "@/lib/datos";
import { porcentaje, type Rango } from "@/lib/formato";
import type { Perfil, Proyecto } from "@/lib/tipos";

type LeadMin = { id: string; creado_en: string; caller_id: string | null; closer_id: string | null };
type CitaMin = { id: string; lead_id: string; closer_id: string | null; agendada_por: string | null; fecha: string; estado: string; creado_en: string };
type VentaMin = { id: string; lead_id: string; vendedor_id: string | null; facturacion: number; cash_collected: number; fecha: string; producto_id: string | null; devuelto?: number | null; devuelto_en?: string | null };
type ActMin = { lead_id: string; perfil_id: string | null; tipo: string; resultado: string | null; creado_en: string };
type PagoMin = { importe: number; fecha: string; venta_id: string };

export const ASISTIDAS = ["cerrada", "seguimiento", "perdida"];

export function enRango(iso: string, r: { desde: Date | null; hasta: Date | null }) {
  const t = new Date(iso).getTime();
  return (!r.desde || t >= r.desde.getTime()) && (!r.hasta || t < r.hasta.getTime());
}

function cambioPct(actual: number, previo: number) {
  if (!previo) return actual ? 100 : 0;
  return Math.round(((actual - previo) / previo) * 100);
}

// Carga lo necesario del proyecto una vez y calcula todo en memoria.
// Con el volumen actual (miles de filas) es rápido y sencillo.
// `conPrueba`: un perfil de prueba que mira lo suyo (sin él, lo de los perfiles de prueba no cuenta; 1.0)
// 25 oct 2026: compartido 1 minuto entre todo el equipo (lib/memoria.ts); antes, una carga entera por persona y clic
export function cargarBase(proyecto: Proyecto, conPrueba = false) {
  return enMemoria(`base:${proyecto.id}:${conPrueba}`, UN_MINUTO, () => cargarBaseDeLaBase(proyecto, conPrueba));
}

async function cargarBaseDeLaBase(proyecto: Proyecto, conPrueba: boolean) {
  const pid = proyecto.id;
  const [leads, citasT, ventasT, actividadesT, pagosT, gente, prueba] = await Promise.all([
    todas<LeadMin>((a, b) => db().from("leads").select("id, creado_en, caller_id, closer_id").eq("proyecto_id", pid).order("id").range(a, b)),
    todas<CitaMin>((a, b) =>
      db().from("citas").select("id, lead_id, closer_id, agendada_por, fecha, estado, creado_en").eq("proyecto_id", pid).order("id").range(a, b)
    ),
    todas<VentaMin>((a, b) =>
      db().from("ventas").select("id, lead_id, vendedor_id, facturacion, cash_collected, fecha, producto_id, devuelto, devuelto_en").eq("proyecto_id", pid).order("id").range(a, b)
    ),
    todas<ActMin>((a, b) =>
      db().from("actividades").select("lead_id, perfil_id, tipo, resultado, creado_en").eq("proyecto_id", pid).or("tipo.in.(llamada,whatsapp),and(tipo.eq.cambio_etapa,resultado.not.is.null)").order("id").range(a, b) /* C11: también los resultados de los botones (contactos) */
    ),
    todas<PagoMin>((a, b) => db().from("pagos").select("importe, fecha, venta_id, ventas!inner(proyecto_id)").eq("ventas.proyecto_id", pid).order("id").range(a, b)),
    equipo(pid, conPrueba),
    conPrueba ? Promise.resolve(new Set<string>()) : idsDePrueba(),
  ]);
  const ok = deVerdad(prueba);
  const actividades = actividadesT.filter((a) => ok(a.perfil_id));
  const citas = citasT.filter((c) => ok(c.closer_id) && ok(c.agendada_por));
  const ventas = ventasT.filter((v) => ok(v.vendedor_id));
  const quedan = new Set(ventas.map((v) => v.id));
  const pagos = pagosT.filter((p) => quedan.has(p.venta_id));
  // Arreglo 11: quien ya no está sigue contando en los periodos en que trabajó
  const genteHistorica = await conBajas(gente, [...ventas.map((v) => v.vendedor_id), ...citas.flatMap((c) => [c.closer_id, c.agendada_por]), ...actividades.map((a) => a.perfil_id)]);
  return { leads, citas, ventas: ventas.map((v) => ({ ...v, facturacion: Number(v.facturacion), cash_collected: Number(v.cash_collected) })), actividades, pagos: pagos.map((p) => ({ ...p, importe: Number(p.importe) })), gente: genteHistorica };
}

export type Base = Awaited<ReturnType<typeof cargarBaseDeLaBase>>;

// Cash neto de un grupo de ventas en el periodo, igual que Finanzas y Agendas (arreglos 5 y 7):
// lo cobrado al vender (ventas del periodo) + cuotas cobradas en el periodo − devoluciones del periodo.
export function cashNeto(base: Base, ventasGrupo: Base["ventas"], r: { desde: Date | null; hasta: Date | null }) {
  return cashDelPeriodo(ventasGrupo, base.pagos, r);
}
// Lo mismo sin la base entera (la usa también Ventas desde el 10 oct 2026, para medir el cash igual que Finanzas)
export function cashDelPeriodo(
  ventasGrupo: { id: string; fecha: string; cash_collected: number; devuelto?: number | null; devuelto_en?: string | null }[],
  pagos: { venta_id: string; fecha: string; importe: number }[],
  r: { desde: Date | null; hasta: Date | null }
) {
  const ids = new Set(ventasGrupo.map((v) => v.id));
  const alVender = ventasGrupo.filter((v) => enRango(v.fecha, r)).reduce((s, v) => s + Number(v.cash_collected), 0);
  const cuotas = pagos.filter((pg) => ids.has(pg.venta_id) && enRango(pg.fecha, r)).reduce((s, pg) => s + Number(pg.importe), 0);
  const devuelto = ventasGrupo.filter((v) => v.devuelto && v.devuelto_en && enRango(v.devuelto_en, r)).reduce((s, v) => s + Number(v.devuelto), 0);
  return alVender + cuotas - devuelto;
}

export function calcularFunnel(base: Base, rango: Rango, vendedor: Perfil | null, zona: string, productoId: string | null = null) {
  const de = (id: string | null) => !vendedor || id === vendedor.id;
  const r = rango;
  const p = rango.previo ?? { desde: null, hasta: null };

  const leadsF = base.leads.filter((l) => !vendedor || l.caller_id === vendedor.id || l.closer_id === vendedor.id);
  // Una cita reagendada se sustituye por la nueva: no cuenta dos veces
  const citasF = base.citas.filter((c) => c.estado !== "reagendada" && (!vendedor || c.closer_id === vendedor.id || c.agendada_por === vendedor.id));
  // El filtro por producto solo afecta a ventas, facturación y cash (los leads y citas no tienen producto)
  const ventasF = base.ventas.filter((v) => de(v.vendedor_id) && (!productoId || v.producto_id === productoId));
  const actsF = base.actividades.filter((a) => de(a.perfil_id));

  const leads = leadsF.filter((l) => enRango(l.creado_en, r));
  const leadsPrev = rango.previo ? leadsF.filter((l) => enRango(l.creado_en, p)).length : null;
  const agendados = citasF.filter((c) => enRango(c.creado_en, r));
  const agendadosPrev = rango.previo ? citasF.filter((c) => enRango(c.creado_en, p)).length : null;
  const citasPeriodo = citasF.filter((c) => enRango(c.fecha, r));
  const ventas = ventasF.filter((v) => enRango(v.fecha, r));
  const llamadasCaller = actsF.filter((a) => a.tipo === "llamada" && enRango(a.creado_en, r)).length;
  const citasHechas = citasPeriodo.filter((c) => ASISTIDAS.includes(c.estado)).length;
  const noShow = citasPeriodo.filter((c) => c.estado === "no_show").length;
  const seguimiento = citasPeriodo.filter((c) => c.estado === "seguimiento").length;
  const perdidos = citasPeriodo.filter((c) => c.estado === "perdida" || c.estado === "no_califica").length;
  const pasadas = citasPeriodo.filter((c) => new Date(c.fecha).getTime() < Date.now() && c.estado !== "cancelada" && c.estado !== "reagendada").length;

  const facturacion = ventas.reduce((s, v) => s + v.facturacion, 0);
  const cash = cashNeto(base, ventasF, r);

  // Agendado → Venta (arreglo 6, decisión de Cristian 10 oct 2026): de las personas que agendaron en el
  // periodo, cuántas compraron desde que agendaron (aunque sea después del periodo). Nunca pasa del 100 %.
  // Las ventas no se filtran por vendedor (la del caller cuenta aunque cierre el closer); sí por producto.
  // Se compara por días en la zona del proyecto: una venta con fecha puesta a mano se guarda a las 12:00.
  // Un solo formateador: crearlo en cada llamada hacía el cálculo ~3 veces más lento (medido, paso 0.3)
  const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: zona });
  const diaZona = (iso: string) => fmtDia.format(new Date(iso));
  const primeraAgenda = new Map<string, string>();
  for (const c of agendados) {
    const d = diaZona(c.creado_en);
    if (!primeraAgenda.has(c.lead_id) || d < primeraAgenda.get(c.lead_id)!) primeraAgenda.set(c.lead_id, d);
  }
  const compraron = new Set(
    base.ventas
      .filter((v) => (!productoId || v.producto_id === productoId) && primeraAgenda.has(v.lead_id) && diaZona(v.fecha) >= primeraAgenda.get(v.lead_id)!)
      .map((v) => v.lead_id)
  );

  // Días desde que entra el lead hasta que compra
  const leadPorId = new Map(base.leads.map((l) => [l.id, l]));
  const dias = ventas
    .map((v) => {
      const l = leadPorId.get(v.lead_id);
      return l ? (new Date(v.fecha).getTime() - new Date(l.creado_en).getTime()) / 86_400_000 : null;
    })
    .filter((d): d is number => d !== null && d >= 0);
  const mediaDias = dias.length ? Math.round((dias.reduce((s, d) => s + d, 0) / dias.length) * 10) / 10 : null;

  return {
    facturacion,
    cash,
    ventas: ventas.length,
    llamadas: llamadasCaller + citasHechas,
    llamadasCaller,
    citasHechas,
    mediaDias,
    totalLeads: leads.length,
    cambioLeads: leadsPrev === null ? null : cambioPct(leads.length, leadsPrev),
    agendados: agendados.length,
    cambioAgendados: agendadosPrev === null ? null : cambioPct(agendados.length, agendadosPrev),
    seguimiento,
    noShow,
    perdidos,
    tasas: {
      leadAgendado: porcentaje(agendados.length, leads.length),
      agendadoVenta: porcentaje(compraron.size, primeraAgenda.size),
      noShow: porcentaje(noShow, pasadas),
      // De los leads que llegan al closer (citas hechas + no califica), cuántos se pierden
      perdida: porcentaje(perdidos, citasHechas + citasPeriodo.filter((c) => c.estado === "no_califica").length),
    },
    serie: serieDiaria(rango, zona, leads.map((l) => l.creado_en), ventas.map((v) => ({ fecha: v.fecha, valor: v.facturacion }))),
  };
}

function serieDiaria(rango: Rango, zona: string, leadsFechas: string[], ventas: { fecha: string; valor: number }[]) {
  const fin = rango.hasta ?? new Date();
  let ini = rango.desde;
  if (!ini) {
    const todasF = [...leadsFechas, ...ventas.map((v) => v.fecha)].map((f) => new Date(f).getTime());
    ini = todasF.length ? new Date(Math.min(...todasF)) : new Date(Date.now() - 30 * 86_400_000);
  }
  const dias: string[] = [];
  const d = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(ini)}T12:00:00Z`);
  const ultimo = new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date(Math.min(fin.getTime() - 1, Date.now())));
  while (d.toISOString().slice(0, 10) <= ultimo && dias.length < 400) {
    dias.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: zona });
  const dia = (iso: string) => fmt.format(new Date(iso));
  const ml = new Map<string, number>();
  leadsFechas.forEach((f) => ml.set(dia(f), (ml.get(dia(f)) ?? 0) + 1));
  const mv = new Map<string, number>();
  ventas.forEach((v) => mv.set(dia(v.fecha), (mv.get(dia(v.fecha)) ?? 0) + v.valor));
  const corto = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  return {
    leads: dias.map((x) => ({ dia: corto(x), valor: ml.get(x) ?? 0 })),
    facturacion: dias.map((x) => ({ dia: corto(x), valor: mv.get(x) ?? 0 })),
  };
}

// Tabla por persona: callers y closers.
export function calcularVendedores(base: Base, rango: Rango) {
  const callers = base.gente
    .filter((g) => g.rol === "caller")
    .map((g) => {
      const acts = base.actividades.filter((a) => a.perfil_id === g.id && enRango(a.creado_en, rango));
      const llamadas = acts.filter((a) => a.tipo === "llamada").length;
      const contactos = acts.filter(esContacto).length; // C11 (punto 16): los que avanzan
      const agendas = base.citas.filter((c) => c.agendada_por === g.id && c.estado !== "reagendada" && enRango(c.creado_en, rango)).length;
      const ventas = base.ventas.filter((v) => v.vendedor_id === g.id && enRango(v.fecha, rango));
      const asignados = base.leads.filter((l) => l.caller_id === g.id).length;
      return {
        perfil: g,
        asignados,
        llamadas,
        contactos,
        agendas,
        ventas: ventas.length,
        facturacion: ventas.reduce((s, v) => s + v.facturacion, 0),
        tasaAgenda: porcentaje(agendas, contactos || llamadas),
      };
    });
  const closers = base.gente
    .filter((g) => g.rol === "closer")
    .map((g) => {
      const citas = base.citas.filter((c) => c.closer_id === g.id && enRango(c.fecha, rango));
      const asistidas = citas.filter((c) => ASISTIDAS.includes(c.estado)).length;
      const noShow = citas.filter((c) => c.estado === "no_show").length;
      const ventas = base.ventas.filter((v) => v.vendedor_id === g.id && enRango(v.fecha, rango));
      return {
        perfil: g,
        citas: citas.length,
        asistidas,
        noShow,
        ventas: ventas.length,
        facturacion: ventas.reduce((s, v) => s + v.facturacion, 0),
        cash: cashNeto(base, base.ventas.filter((v) => v.vendedor_id === g.id), rango),
        tasaCierre: porcentaje(ventas.length, asistidas),
      };
    });
  // Quien está de baja solo sale en los periodos en que hizo algo
  const deBaja = (g: Perfil) => "baja" in g && g.baja;
  return {
    callers: callers.filter((c) => !deBaja(c.perfil) || c.llamadas || c.agendas || c.ventas),
    closers: closers.filter((c) => !deBaja(c.perfil) || c.citas || c.ventas || c.cash),
  };
}
