// Métricas de Agendas (V2-1). Sin base de datos: recibe filas y devuelve números (se prueba con tests).
// Definiciones (se enseñan también en la pantalla):
// · Agendadas: citas con fecha en el periodo, menos las «reagendadas» (las sustituye la nueva cita).
// · Asistencias: cerrada, en seguimiento o perdida (hubo llamada). Cerradas: estado «cerrada».
// · Facturación y ventas: ventas de closers con fecha en el periodo.
// · Cash collected (neto): cobrado al vender + cuotas cobradas en el periodo − devoluciones del periodo.
// · Calificados 4★+: asistencias con 4 o 5 estrellas del closer.
import { porcentaje } from "@/lib/formato";
import { enRango } from "@/lib/periodos";
import { SIN_CANAL } from "@/lib/canal";

export type CitaM = {
  id: string;
  lead_id: string;
  closer_id: string | null;
  agendada_por: string | null;
  fecha: string;
  estado: string;
  estrellas_caller: number | null;
  estrellas_closer: number | null;
  canal?: string | null; // plan GHL, fase 4
};
export type VentaM = {
  id: string;
  lead_id: string;
  vendedor_id: string | null;
  producto_id: string | null;
  facturacion: number;
  cash_collected: number;
  fecha: string;
  devuelto: number | null;
  devuelto_en: string | null;
};
export type PagoM = { venta_id: string; importe: number; fecha: string };
export type LeadM = { id: string; pipeline_id: string | null; evento: string | null; seguimiento: Record<string, string> | null };
type RangoM = { desde: Date | null; hasta: Date | null };

export const ASISTIDAS = ["cerrada", "seguimiento", "perdida"];
const ABIERTAS = ["pendiente", "confirmada", "confirmacion_pendiente"];

// canal (plan GHL, fase 4): solo las citas de ese canal, y las ventas de los leads con una cita de ese canal
type FiltrosAgendas = { closerIds: string[]; productoId?: string | null; evento?: string | null; canal?: string | null };

function media(xs: number[]) {
  return xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;
}

export function metricasAgendas(
  datos: { citas: CitaM[]; ventas: VentaM[]; pagos: PagoM[]; leads: LeadM[]; pipelines: { id: string; nombre: string }[] },
  rango: RangoM,
  f: FiltrosAgendas
) {
  const leadPorId = new Map(datos.leads.map((l) => [l.id, l]));
  const delEvento = (leadId: string) => !f.evento || leadPorId.get(leadId)?.evento === f.evento;
  const closers = new Set(f.closerIds);
  const delCanalCita = (c: CitaM) => !f.canal || (c.canal ?? SIN_CANAL) === f.canal;
  const leadsDelCanal = f.canal ? new Set(datos.citas.filter(delCanalCita).map((c) => c.lead_id)) : null;
  const delCanal = (leadId: string) => !leadsDelCanal || leadsDelCanal.has(leadId);

  const citas = datos.citas.filter((c) => c.estado !== "reagendada" && c.closer_id && closers.has(c.closer_id) && enRango(c.fecha, rango) && delEvento(c.lead_id) && delCanalCita(c));
  const reagendadas = datos.citas.filter((c) => c.estado === "reagendada" && c.closer_id && closers.has(c.closer_id) && enRango(c.fecha, rango) && delEvento(c.lead_id) && delCanalCita(c)).length;
  const cuenta = (e: string) => citas.filter((c) => c.estado === e).length;
  const asistencias = citas.filter((c) => ASISTIDAS.includes(c.estado));
  const cerradas = cuenta("cerrada");
  const noShow = cuenta("no_show");
  const canceladas = cuenta("cancelada");
  const perdidas = cuenta("perdida");
  const seguimiento = cuenta("seguimiento");
  const noCalifica = cuenta("no_califica");
  const pendientes = citas.filter((c) => ABIERTAS.includes(c.estado)).length;

  const ventasCloser = datos.ventas.filter((v) => v.vendedor_id && closers.has(v.vendedor_id) && (!f.productoId || v.producto_id === f.productoId) && delEvento(v.lead_id) && delCanal(v.lead_id));
  const ventas = ventasCloser.filter((v) => enRango(v.fecha, rango));
  const facturacion = ventas.reduce((s, v) => s + Number(v.facturacion), 0);
  const idsVentas = new Set(ventasCloser.map((v) => v.id));
  const cobradoVenta = ventas.reduce((s, v) => s + Number(v.cash_collected), 0);
  const cobradoCuotas = datos.pagos.filter((p) => idsVentas.has(p.venta_id) && enRango(p.fecha, rango)).reduce((s, p) => s + Number(p.importe), 0);
  const devueltas = ventasCloser.filter((v) => v.devuelto && enRango(v.devuelto_en, rango));
  const devuelto = devueltas.reduce((s, v) => s + Number(v.devuelto), 0);

  const estrellasCloser = asistencias.map((c) => c.estrellas_closer).filter((x): x is number => !!x);
  const estrellasCaller = citas.map((c) => c.estrellas_caller).filter((x): x is number => !!x);

  // Agendas por fuente: pipeline del lead, o utm_source
  const nombrePipe = new Map(datos.pipelines.map((p) => [p.id, p.nombre]));
  const agrupar = (clave: (c: CitaM) => string) => {
    const m = new Map<string, number>();
    for (const c of citas) m.set(clave(c), (m.get(clave(c)) ?? 0) + 1);
    return [...m.entries()].map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n);
  };
  const porPipeline = agrupar((c) => nombrePipe.get(leadPorId.get(c.lead_id)?.pipeline_id ?? "") ?? "Sin pipeline");
  const porUtm = agrupar((c) => leadPorId.get(c.lead_id)?.seguimiento?.utm_source || "Sin UTM");

  return {
    agendadas: citas.length,
    asistencias: asistencias.length,
    cerradas,
    perdidas,
    noShow,
    reagendadas,
    canceladas,
    seguimiento,
    noCalifica,
    pendientes,
    facturacion,
    ventas: ventas.length,
    cash: cobradoVenta + cobradoCuotas - devuelto,
    cashBruto: cobradoVenta + cobradoCuotas,
    devoluciones: devueltas.length,
    devuelto,
    pctDevoluciones: porcentaje(devueltas.length, ventas.length),
    ticketMedio: ventas.length ? facturacion / ventas.length : 0,
    pctCierre: porcentaje(cerradas, asistencias.length), // sobre asistencias
    pctCallClose: porcentaje(cerradas, citas.length), // sobre agendadas
    tasaAsistencia: porcentaje(asistencias.length, asistencias.length + noShow),
    tasaCancelacion: porcentaje(canceladas, citas.length),
    calificados: estrellasCloser.filter((e) => e >= 4).length,
    con5: estrellasCloser.filter((e) => e === 5).length,
    mediaEstrellasCloser: media(estrellasCloser),
    mediaEstrellasCaller: media(estrellasCaller),
    porPipeline,
    porUtm,
  };
}

export type MetricasAgendas = ReturnType<typeof metricasAgendas>;
