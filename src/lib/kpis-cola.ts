import "server-only";
import { db } from "@/lib/datos";

// KPIs de hoy de la cola («Mis leads» / «Callers»). F4 (plan Callers, 7 nov): todo filtra por proyecto.
// C11 (7c.1): ya no se cuentan las ventas (F6: el caller no vende); las actividades llevan el lead para contar
// contactos como personas distintas.
export async function kpisHoyCola(proyectoId: string, personaId: string, desdeIso: string) {
  const [acts, citas] = await Promise.all([
    db().from("actividades").select("tipo, resultado, lead_id").eq("proyecto_id", proyectoId).eq("perfil_id", personaId).gte("creado_en", desdeIso),
    db().from("citas").select("id", { count: "exact", head: true }).eq("proyecto_id", proyectoId).eq("agendada_por", personaId).gte("creado_en", desdeIso),
  ]);
  // 13 nov: si falla, error (pantalla «Esta sección no ha cargado», como los leads) en vez de enseñar 0 sin avisar
  const error = acts.error ?? citas.error;
  if (error) throw new Error(`KPIs de hoy: ${error.message}`);
  return { acts: (acts.data ?? []) as { tipo: string; resultado: string | null; lead_id: string }[], citas: citas.count ?? 0 };
}
