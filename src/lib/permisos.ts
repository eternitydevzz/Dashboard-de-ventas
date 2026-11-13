import "server-only";
import { enMemoria, UN_MINUTO } from "@/lib/memoria";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/datos";
import { ErrorUsuario } from "@/lib/resultado";
import { getSesion } from "@/lib/sesion";
import { SECCIONES_TODAS, SECCIONES, DEFECTO, NUNCA, ROLES_PERMISO, type Seccion } from "@/lib/permisos-constantes";
import type { Perfil } from "@/lib/tipos";

// Permisos de todas las secciones (Paso H5, decisiones de Cristian del 10 oct 2026):
// - cada rol trae sus secciones de siempre (DEFECTO); el CEO lo tiene todo siempre
// - en Administración → Permisos se abren o cierran por rol, y en la ficha de cada persona, solo para ella
// - manda la persona; sin fila de la persona, vale la del rol; sin fila del rol, lo de siempre
// - Equipo y Finanzas nunca a callers ni closers (Administración va aparte: CEO y director con Administración)
export { SECCIONES_TODAS, SECCIONES, DEFECTO, NUNCA, ROLES_PERMISO, type Seccion };

type Fila = { seccion: string; permitido: boolean };

export function calcularPermisos(rol: Perfil["rol"], deRol: Fila[], dePersona: Fila[], tambienCloser = false): Set<Seccion> {
  if (rol === "ceo") return new Set(SECCIONES_TODAS.map((s) => s.v));
  const r = new Map(deRol.map((f) => [f.seccion, f.permitido]));
  const p = new Map(dePersona.map((f) => [f.seccion, f.permitido]));
  // «También closer» gana al permiso del rol en lo de un closer (Cristian, 9 nov); la ficha de la persona sigue mandando
  const deCloser = (s: Seccion) => tambienCloser && rol === "caller" && DEFECTO.closer.has(s);
  return new Set(SECCIONES_TODAS.map((s) => s.v).filter((s) => !NUNCA[rol].has(s) && (p.get(s) ?? (deCloser(s) || (r.get(s) ?? DEFECTO[rol].has(s))))));
}

// Una vez por petición (el menú y la página la piden a la vez)
export const seccionesPermitidas = cache(async (perfil: Perfil, proyectoId: string): Promise<Set<Seccion>> => {
  if (perfil.rol === "ceo") return calcularPermisos("ceo", [], []);
  // 25 oct 2026: las filas de permisos se guardan 1 minuto en memoria (lib/memoria.ts); se borra al guardar permisos.
  // Si la lectura falla, se lanza (enMemoria no guarda el fallo): antes guardaba null 1 minuto e ignoraba los permisos
  const leer = async (r: PromiseLike<{ data: Fila[] | null; error: { message: string } | null }>) => {
    const { data, error } = await r;
    if (error) throw new Error(`No se pudieron leer los permisos: ${error.message}`);
    return data;
  };
  const [deRol, dePersona] = await Promise.all([
    enMemoria(`permisos-rol:${proyectoId}:${perfil.rol}`, UN_MINUTO, () => leer(db().from("permisos_seccion").select("seccion, permitido").eq("proyecto_id", proyectoId).eq("rol", perfil.rol))),
    enMemoria(`permisos-persona:${proyectoId}:${perfil.id}`, UN_MINUTO, () => leer(db().from("permisos_persona").select("seccion, permitido").eq("proyecto_id", proyectoId).eq("perfil_id", perfil.id))),
  ]);
  return calcularPermisos(perfil.rol, deRol ?? [], dePersona ?? [], !!perfil.tambien_closer); // E2: el caller que también es closer suma lo de un closer
});

export async function puedeSeccion(perfil: Perfil, proyectoId: string, seccion: Seccion) {
  return (await seccionesPermitidas(perfil, proyectoId)).has(seccion);
}

// Para acciones y páginas: corta si no tiene la sección (o ninguna de las que se pasan)
export async function exigirSeccion(...secciones: Seccion[]) {
  const sesion = await getSesion();
  const tiene = await seccionesPermitidas(sesion.perfil, sesion.proyecto.id);
  if (!secciones.some((s) => tiene.has(s))) throw new ErrorUsuario("No tienes acceso a esta sección.");
  return sesion;
}

// «Lo suyo» (caso confirmado por Cristian): una sección que no es de su rol se le enseña solo con sus datos
export function soloLoSuyo(perfil: Perfil, seccion: Seccion) {
  return (perfil.rol === "caller" || perfil.rol === "closer") && !DEFECTO[perfil.rol].has(seccion);
}

// Página de inicio: la de su rol si la tiene; si no, la primera sección que tenga permitida
const RUTA: Record<Seccion, string> = {
  funnel: "/kpis?vista=funnel", mi_funnel: "/mi-funnel", kpis: "/kpis", crm: "/crm", cola: "/caller", agendas: "/closer", grabadas: "/caller/grabadas",
  ventas: "/ventas", ranking: "/ranking", recursos: "/recursos", reportes: "/reportes", manuales: "/manuales", grabaciones: "/grabaciones", equipo: "/equipo", programas: "/programas", finanzas: "/finanzas", clientes: "/clientes",
};
// 26 oct 2026 (Cristian): el CEO y los directores entran en KPIs → Leads (antes, en el Funnel)
const INICIO: Record<Perfil["rol"], Seccion> = { ceo: "kpis", director: "kpis", closer: "agendas", caller: "cola" };
export async function rutaInicio(perfil: Perfil, proyectoId: string) {
  const tiene = await seccionesPermitidas(perfil, proyectoId);
  if (tiene.has(INICIO[perfil.rol])) return RUTA[INICIO[perfil.rol]];
  const primera = SECCIONES_TODAS.find((s) => tiene.has(s.v));
  return primera ? RUTA[primera.v] : "/sin-acceso";
}

// Para páginas: sin ninguna de esas secciones, a su inicio (que nunca es una página sin permiso)
export async function exigirPagina(...secciones: Seccion[]) {
  const sesion = await getSesion();
  const tiene = await seccionesPermitidas(sesion.perfil, sesion.proyecto.id);
  if (!secciones.some((s) => tiene.has(s))) redirect("/");
  return { ...sesion, tiene };
}
