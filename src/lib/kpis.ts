import "server-only";
import { esContacto } from "@/lib/estados-caller";
import { porcentaje, type Rango } from "@/lib/formato";
import { ASISTIDAS, enRango, cashNeto, type Base } from "@/lib/metricas";
import { esCloser, type Perfil } from "@/lib/tipos";

// KPIs de callers y closers (Paso H2, decisiones de Cristian del 10 oct 2026).
// Todo por persona y para el periodo elegido; se cuentan personas (leads distintos), no llamadas.
// La fila «total» usa las mismas reglas con todo el grupo (un lead que tocan dos callers cuenta una vez).

export type KpiCaller = ReturnType<typeof kpiCaller>;
export type KpiCloser = ReturnType<typeof kpiCloser>;

// Sin nada sobre lo que calcular, «—» en vez de un 0 % engañoso
const tasa = (parte: number, total: number) => (total ? porcentaje(parte, total) : null);

function agrupar<T>(filas: T[], clave: (f: T) => string | null) {
  const m = new Map<string, T[]>();
  for (const f of filas) {
    const k = clave(f);
    if (k === null) continue;
    const lista = m.get(k);
    if (lista) lista.push(f);
    else m.set(k, [f]);
  }
  return m;
}

export type Indices = {
  base: Base;
  rango: Rango;
  dia: (iso: string) => string;
  ahora: number;
  citasPorLead: Map<string, Base["citas"]>;
  ventasPorLead: Map<string, Base["ventas"]>;
  pagosPorVenta: Map<string, Base["pagos"]>;
};

export function kpiCaller(ix: Indices, ids: Set<string>) {
  const { base, rango, dia, ahora } = ix;
  const acts = base.actividades.filter((a) => a.perfil_id !== null && ids.has(a.perfil_id) && enRango(a.creado_en, rango));
  const llamadas = acts.filter((a) => a.tipo === "llamada").length;
  // Contactado = le llamó o le mandó un WhatsApp · contesta = el lead avanzó (C11, punto 16: No interesa, Seguimiento,
  // Llamar luego, Agendado, Confirma Agenda, Reagendado o Cerrados; desde el 10 nov también Link de agenda y Wsp enviado)
  // N8 (13 nov): desde el 7 nov los botones apuntan «cambio_etapa», no «llamada»; quien contesta o «No responde» también fue contactado
  const contactados = new Set(acts.filter((a) => a.tipo === "llamada" || a.tipo === "whatsapp" || a.resultado === "no_responde" || esContacto(a)).map((a) => a.lead_id));
  const contestan = new Set(acts.filter(esContacto).map((a) => a.lead_id));

  // Agendados: leads con una cita creada por él en el periodo (también si luego se reagendó)
  const t = (iso: string) => new Date(iso).getTime();
  const primeraAgenda = new Map<string, string>();
  for (const c of base.citas) {
    if (!c.agendada_por || !ids.has(c.agendada_por) || !enRango(c.creado_en, rango)) continue;
    const previa = primeraAgenda.get(c.lead_id);
    if (!previa || t(c.creado_en) < t(previa)) primeraAgenda.set(c.lead_id, c.creado_en);
  }
  // «Agendar» cuenta como llamada contestada (en la app, agendar no apunta una llamada)
  for (const lead of primeraAgenda.keys()) {
    contactados.add(lead);
    contestan.add(lead);
  }

  let cerrados = 0;
  let conCitaPasada = 0;
  let asistidos = 0;
  let cerradosAsistidos = 0;
  for (const [lead, desde] of primeraAgenda) {
    // Cerrado: compró desde el día de su agenda y la venta la hizo otro (su low ticket va aparte)
    const cerrado = (ix.ventasPorLead.get(lead) ?? []).some((v) => !(v.vendedor_id && ids.has(v.vendedor_id)) && dia(v.fecha) >= dia(desde));
    // Asistencia: cuenta cualquier cita del lead desde su agenda (aunque la reagendara el closer)
    const citas = (ix.citasPorLead.get(lead) ?? []).filter((c) => t(c.creado_en) >= t(desde) && c.estado !== "cancelada" && c.estado !== "reagendada");
    const asistio = citas.some((c) => ASISTIDAS.includes(c.estado));
    const pasada = asistio || citas.some((c) => new Date(c.fecha).getTime() < ahora);
    if (cerrado) cerrados++;
    if (pasada) conCitaPasada++;
    if (asistio) asistidos++;
    if (cerrado && asistio) cerradosAsistidos++;
  }

  const lowTicket = base.ventas.filter((v) => v.vendedor_id && ids.has(v.vendedor_id) && enRango(v.fecha, rango));
  const agendados = primeraAgenda.size;
  return {
    llamadas,
    contactados: contactados.size,
    contestan: contestan.size,
    agendados,
    cerrados,
    citasPasadas: conCitaPasada,
    asistidos,
    lowTicketVentas: lowTicket.length,
    lowTicketFacturacion: lowTicket.reduce((s, v) => s + v.facturacion, 0),
    agendaSobreContactado: tasa(agendados, contactados.size),
    agendaSobreContesta: tasa(agendados, contestan.size),
    cierreSobreContactado: tasa(cerrados, contactados.size),
    cierreSobreAgendado: tasa(cerrados, agendados),
    asistencia: tasa(asistidos, conCitaPasada),
    // Solo los cerrados que asistieron: así nunca pasa del 100 %
    cierreSobreAsistencia: tasa(cerradosAsistidos, asistidos),
  };
}

