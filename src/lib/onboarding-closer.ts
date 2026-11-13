import "server-only";
import { db, todas } from "@/lib/datos";
import { esJefe } from "@/lib/auth";
import type { Perfil } from "@/lib/tipos";

// Onboarding de los closers (bloque 7 de 1.0, Cristian 10 y 11 oct 2026): sus clientes cerrados (a quienes ese closer
// les registró una venta, también la Membresía) con una checklist que marca él. El CEO y los directores ven los de todos.
export const PASOS_DEFECTO = ["Onboarding enviado", "Acceso dado", "Seguimiento hecho", "Llamada de bienvenida"];

export async function pasosCloser(proyectoId: string) {
  const { data } = await db().from("pasos_onboarding_closer").select("id, nombre, orden").eq("proyecto_id", proyectoId).order("orden").order("nombre");
  if (data?.length) return data as { id: string; nombre: string; orden: number }[];
  // La primera vez, los 4 del plan. Se vuelven a leer con una consulta distinta (con límite): la misma consulta
  // devolvería la lista vacía de antes, porque Next reutiliza en la misma carga las consultas idénticas.
  await db().from("pasos_onboarding_closer").upsert(PASOS_DEFECTO.map((nombre, orden) => ({ proyecto_id: proyectoId, nombre, orden })), { onConflict: "proyecto_id,nombre", ignoreDuplicates: true });
  const { data: creados } = await db().from("pasos_onboarding_closer").select("id, nombre, orden").eq("proyecto_id", proyectoId).order("orden").order("nombre").limit(100);
  return (creados ?? []) as { id: string; nombre: string; orden: number }[];
}

type ClienteCloser = { lead_id: string; nombre: string; email: string | null; closer_id: string; productos: string[]; desde: string; hechos: Record<string, string> };

export async function clientesDeCloser(proyectoId: string, perfil: Perfil, closerFiltro?: string) {
  const ver = esJefe(perfil) ? closerFiltro || null : perfil.id;
  type V = { lead_id: string; vendedor_id: string; fecha: string; productos: { nombre: string } | null };
  const ventas = await todas<V>((a, b) => {
    let q = db().from("ventas").select("lead_id, vendedor_id, fecha, productos(nombre), perfiles!ventas_vendedor_id_fkey!inner(rol, tambien_closer)").eq("proyecto_id", proyectoId).or("rol.eq.closer,tambien_closer.eq.true", { referencedTable: "perfiles" }); // E2: también closer
    if (ver) q = q.eq("vendedor_id", ver);
    return q.order("fecha").order("id").range(a, b) as unknown as PromiseLike<{ data: V[] | null; error: { message: string } | null }>;
  });
  // Un cliente por lead y closer: sus productos y su primera compra con él
  const mapa = new Map<string, Omit<ClienteCloser, "nombre" | "email" | "hechos">>();
  for (const v of ventas) {
    const k = `${v.lead_id}|${v.vendedor_id}`;
    const ya = mapa.get(k);
    const prod = v.productos?.nombre ?? "—";
    if (ya) {
      if (!ya.productos.includes(prod)) ya.productos.push(prod);
    } else mapa.set(k, { lead_id: v.lead_id, closer_id: v.vendedor_id, productos: [prod], desde: v.fecha });
  }
  const ids = [...new Set([...mapa.values()].map((c) => c.lead_id))];
  const [leads, fichas] = await Promise.all([
    ids.length ? todas<{ id: string; nombre: string; apellido: string; email: string | null }>((a, b) => db().from("leads").select("id, nombre, apellido, email").in("id", ids).order("id").range(a, b)) : [],
    ids.length ? todas<{ lead_id: string; onboarding_closer: Record<string, string> }>((a, b) => db().from("clientes").select("lead_id, onboarding_closer").eq("proyecto_id", proyectoId).in("lead_id", ids).order("lead_id").range(a, b)) : [],
  ]);
  return [...mapa.values()]
    .map((c) => {
      const l = leads.find((x) => x.id === c.lead_id);
      return { ...c, nombre: `${l?.nombre ?? ""} ${l?.apellido ?? ""}`.trim() || "Sin nombre", email: l?.email ?? null, hechos: fichas.find((f) => f.lead_id === c.lead_id)?.onboarding_closer ?? {} };
    })
    .sort((a, b) => b.desde.localeCompare(a.desde)) as ClienteCloser[];
}
