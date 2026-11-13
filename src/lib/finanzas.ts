// Cálculos de Finanzas (V2-6). Sin base de datos: recibe filas y devuelve números.
// Definiciones (se enseñan en la «Guía financiera»):
// · Facturación: valor de las ventas con fecha en el periodo.
// · Cash collected: lo cobrado en el periodo (al vender + cuotas/resto) − devoluciones del periodo.
// · De dónde viene el cash: venta nueva (cobrado al vender), cuotas (cobros posteriores) y back-end (todo lo cobrado de programas «back-end offer»).
// · Profit (caja): cash collected + ingresos extra − gastos que cuentan en el profit.
// · ROAS: cash collected ÷ gastos que cuentan en el profit (cuántos € entran por cada € gastado).
// · Comisiones: se pagan sobre lo cobrado en el mes; se enseña también sobre lo facturado. Las devoluciones no restan (la empresa las asume).
import { enRango } from "@/lib/periodos";
import { diaEnZona } from "@/lib/llamadas";
import { pctDeTramo, porcentajeComision, redondear, TRAMOS_DEFECTO, type ComisionPersona, type ComisionProducto, type ComisionRol, type ModoComision, type TramosComision } from "@/lib/comisiones";

type R = { desde: Date | null; hasta: Date | null };
export type VentaF = { id: string; lead_id: string; producto_id: string | null; vendedor_id: string | null; facturacion: number; cash_collected: number; fecha: string; metodo: string; tipo_pago: string; devuelto: number | null; devuelto_en: string | null };
export type PagoF = { id: string; venta_id: string; importe: number; fecha: string; metodo: string };
export type MovF = { id: string; tipo: "ingreso" | "egreso" | "transferencia"; importe: number; fecha: string; categoria_id: string | null; cuenta_id: string | null; cuenta_destino_id: string | null; conciliado: boolean };
export type CatF = { id: string; tipo: "ingreso" | "egreso"; nombre: string; en_profit: boolean };
export type CuentaF = { id: string; nombre: string; metodos: string[]; por_defecto: boolean };
export type Cobro = { fecha: string; importe: number; venta_id: string; metodo: string; clase: "venta_nueva" | "cuota" | "backend" };

const n = (x: unknown) => Number(x) || 0;

function cobrosDe(ventas: VentaF[], pagos: PagoF[], backend: Set<string>): Cobro[] {
  const porId = new Map(ventas.map((v) => [v.id, v]));
  const esBack = (v: VentaF | undefined) => !!v?.producto_id && backend.has(v.producto_id);
  return [
    ...ventas.filter((v) => n(v.cash_collected) > 0).map((v) => ({ fecha: v.fecha, importe: n(v.cash_collected), venta_id: v.id, metodo: v.metodo, clase: esBack(v) ? ("backend" as const) : ("venta_nueva" as const) })),
    ...pagos.filter((p) => porId.has(p.venta_id)).map((p) => ({ fecha: p.fecha, importe: n(p.importe), venta_id: p.venta_id, metodo: p.metodo, clase: esBack(porId.get(p.venta_id)) ? ("backend" as const) : ("cuota" as const) })),
  ];
}

export function pendienteDe(v: VentaF, pagos: PagoF[]) {
  return Math.max(0, n(v.facturacion) - n(v.cash_collected) - pagos.filter((p) => p.venta_id === v.id).reduce((s, p) => s + n(p.importe), 0));
}

