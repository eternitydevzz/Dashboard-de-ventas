import "server-only";
import { db, todas } from "@/lib/datos";

// KPIs de hoy de la cola («Mis leads» / «Callers»). F4 (plan Callers, 7 nov): todo filtra por proyecto.
// C11 (7c.1): ya no se cuentan las ventas (F6: el caller no vende); las actividades llevan el lead para contar
// contactos como personas distintas.
export async function kpisHoyCola(proyectoId: string, personaId: string, desdeIso: string) {
  // D43: las actividades de hoy pueden pasar de 1.000 filas: todas() pagina (con orden fijo para no saltar filas)
  const [acts, citas] = await Promise.all([
    todas<{ tipo: string; resultado: string | null; lead_id: string }>((d, h) =>
      db().from("actividades").select("tipo, resultado, lead_id").eq("proyecto_id", proyectoId).eq("perfil_id", personaId).gte("creado_en", desdeIso).order("id").range(d, h)
    ),
    db().from("citas").select("id", { count: "exact", head: true }).eq("proyecto_id", proyectoId).eq("agendada_por", personaId).gte("creado_en", desdeIso),
  ]);
  // 13 nov: si falla, error (pantalla «Esta sección no ha cargado», como los leads) en vez de enseñar 0 sin avisar; la lectura paginada ya lanza si fallan las actividades
  if (citas.error) throw new Error(`KPIs de hoy: ${citas.error.message}`);
  return { acts, citas: citas.count ?? 0 };
}
