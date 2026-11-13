import "server-only";
import { db, todas, porTrozos, idsDePrueba, deVerdad } from "@/lib/datos";
import { hoyEnZona } from "@/lib/formato";
import { plazosMensualesQueFaltan } from "@/lib/finanzas";
import type { CatF, CuentaF, MovF, PagoF, VentaF, VencF } from "@/lib/finanzas";

const CATEGORIAS = [
  { tipo: "egreso", nombre: "Publicidad" },
  { tipo: "egreso", nombre: "Comisiones" },
  { tipo: "egreso", nombre: "Herramientas" },
  { tipo: "egreso", nombre: "Equipo" },
  { tipo: "egreso", nombre: "Otros gastos" },
  { tipo: "ingreso", nombre: "Otros ingresos" },
];

// La primera vez: una cuenta «Todo» (recibe todo lo que no esté en otra cuenta) y las categorías básicas.
// Si dos páginas lo hacen a la vez, la base no deja repetir (índice único): el segundo intento falla sin más.
export async function asegurarFinanzas(proyectoId: string) {
  const [cuentas, cats] = await Promise.all([
    db().from("cuentas").select("id", { count: "exact", head: true }).eq("proyecto_id", proyectoId),
    db().from("categorias_finanzas").select("id", { count: "exact", head: true }).eq("proyecto_id", proyectoId),
  ]);
  // D43: si falla leer, se corta (antes un fallo contaba como «0» y volvía a crearlas)
  if (cuentas.error || cats.error) throw new Error(`No se pudieron leer cuentas y categorías: ${(cuentas.error ?? cats.error)!.message}`);
  const [c, k] = await Promise.all([
    cuentas.count ? null : db().from("cuentas").insert({ proyecto_id: proyectoId, nombre: "Todo", por_defecto: true, metodos: [] }),
    cats.count ? null : db().from("categorias_finanzas").insert(CATEGORIAS.map((x) => ({ ...x, proyecto_id: proyectoId }))),
  ]);
  const e = [c?.error, k?.error].find((x) => x && x.code !== "23505"); // 23505: otra página las creó a la vez
  if (e) throw new Error(`No se pudieron crear la cuenta y las categorías: ${e.message}`);
}

export async function cargarFinanzas(proyectoId: string) {
  await asegurarPlazosMensuales(proyectoId); // bloque A: membresías
  await asegurarFinanzas(proyectoId);
  const [ventasT, pagosT, movimientos, categorias, cuentas, vencimientosT, productos, prueba] = await Promise.all([
    todas<VentaF & { tipo_pago: string; num_cuotas: number | null }>((a, b) => db().from("ventas").select("id, lead_id, producto_id, vendedor_id, facturacion, cash_collected, fecha, metodo, tipo_pago, num_cuotas, devuelto, devuelto_en").eq("proyecto_id", proyectoId).order("id").range(a, b)),
    todas<PagoF>((a, b) => db().from("pagos").select("id, venta_id, importe, fecha, metodo, ventas!inner(proyecto_id)").eq("ventas.proyecto_id", proyectoId).order("id").range(a, b)),
    todas<MovF & { descripcion: string | null; origen: string }>((a, b) => db().from("movimientos").select("*").eq("proyecto_id", proyectoId).order("fecha", { ascending: false }).order("id").range(a, b)),
    db().from("categorias_finanzas").select("id, tipo, nombre, en_profit").eq("proyecto_id", proyectoId).order("nombre"),
    db().from("cuentas").select("id, nombre, metodos, por_defecto").eq("proyecto_id", proyectoId).order("creado_en"),
    todas<VencF & { lead_id: string | null; nombre: string | null; numero: number; pagado_en: string | null }>((a, b) => db().from("vencimientos").select("*").eq("proyecto_id", proyectoId).order("vence_el").order("id").range(a, b)),
    db().from("productos").select("id, nombre, backend_offer, comisiones, cuenta_comision").eq("proyecto_id", proyectoId),
    idsDePrueba(),
  ]);
  // 1.0: las ventas de los perfiles de prueba (y sus cobros y plazos) no cuentan en Finanzas
  const ok = deVerdad(prueba);
  const ventas = ventasT.filter((v) => ok(v.vendedor_id));
  const quedan = new Set(ventas.map((v) => v.id));
  const pagos = pagosT.filter((p) => quedan.has(p.venta_id));
  const vencimientos = vencimientosT.filter((v) => !v.venta_id || quedan.has(v.venta_id));
  const num = <T extends { importe?: number }>(x: T) => ({ ...x, importe: Number(x.importe) });
  return {
    ventas: ventas.map((v) => ({ ...v, facturacion: Number(v.facturacion), cash_collected: Number(v.cash_collected), devuelto: v.devuelto === null ? null : Number(v.devuelto) })),
    pagos: pagos.map(num),
    movimientos: movimientos.map(num),
    categorias: (categorias.data ?? []) as CatF[],
    cuentas: (cuentas.data ?? []) as CuentaF[],
    vencimientos: vencimientos.map(num),
    productos: productos.data ?? [],
    backend: new Set((productos.data ?? []).filter((p) => p.backend_offer).map((p) => p.id)),
  };
}

// Membresía mensual sin fin (bloque A): mientras no se dé de baja, siempre queda el cobro del mes siguiente
export async function asegurarPlazosMensuales(proyectoId: string, hoy?: string) {
  const ventas = await todas<{ id: string; lead_id: string; facturacion: number; fecha: string; tipo_pago: string; baja_en: string | null }>((a, b) => db().from("ventas").select("id, lead_id, facturacion, fecha, tipo_pago, baja_en").eq("proyecto_id", proyectoId).eq("tipo_pago", "mensual").is("baja_en", null).order("id").range(a, b));
  if (!ventas.length) return 0;
  // Ola 6 (C3): «hoy» en la zona del proyecto, no en UTC (de noche en América el UTC ya es mañana)
  if (!hoy) {
    const { data: p, error } = await db().from("proyectos").select("zona_horaria").eq("id", proyectoId).single();
    if (error) throw new Error(error.message);
    hoy = hoyEnZona(p.zona_horaria);
  }
  // Ola 6 (C3): si la lectura falla, se corta (antes creía que no había plazos y los creaba todos otra vez)
  const plazos = await porTrozos<{ venta_id: string | null; numero: number; vence_el: string }>(ventas.map((v) => v.id), (t, a, b) => db().from("vencimientos").select("venta_id, numero, vence_el").in("venta_id", t).order("id").range(a, b));
  const nuevos = plazosMensualesQueFaltan(ventas.map((v) => ({ ...v, facturacion: Number(v.facturacion) })), plazos, hoy);
  if (nuevos.length) {
    // Dos cargas a la vez calculan el mismo plazo: el índice único (venta_id, numero) deja solo uno
    const { error: e2 } = await db().from("vencimientos").upsert(nuevos.map((n) => ({ ...n, proyecto_id: proyectoId })), { onConflict: "venta_id,numero", ignoreDuplicates: true });
    if (e2) throw new Error(`No se pudieron crear los cobros de la membresía: ${e2.message}`);
  }
  return nuevos.length;
}