export function resumenFinanzas(d: { ventas: VentaF[]; pagos: PagoF[]; movimientos: MovF[]; categorias: CatF[]; backend: Set<string>; vencimientos?: VencF[] }, r: R, zona = "America/New_York") {
  const cobros = cobrosDe(d.ventas, d.pagos, d.backend).filter((c) => enRango(c.fecha, r));
  const devuelto = d.ventas.filter((v) => v.devuelto && enRango(v.devuelto_en, r)).reduce((s, v) => s + n(v.devuelto), 0);
  const cuenta = new Map(d.categorias.map((c) => [c.id, c]));
  const movs = d.movimientos.filter((m) => enRango(m.fecha, r));
  const ingresosExtra = movs.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + n(m.importe), 0);
  const egresos = movs.filter((m) => m.tipo === "egreso");
  // Un gasto sin categoría cuenta en el profit (para no esconder gastos)
  const egresosProfit = egresos.filter((m) => !m.categoria_id || cuenta.get(m.categoria_id)?.en_profit !== false).reduce((s, m) => s + n(m.importe), 0);
  const cash = cobros.reduce((s, c) => s + c.importe, 0) - devuelto;
  const porDia = new Map<string, number>();
  for (const c of cobros) {
    const dia = diaEnZona(c.fecha, zona);
    porDia.set(dia, (porDia.get(dia) ?? 0) + c.importe);
  }
  return {
    facturacion: d.ventas.filter((v) => enRango(v.fecha, r)).reduce((s, v) => s + n(v.facturacion), 0),
    cash: redondear(cash),
    devuelto,
    deDonde: {
      ventaNueva: cobros.filter((c) => c.clase === "venta_nueva").reduce((s, c) => s + c.importe, 0),
      cuotas: cobros.filter((c) => c.clase === "cuota").reduce((s, c) => s + c.importe, 0),
      backend: cobros.filter((c) => c.clase === "backend").reduce((s, c) => s + c.importe, 0),
    },
    ingresosExtra,
    egresos: egresos.reduce((s, m) => s + n(m.importe), 0),
    egresosProfit,
    profit: redondear(cash + ingresosExtra - egresosProfit),
    roas: egresosProfit > 0 ? Math.round((cash / egresosProfit) * 100) / 100 : null,
    // Solo si llegan los plazos (el Resumen los pasa); es una foto de hoy, no depende del periodo
    porCobrar: d.vencimientos ? totalPorCobrar(d.vencimientos, d.pagos, diaEnZona(new Date().toISOString(), zona)) : null,
    porDia,
  };
}

export function cambio(actual: number, previo: number) {
  if (!previo) return actual ? 100 : 0;
  return Math.round(((actual - previo) / Math.abs(previo)) * 100);
}

// Saldo de cada cuenta: los cobros van a la cuenta de su método (o a la de por defecto)
export function saldosCuentas(cuentas: CuentaF[], d: { ventas: VentaF[]; pagos: PagoF[]; movimientos: MovF[] }, r: R) {
  const defecto = cuentas.find((c) => c.por_defecto) ?? cuentas[0];
  const deMetodo = (m: string) => cuentas.find((c) => c.metodos.includes(m))?.id ?? defecto?.id;
  const res = new Map(cuentas.map((c) => [c.id, { saldo: 0, entro: 0, salio: 0 }]));
  const sumar = (id: string | null | undefined, importe: number, fecha: string) => {
    const x = res.get(id ?? defecto?.id ?? "");
    if (!x) return;
    x.saldo += importe;
    if (enRango(fecha, r)) {
      if (importe > 0) x.entro += importe;
      else x.salio -= importe;
    }
  };
  for (const c of cobrosDe(d.ventas, d.pagos, new Set())) sumar(deMetodo(c.metodo), c.importe, c.fecha);
  for (const v of d.ventas) if (v.devuelto && v.devuelto_en) sumar(deMetodo(v.metodo), -n(v.devuelto), v.devuelto_en);
  for (const m of d.movimientos) {
    if (m.tipo === "ingreso") sumar(m.cuenta_id, n(m.importe), m.fecha);
    else if (m.tipo === "egreso") sumar(m.cuenta_id, -n(m.importe), m.fecha);
    else {
      sumar(m.cuenta_id, -n(m.importe), m.fecha);
      sumar(m.cuenta_destino_id, n(m.importe), m.fecha);
    }
  }
  return res;
}

// Estado de los plazos de una venta: los cobros posteriores van tapando los plazos por orden de fecha
export type VencF = { id: string; venta_id: string | null; importe: number; vence_el: string; estado: "pendiente" | "pagado" | "no_paga" };
type EstadoVenc = "pagado" | "por_vencer" | "vencido" | "no_paga";
export function estadoVencimientos(vencs: VencF[], pagos: PagoF[], hoy: string) {
  return new Map([...detalleVencimientos(vencs, pagos, hoy)].map(([id, d]) => [id, d.estado]));
}

