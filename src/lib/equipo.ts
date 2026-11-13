import "server-only";
import { db } from "@/lib/datos";
import type { ComisionPersona, ComisionRol } from "@/lib/comisiones";
import type { Rol } from "@/lib/tipos";

export type Area = { id: string; nombre: string; color: string; orden: number };
export type Puesto = { id: string; area_id: string | null; nombre: string; rol_base: Rol | "otro" };
type MiembroEquipo = {
  id: string;
  perfil_id: string | null;
  nombre: string;
  email: string | null;
  area_id: string | null;
  puesto_id: string | null;
  lider: boolean;
  activo: boolean;
  comision: ComisionPersona;
  comision_modo?: "tramos" | "propio" | null; // 1.0 bloque 4: null = lo de su rol
  rol: Rol | null; // el de su cuenta, si tiene acceso
  tambien_closer?: boolean; // «También closer» (p. ej. Facu): sale también entre los closers del organigrama
  foto?: string | null; // N3: la de su cuenta (null = sin foto o sin cuenta)
};

const AREAS_INICIALES = [
  { nombre: "Dirección", color: "#b45309", orden: 0 },
  { nombre: "Ventas", color: "#15803d", orden: 1 },
  { nombre: "Operaciones", color: "#1d4ed8", orden: 2 },
  { nombre: "Producto", color: "#7c3aed", orden: 3 },
];

// La primera vez (o en un proyecto nuevo): áreas iniciales, comisiones por rol y la gente del proyecto en el equipo.
async function asegurarEquipo(proyectoId: string) {
  const [{ count: nAreas }, { data: roles }, { data: miembros }, { data: enEquipo }] = await Promise.all([
    db().from("areas").select("id", { count: "exact", head: true }).eq("proyecto_id", proyectoId),
    db().from("comisiones_rol").select("rol").eq("proyecto_id", proyectoId),
    db().from("miembros_proyecto").select("perfil_id, perfiles(nombre, email, rol, activo, es_prueba)").eq("proyecto_id", proyectoId),
    db().from("miembros_equipo").select("perfil_id").eq("proyecto_id", proyectoId),
  ]);
  if (!nAreas) await db().from("areas").insert(AREAS_INICIALES.map((a) => ({ ...a, proyecto_id: proyectoId })));
  const faltan = (["ceo", "director", "closer", "caller"] as const).filter((r) => !(roles ?? []).some((x) => x.rol === r));
  if (faltan.length) await db().from("comisiones_rol").insert(faltan.map((rol) => ({ proyecto_id: proyectoId, rol, pct_venta: 0, pct_agenda: rol === "caller" ? 3 : 0 })));
  const ya = new Set((enEquipo ?? []).map((m) => m.perfil_id));
  // 1.0: los perfiles de prueba no entran en el organigrama (ni, por tanto, en las liquidaciones)
  const nuevos = ((miembros ?? []) as unknown as { perfil_id: string; perfiles: { nombre: string; email: string; rol: Rol; activo: boolean; es_prueba: boolean } }[]).filter((m) => !ya.has(m.perfil_id) && !m.perfiles.es_prueba);
  if (nuevos.length) {
    const { data: areas } = await db().from("areas").select("id, nombre").eq("proyecto_id", proyectoId);
    const area = (n: string) => areas?.find((a) => a.nombre === n)?.id ?? areas?.[0]?.id ?? null;
    await db().from("miembros_equipo").insert(
      nuevos.map((m) => ({ proyecto_id: proyectoId, perfil_id: m.perfil_id, nombre: m.perfiles.nombre, email: m.perfiles.email, activo: m.perfiles.activo, area_id: area(m.perfiles.rol === "ceo" || m.perfiles.rol === "director" ? "Dirección" : "Ventas") }))
    );
  }
}

export async function cargarEquipo(proyectoId: string) {
  await asegurarEquipo(proyectoId);
  const [{ data: areas }, { data: puestos }, { data: miembros }, { data: roles }] = await Promise.all([
    db().from("areas").select("id, nombre, color, orden").eq("proyecto_id", proyectoId).order("orden"),
    db().from("puestos").select("id, area_id, nombre, rol_base").eq("proyecto_id", proyectoId).order("nombre"),
    db().from("miembros_equipo").select("*, perfiles(rol, es_prueba, tambien_closer, foto)").eq("proyecto_id", proyectoId).order("nombre"),
    db().from("comisiones_rol").select("rol, pct_venta, pct_agenda").eq("proyecto_id", proyectoId),
  ]);
  const comisionesRol = Object.fromEntries((roles ?? []).map((r) => [r.rol, { pct_venta: Number(r.pct_venta), pct_agenda: Number(r.pct_agenda) }])) as Record<Rol, ComisionRol>;
  return {
    areas: (areas ?? []) as Area[],
    puestos: (puestos ?? []) as Puesto[],
    miembros: ((miembros ?? []) as (MiembroEquipo & { perfiles: { rol: Rol; es_prueba: boolean; tambien_closer: boolean | null; foto?: string | null } | null })[]).filter((m) => !m.perfiles?.es_prueba).map(({ perfiles, ...m }) => ({ ...m, rol: perfiles?.rol ?? null, tambien_closer: !!perfiles?.tambien_closer, foto: perfiles?.foto ?? null })) as MiembroEquipo[],
    comisionesRol,
  };
}
