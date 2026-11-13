// Clientes (V2-7): quien ha comprado. Cálculos sin base de datos.
import { detalleVencimientos, pendienteDe, type PagoF, type VencF, type VentaF } from "@/lib/finanzas";

export type EstadoCliente = "activo" | "pausado" | "abandonado";
export const ESTADOS_CLIENTE: { v: EstadoCliente; t: string }[] = [
  { v: "activo", t: "Activo" },
  { v: "pausado", t: "Pausado" },
  { v: "abandonado", t: "Abandonado" },
];
export type FichaCliente = {
  lead_id: string;
  estado: EstadoCliente;
  proximo_contacto: string | null;
  caso_exito: boolean;
  caso_resultado: string | null;
  caso_enlace: string | null;
  caso_fecha: string | null;
  onboarding: Record<string, string>;
};
const fichaVacia = (leadId: string): FichaCliente => ({ lead_id: leadId, estado: "activo", proximo_contacto: null, caso_exito: false, caso_resultado: null, caso_enlace: null, caso_fecha: null, onboarding: {} });

// Una fila por cliente con lo que compró, pagó y le falta (sale de Ventas y Finanzas)
export function resumenClientes(d: { ventas: VentaF[]; pagos: PagoF[]; vencimientos: VencF[]; fichas: FichaCliente[] }, hoy: string) {
  const ficha = new Map(d.fichas.map((f) => [f.lead_id, f]));
  const det = detalleVencimientos(d.vencimientos, d.pagos, hoy);
  const porLead = new Map<string, VentaF[]>();
  for (const v of d.ventas) porLead.set(v.lead_id, [...(porLead.get(v.lead_id) ?? []), v]);
  return [...porLead.entries()].map(([leadId, ventas]) => {
    const ids = new Set(ventas.map((v) => v.id));
    const pagado = ventas.reduce((s, v) => s + v.cash_collected, 0) + d.pagos.filter((p) => ids.has(p.venta_id)).reduce((s, p) => s + p.importe, 0);
    const proximo = d.vencimientos
      .filter((x) => x.venta_id && ids.has(x.venta_id) && ["por_vencer", "vencido"].includes(det.get(x.id)?.estado ?? ""))
      .sort((a, b) => a.vence_el.localeCompare(b.vence_el))[0];
    return {
      lead_id: leadId,
      ficha: ficha.get(leadId) ?? fichaVacia(leadId),
      productos: [...new Set(ventas.map((v) => v.producto_id).filter((x): x is string => !!x))],
      comprado: ventas.reduce((s, v) => s + v.facturacion, 0),
      pagado,
      devuelto: ventas.reduce((s, v) => s + (v.devuelto ?? 0), 0),
      falta: ventas.reduce((s, v) => s + pendienteDe(v, d.pagos), 0),
      proximoPlazo: proximo ? { fecha: proximo.vence_el, importe: det.get(proximo.id)!.falta, vencido: det.get(proximo.id)!.estado === "vencido" } : null,
      desde: ventas.map((v) => v.fecha).sort()[0],
    };
  });
}

// Seguimiento: vencidos / hoy / próximos / sin fecha
export function grupoSeguimiento(proximo: string | null, hoy: string) {
  if (!proximo) return "sin_fecha" as const;
  if (proximo < hoy) return "vencido" as const;
  if (proximo === hoy) return "hoy" as const;
  return "proximo" as const;
}

// % de pasos del onboarding hechos (solo cuentan los pasos que existen hoy)
export function progresoOnboarding(hechos: Record<string, string>, pasos: { id: string }[]) {
  if (!pasos.length) return 0;
  return Math.round((pasos.filter((p) => hechos[p.id]).length / pasos.length) * 100);
}