// Igual, y además cuánto falta de cada plazo (un cobro parcial tapa parte del plazo)
export function detalleVencimientos(vencs: VencF[], pagos: PagoF[], hoy: string) {
  const porVenta = new Map<string, VencF[]>();
  for (const v of vencs) if (v.venta_id) porVenta.set(v.venta_id, [...(porVenta.get(v.venta_id) ?? []), v]);
  const fuera = new Map<string, { estado: EstadoVenc; falta: number }>();
  for (const [ventaId, lista] of porVenta) {
    let pagado = pagos.filter((p) => p.venta_id === ventaId).reduce((s, p) => s + n(p.importe), 0);
    for (const v of [...lista].sort((a, b) => a.vence_el.localeCompare(b.vence_el))) {
      if (v.estado === "no_paga") fuera.set(v.id, { estado: "no_paga", falta: n(v.importe) });
      else if (pagado + 0.009 >= n(v.importe)) {
        pagado -= n(v.importe);
        fuera.set(v.id, { estado: "pagado", falta: 0 });
      } else {
        fuera.set(v.id, { estado: v.vence_el < hoy ? "vencido" : "por_vencer", falta: redondear(n(v.importe) - pagado) });
        pagado = 0;
      }
    }
  }
  for (const v of vencs)
    if (!v.venta_id) {
      const estado: EstadoVenc = v.estado === "pagado" ? "pagado" : v.estado === "no_paga" ? "no_paga" : v.vence_el < hoy ? "vencido" : "por_vencer";
      fuera.set(v.id, { estado, falta: estado === "pagado" ? 0 : n(v.importe) });
    }
  return fuera;
}

// Arreglo 12: «Cuentas por cobrar» del Resumen = «Total por cobrar» de Pagos pendientes: lo que falta de los
// plazos por vencer y vencidos (sin los marcados «no paga» ni los ya cobrados). El mismo cálculo en las dos pantallas.
export function totalPorCobrar(vencs: VencF[], pagos: PagoF[], hoy: string) {
  let total = 0;
  for (const d of detalleVencimientos(vencs, pagos, hoy).values()) if (d.estado === "por_vencer" || d.estado === "vencido") total += d.falta;
  return redondear(total);
}

// Plazos al vender: reserva = el resto en un plazo (a 30 días); cuotas = una cada mes; mensual (membresía sin fin,
// bloque A) = el mes que viene otra vez el mismo importe (los siguientes los crea asegurarPlazosMensuales)
export function planDePagos(o: { facturacion: number; cobradoHoy: number; tipo: string; numCuotas: number | null; fecha: string }) {
  if (o.tipo === "mensual") return [{ numero: 2, importe: redondear(o.facturacion), vence_el: siguienteMes(o.fecha.slice(0, 10)) }];
  const resto = redondear(o.facturacion - o.cobradoHoy);
  if (resto <= 0.009) return [];
  const sumarDias = (d: number) => new Date(new Date(o.fecha).getTime() + d * 86_400_000).toISOString().slice(0, 10);
  const sumarMeses = (m: number) => {
    const d = new Date(o.fecha);
    d.setUTCMonth(d.getUTCMonth() + m);
    return d.toISOString().slice(0, 10);
  };
  if (o.tipo === "cuotas" && o.numCuotas && o.numCuotas >= 2) {
    const quedan = o.cobradoHoy > 0 ? o.numCuotas - 1 : o.numCuotas;
    const cada = Math.floor((resto / quedan) * 100) / 100;
    return Array.from({ length: quedan }, (_, i) => ({ numero: i + (o.cobradoHoy > 0 ? 2 : 1), importe: i === quedan - 1 ? redondear(resto - cada * (quedan - 1)) : cada, vence_el: sumarMeses(i + (o.cobradoHoy > 0 ? 1 : 0)) }));
  }
  return [{ numero: 1, importe: resto, vence_el: sumarDias(30) }];
}

