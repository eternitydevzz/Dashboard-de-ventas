import "server-only";
import { db } from "@/lib/datos";

// KPIs de hoy de la cola («Mis leads» / «Callers»). F4 (plan Callers, 7 nov): las citas y las ventas también
// filtran por proyecto (antes solo por persona y fecha: alguien en dos proyectos veía las de los dos).
export async function kpisHoyCola(proyectoId: string, personaId: string, desdeIso: string) {
  const [acts, citas, ventas] = await Promise.all([
    db().from("actividades").select("tipo, resultado").eq("proyecto_id", proyectoId).eq("perfil_id", personaId).gte("creado_en", desdeIso),
    db().from("citas").select("id", { count: "exact", head: true }).eq("proyecto_id", proyectoId).eq("agendada_por", personaId).gte("creado_en", desdeIso),
    db().from("ventas").select("id", { count: "exact", head: true }).eq("proyecto_id", proyectoId).eq("vendedor_id", personaId).gte("fecha", desdeIso),
  ]);
  return { acts: (acts.data ?? []) as { tipo: string; resultado: string | null }[], citas: citas.count ?? 0, ventas: ventas.count ?? 0 };
}