export function kpiCloser(ix: Indices, ids: Set<string>) {
  const { base, rango } = ix;
  const citas = base.citas.filter((c) => c.closer_id && ids.has(c.closer_id) && enRango(c.fecha, rango) && c.estado !== "reagendada" && c.estado !== "cancelada");
  const asistidas = citas.filter((c) => ASISTIDAS.includes(c.estado)).length;
  // Citas atendidas (H3): las ya registradas por el closer, viniera o no el lead
  const atendidas = citas.filter((c) => ATENDIDAS.includes(c.estado)).length;
  const cerradas = citas.filter((c) => c.estado === "cerrada").length;
  const noShow = citas.filter((c) => c.estado === "no_show").length; // para el Ranking (11 oct)
  const suyas = base.ventas.filter((v) => v.vendedor_id && ids.has(v.vendedor_id));
  const delPeriodo = suyas.filter((v) => enRango(v.fecha, rango));
  const facturacion = delPeriodo.reduce((s, v) => s + v.facturacion, 0);
  // B · Cobrado de lo vendido: de las ventas del periodo, lo cobrado (al vender + cuotas) − devoluciones, como en Ventas
  const cobradoDeLoVendido = delPeriodo.reduce(
    (s, v) => s + v.cash_collected + (ix.pagosPorVenta.get(v.id) ?? []).reduce((t, p) => t + p.importe, 0) - Number(v.devuelto ?? 0),
    0
  );
  return {
    citas: citas.length,
    asistidas,
    atendidas,
    cerradas,
    noShow,
    ventas: delPeriodo.length,
    facturacion,
    // Cash del periodo, igual que Finanzas y el Funnel
    cash: cashNeto(base, suyas, rango),
    cobradoDeLoVendido,
    cierreSobreAgenda: tasa(cerradas, citas.length),
    cierreSobreAsistencia: tasa(cerradas, asistidas),
    pctCobrado: tasa(cobradoDeLoVendido, facturacion),
  };
}

const ATENDIDAS = [...ASISTIDAS, "no_show", "no_califica"];

export function indices(base: Base, rango: Rango, zona: string): Indices {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: zona });
  return {
    base,
    rango,
    dia: (iso) => fmt.format(new Date(iso)),
    ahora: Date.now(),
    citasPorLead: agrupar(base.citas, (c) => c.lead_id),
    ventasPorLead: agrupar(base.ventas, (v) => v.lead_id),
    pagosPorVenta: agrupar(base.pagos, (p) => p.venta_id),
  };
}

export function calcularKpis(base: Base, rango: Rango, zona: string) {
  const ix = indices(base, rango, zona);
  const deBaja = (g: Perfil) => "baja" in g && !!g.baja;

  const gCallers = base.gente.filter((g) => g.rol === "caller");
  const callers = gCallers
    .map((g) => ({ perfil: g, ...kpiCaller(ix, new Set([g.id])) }))
    .filter((c) => !deBaja(c.perfil) || c.llamadas || c.contactados || c.agendados || c.lowTicketVentas);

  const gClosers = base.gente.filter(esCloser);
  const closersSin = gClosers
    .map((g) => ({ perfil: g, ...kpiCloser(ix, new Set([g.id])) }))
    .filter((c) => !deBaja(c.perfil) || c.citas || c.ventas || c.cash);
  const totalCloser = kpiCloser(ix, new Set(gClosers.map((g) => g.id)));
  // A · Su parte del total: frente a lo de todos los closers (interpretación de Claude, ver Paso H2)
  const parte = (c: { facturacion: number; cash: number }) => ({
    parteFacturacion: tasa(c.facturacion, totalCloser.facturacion),
    parteCash: tasa(c.cash, totalCloser.cash),
  });

  return {
    callers,
    totalCallers: kpiCaller(ix, new Set(gCallers.map((g) => g.id))),
    closers: closersSin.map((c) => ({ ...c, ...parte(c) })),
    totalClosers: { ...totalCloser, ...parte(totalCloser) },
  };
}