// El mismo día del mes siguiente («AAAA-MM-DD»); si no existe (31 → 30), el último del mes
export function siguienteMes(ymd: string) {
  const [a, m, d] = ymd.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

// Membresía (bloque A): siempre hay un cobro del mes siguiente pendiente mientras no se dé de baja. Devuelve los
// plazos que faltan crear para que el último plazo de cada venta mensual quede después de `hoy`.
export function plazosMensualesQueFaltan(ventas: { id: string; lead_id: string; facturacion: number; fecha: string; tipo_pago: string; baja_en: string | null }[], plazos: { venta_id: string | null; numero: number; vence_el: string }[], hoy: string) {
  const nuevos: { venta_id: string; lead_id: string; numero: number; importe: number; vence_el: string }[] = [];
  for (const v of ventas) {
    if (v.tipo_pago !== "mensual" || v.baja_en) continue;
    const suyos = plazos.filter((p) => p.venta_id === v.id);
    let numero = Math.max(1, ...suyos.map((p) => p.numero));
    let ultimo = suyos.length ? suyos.map((p) => p.vence_el).sort().at(-1)! : v.fecha.slice(0, 10);
    while (ultimo <= hoy && nuevos.length < 1000) {
      ultimo = siguienteMes(ultimo);
      numero++;
      nuevos.push({ venta_id: v.id, lead_id: v.lead_id, numero, importe: redondear(v.facturacion), vence_el: ultimo });
    }
  }
  return nuevos;
}

// ---------- Liquidaciones del mes ----------
// Bloque 4 de 1.0: quien va por tramos cobra el % del tramo que alcanzó en el mes de cada venta (con la facturación
// de todas sus ventas de ese mes); quien va con «su % propio», el de siempre. Los productos que no cuentan para
// comisión (la Membresía, de momento) no pagan comisión a nadie ni suman para el tramo.
export type PersonaL = { perfil_id: string; nombre: string; rol: "ceo" | "director" | "closer" | "caller"; comision: ComisionPersona; modo?: ModoComision };
export type CitaL = { lead_id: string; closer_id: string | null; agendada_por: string | null; estado: string; fecha: string };
export type LineaL = { venta_id: string; lead_id: string; producto_id: string | null; tipo: "venta" | "agenda"; pct: number; facturado: number; cobrado: number; com_facturado: number; com_cobrado: number; tramo?: boolean };

export function liquidacionesMes(d: {
  ventas: VentaF[];
  pagos: PagoF[];
  citas: CitaL[];
  personas: PersonaL[];
  comisionesRol: Partial<Record<string, ComisionRol>>;
  productos: Map<string, ComisionProducto>;
  mes: R; // rango del mes
  tramos?: TramosComision;
  sinComision?: Set<string>; // productos que no cuentan para comisión
  zona?: string;
}) {
  const persona = new Map(d.personas.map((p) => [p.perfil_id, p]));
  const tramos = d.tramos ?? TRAMOS_DEFECTO;
  const zona = d.zona ?? "America/New_York";
  const mesDe = (iso: string) => diaEnZona(iso, zona).slice(0, 7);
  const porTramos = (p: PersonaL | undefined): p is PersonaL & { rol: "caller" | "closer" } => !!p && p.modo === "tramos" && (p.rol === "caller" || p.rol === "closer");
  const cuenta = (v: VentaF) => !(v.producto_id && d.sinComision?.has(v.producto_id));
  // El caller que agendó la cita que cerró el closer
  const callerDe = (v: VentaF, vendedor: PersonaL | undefined) => {
    if (vendedor?.rol !== "closer") return undefined;
    const cita = d.citas
      .filter((c) => c.lead_id === v.lead_id && c.estado === "cerrada" && c.closer_id === vendedor.perfil_id && c.agendada_por)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const caller = cita?.agendada_por ? persona.get(cita.agendada_por) : undefined;
    return caller?.rol === "caller" ? caller : undefined;
  };

  // Facturación de cada persona por tramos en cada mes (todas las ventas, para las cuotas de meses anteriores)
  const base = new Map<string, number>(); // «perfil|AAAA-MM»
  const sumar = (p: PersonaL | undefined, v: VentaF) => {
    if (!porTramos(p)) return;
    const k = `${p.perfil_id}|${mesDe(v.fecha)}`;
    base.set(k, (base.get(k) ?? 0) + n(v.facturacion));
  };
  for (const v of d.ventas) {
    if (!cuenta(v)) continue;
    const vendedor = v.vendedor_id ? persona.get(v.vendedor_id) : undefined;
    sumar(vendedor, v);
    sumar(callerDe(v, vendedor), v);
  }
  const pctTramo = (p: PersonaL & { rol: "caller" | "closer" }, v: VentaF) => pctDeTramo(tramos[p.rol], base.get(`${p.perfil_id}|${mesDe(v.fecha)}`) ?? 0);

  const lineas = new Map<string, LineaL[]>();
  const anadir = (perfilId: string, l: LineaL) => {
    if (l.com_cobrado <= 0 && l.com_facturado <= 0) return;
    lineas.set(perfilId, [...(lineas.get(perfilId) ?? []), l]);
  };
  for (const v of d.ventas) {
    if (!cuenta(v)) continue;
    const facturado = enRango(v.fecha, d.mes) ? n(v.facturacion) : 0;
    const cobrado = (enRango(v.fecha, d.mes) ? n(v.cash_collected) : 0) + d.pagos.filter((p) => p.venta_id === v.id && enRango(p.fecha, d.mes)).reduce((s, p) => s + n(p.importe), 0);
    if (!facturado && !cobrado) continue;
    const prod = v.producto_id ? d.productos.get(v.producto_id) ?? null : null;
    const vendedor = v.vendedor_id ? persona.get(v.vendedor_id) : undefined;
    if (vendedor) {
      const pct = porTramos(vendedor) ? pctTramo(vendedor, v) : porcentajeComision({ tipo: "venta", rol: vendedor.rol, persona: vendedor.comision, producto: prod, productoId: v.producto_id, deRol: d.comisionesRol[vendedor.rol] }).pct;
      anadir(vendedor.perfil_id, { venta_id: v.id, lead_id: v.lead_id, producto_id: v.producto_id, tipo: "venta", pct, facturado, cobrado, com_facturado: redondear((facturado * pct) / 100), com_cobrado: redondear((cobrado * pct) / 100), ...(porTramos(vendedor) ? { tramo: true } : {}) });
    }
    const caller = callerDe(v, vendedor);
    if (caller) {
      const pct = porTramos(caller) ? pctTramo(caller, v) : porcentajeComision({ tipo: "agenda", rol: "caller", persona: caller.comision, producto: prod, productoId: v.producto_id, deRol: d.comisionesRol.caller }).pct;
      anadir(caller.perfil_id, { venta_id: v.id, lead_id: v.lead_id, producto_id: v.producto_id, tipo: "agenda", pct, facturado, cobrado, com_facturado: redondear((facturado * pct) / 100), com_cobrado: redondear((cobrado * pct) / 100), ...(porTramos(caller) ? { tramo: true } : {}) });
    }
  }
  // El tramo alcanzado en el mes que se liquida (a la vista en Liquidaciones)
  const mesLiquidado = d.mes.desde ? mesDe(d.mes.desde.toISOString()) : null;
  const tramoDe = (perfilId: string) => {
    const p = persona.get(perfilId);
    if (!porTramos(p) || !mesLiquidado) return null;
    const b = redondear(base.get(`${perfilId}|${mesLiquidado}`) ?? 0);
    return { base: b, pct: pctDeTramo(tramos[p.rol], b) };
  };
  return [...lineas.entries()].map(([perfil_id, ls]) => ({
    perfil_id,
    base_facturado: redondear(ls.reduce((s, l) => s + l.facturado, 0)),
    base_cobrado: redondear(ls.reduce((s, l) => s + l.cobrado, 0)),
    comision_facturado: redondear(ls.reduce((s, l) => s + l.com_facturado, 0)),
    comision_cobrado: redondear(ls.reduce((s, l) => s + l.com_cobrado, 0)),
    tramo: tramoDe(perfil_id),
    detalle: ls,
  }));
}
