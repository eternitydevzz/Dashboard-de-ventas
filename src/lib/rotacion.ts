import "server-only";
import { db } from "@/lib/datos";
import { ErrorUsuario } from "@/lib/resultado";
import type { Mercado } from "@/lib/mercado";

// C11 (plan Callers, 7 nov, punto 13): cuando el caller marca «Agendado», el closer lo pone la rotación (modo «decide»).
// La rotación se quitó del código el 11 oct; quedan en la base `rotacion_pct` y `rotacion_cuenta` de cada closer
// (migración 20261014110000). Toca el closer con menos citas para su %: cuenta / %. Empate: el de más %.
// Cristian (7 nov): por ahora, todas las citas a él (su % al 100, el resto al 0).
export function elegirCloser(closers: { perfil_id: string; rotacion_pct: number; rotacion_cuenta: number }[]) {
  const activos = closers.filter((c) => Number(c.rotacion_pct) > 0);
  if (!activos.length) return null;
  return [...activos].sort((a, b) => a.rotacion_cuenta / a.rotacion_pct - b.rotacion_cuenta / b.rotacion_pct || b.rotacion_pct - a.rotacion_pct)[0].perfil_id;
}

// Los % que se guardan en Administración: cada uno de 0 a 100 y entre todos 100 (o todos a 0 = sin rotación)
export function validarRotacion(pcts: Record<string, number>) {
  const limpio: Record<string, number> = {};
  for (const [id, v] of Object.entries(pcts)) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new ErrorUsuario("Cada % tiene que ir de 0 a 100.");
    limpio[id] = Math.round(n * 100) / 100;
  }
  const suma = Math.round(Object.values(limpio).reduce((a, b) => a + b, 0) * 100) / 100;
  if (suma !== 0 && suma !== 100) throw new ErrorUsuario(`Los % suman ${suma}; tienen que sumar 100 (o estar todos a 0).`);
  return limpio;
}

type MiembroRotacion = { perfil_id: string; rotacion_pct: number; rotacion_cuenta: number; paises_closer: string[] };

// Cristian (11 nov 2026): si el país del lead es de un closer (paises_closer), va a ese; si no, la rotación por %
export function elegirCloserPorPais(closers: MiembroRotacion[], pais: string | null | undefined) {
  const p = (pais ?? "").trim().toUpperCase();
  const delPais = p ? closers.find((c) => (c.paises_closer ?? []).some((x) => x.toUpperCase() === p)) : undefined;
  return delPais?.perfil_id ?? elegirCloser(closers);
}

// Cristian (13 nov 2026): lo que agenda un caller de España va solo a closers de España (dentro de ellos, la regla de
// siempre). Callers de Latam y citas sin caller (GHL), como hasta ahora.
export function elegirCloserParaCaller(closers: (MiembroRotacion & { mercado?: string | null })[], pais: string | null | undefined, mercadoCaller: Mercado | null) {
  if (mercadoCaller !== "es") return elegirCloserPorPais(closers, pais);
  const elegido = elegirCloserPorPais(closers.filter((c) => c.mercado === "es"), pais);
  if (!elegido) throw new ErrorUsuario("No hay closers de España en la rotación: avisa a tu director.");
  return elegido;
}

export async function closerDeLaRotacion(proyectoId: string, pais?: string | null, mercadoCaller: Mercado | null = null) {
  const es = mercadoCaller === "es";
  const { data } = await db()
    .from("miembros_proyecto")
    // `mercado` solo si hace falta: con «es» la columna ya existe (si no, nadie podría tener «es»)
    .select(`perfil_id, rotacion_pct, rotacion_cuenta, paises_closer, ${es ? "mercado, " : ""}perfiles!inner(rol, activo)`)
    .eq("proyecto_id", proyectoId)
    .or("rol.eq.closer,tambien_closer.eq.true", { referencedTable: "perfiles" }) // Plan GHL E1: también closer
    .eq("perfiles.activo", true);
  const filas = (data ?? []) as unknown as { perfil_id: string; rotacion_pct: number; rotacion_cuenta: number; paises_closer: string[] | null; mercado?: string | null }[];
  const elegido = elegirCloserParaCaller(
    filas.map((c) => ({ perfil_id: c.perfil_id, rotacion_pct: Number(c.rotacion_pct), rotacion_cuenta: c.rotacion_cuenta, paises_closer: c.paises_closer ?? [], mercado: c.mercado })),
    pais,
    mercadoCaller
  );
  if (!elegido) throw new ErrorUsuario("No hay ningún closer en la rotación: pide al director que ponga el % de cada closer.");
  return elegido;
}

export async function sumarRotacion(proyectoId: string, closerId: string) {
  const { error } = await db().rpc("sumar_rotacion", { p_proyecto: proyectoId, p_closer: closerId });
  if (error) console.error("[rotación] no se pudo sumar:", error.message); // secundario: la cita ya está creada
}
