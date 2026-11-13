import "server-only";
import { db, todas } from "@/lib/datos";
import { resumenClientes, type FichaCliente } from "@/lib/clientes";
import { hoyEnZona } from "@/lib/formato";
import type { PagoF, VencF, VentaF } from "@/lib/finanzas";
import type { Proyecto } from "@/lib/tipos";

const PASOS = ["Bienvenida enviada", "Acceso dado", "Llamada de inicio hecha"];

// La primera vez, unos pasos de onboarding de ejemplo (se pueden cambiar). Si dos páginas
// lo hacen a la vez, el nombre único hace que el segundo intento falle sin repetir nada.
async function asegurarPasos(proyectoId: string) {
  const { count } = await db().from("pasos_onboarding").select("id", { count: "exact", head: true }).eq("proyecto_id", proyectoId);
  if (!count) await db().from("pasos_onboarding").insert(PASOS.map((nombre, orden) => ({ proyecto_id: proyectoId, nombre, orden })));
}

export async function cargarClientes(proyecto: Proyecto) {
  await asegurarPasos(proyecto.id);
  const [ventas, pagos, vencimientos, fichas, pasos, productos] = await Promise.all([
    todas<VentaF>((a, b) => db().from("ventas").select("id, lead_id, producto_id, vendedor_id, facturacion, cash_collected, fecha, metodo, tipo_pago, devuelto, devuelto_en").eq("proyecto_id", proyecto.id).order("id").range(a, b)),
    todas<PagoF>((a, b) => db().from("pagos").select("id, venta_id, importe, fecha, metodo, ventas!inner(proyecto_id)").eq("ventas.proyecto_id", proyecto.id).order("id").range(a, b)),
    todas<VencF>((a, b) => db().from("vencimientos").select("id, venta_id, importe, vence_el, estado").eq("proyecto_id", proyecto.id).order("id").range(a, b)),
    todas<FichaCliente>((a, b) => db().from("clientes").select("*").eq("proyecto_id", proyecto.id).order("lead_id").range(a, b)),
    db().from("pasos_onboarding").select("id, nombre, orden").eq("proyecto_id", proyecto.id).order("orden"),
    db().from("productos").select("id, nombre, color").eq("proyecto_id", proyecto.id),
  ]);
  // si la base falla, error.tsx en vez de una pantalla vacía como si no hubiera nada
  for (const [r, que] of [[pasos, "los pasos de onboarding"], [productos, "los productos"]] as const)
    if (r.error) throw new Error(`No se pudieron leer ${que}: ${r.error.message}`);
  const n = <T extends object>(x: T, ks: (keyof T)[]) => ({ ...x, ...Object.fromEntries(ks.map((k) => [k, x[k] === null ? null : Number(x[k])])) }) as T;
  const filas = resumenClientes(
    {
      ventas: ventas.map((v) => n(v, ["facturacion", "cash_collected", "devuelto"])),
      pagos: pagos.map((p) => n(p, ["importe"])),
      vencimientos: vencimientos.map((v) => n(v, ["importe"])),
      fichas,
    },
    hoyEnZona(proyecto.zona_horaria)
  );
  const ids = filas.map((f) => f.lead_id);
  const leads = new Map<string, { nombre: string; email: string | null; telefono: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db().from("leads").select("id, nombre, apellido, email, telefono").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`No se pudieron leer los leads: ${error.message}`);
    for (const l of data ?? []) leads.set(l.id, { nombre: `${l.nombre} ${l.apellido ?? ""}`.trim() || "Sin nombre", email: l.email, telefono: l.telefono });
  }
  const notas = new Map<string, { nota: string; creado_en: string }[]>();
  if (ids.length) {
    const ultimas = await todas<{ lead_id: string; nota: string; creado_en: string }>((a, b) => db().from("seguimientos_cliente").select("lead_id, nota, creado_en").eq("proyecto_id", proyecto.id).order("creado_en", { ascending: false }).order("id").range(a, b));
    for (const x of ultimas) notas.set(x.lead_id, [...(notas.get(x.lead_id) ?? []), x]);
  }
  return {
    filas: filas.map((f) => ({ ...f, lead: leads.get(f.lead_id) ?? { nombre: "—", email: null, telefono: null }, notas: notas.get(f.lead_id) ?? [] })),
    pasos: (pasos.data ?? []) as { id: string; nombre: string; orden: number }[],
    productos: new Map((productos.data ?? []).map((p) => [p.id, p as { id: string; nombre: string; color: string }])),
    productosLista: (productos.data ?? []) as { id: string; nombre: string; color: string }[],
  };
}
export type DatosClientes = Awaited<ReturnType<typeof cargarClientes>>;
export type ClienteVista = DatosClientes["filas"][number];

// H5 (caso 5 confirmado por Cristian): a un caller o closer con «Clientes», solo los que vendió o agendó él
export async function clientesSuyos(proyectoId: string, perfilId: string) {
  const [vendidos, agendados] = await Promise.all([
    todas<{ lead_id: string }>((a, b) => db().from("ventas").select("lead_id").eq("proyecto_id", proyectoId).eq("vendedor_id", perfilId).order("id").range(a, b)),
    todas<{ lead_id: string }>((a, b) => db().from("citas").select("lead_id").eq("proyecto_id", proyectoId).eq("agendada_por", perfilId).order("id").range(a, b)),
  ]);
  return new Set([...vendidos, ...agendados].map((x) => x.lead_id));
}
