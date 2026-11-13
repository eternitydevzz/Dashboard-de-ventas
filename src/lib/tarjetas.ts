import "server-only";
import { db, escribir } from "@/lib/datos";

// Fase 4: tarjetas de un lead en pipelines que no son el suyo principal (tabla `tarjetas_extra`).
// Si la base todavía no tiene la tabla (migración sin aplicar), todo esto no hace nada y la app sigue como antes.
type TarjetaExtra = { lead_id: string; pipeline_id: string; etapa_id: string | null };

const sinTabla = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /tarjetas_extra/.test(e.message ?? ""));

export async function tarjetaDe(leadId: string, pipelineId: string): Promise<TarjetaExtra | null> {
  const { data, error } = await db().from("tarjetas_extra").select("lead_id, pipeline_id, etapa_id").eq("lead_id", leadId).eq("pipeline_id", pipelineId).maybeSingle();
  if (error) return null;
  return data;
}

// Crea las tarjetas que falten (una por lead y pipeline; si ya existe, no la toca)
export async function anadirTarjetas(proyectoId: string, filas: { lead_id: string; pipeline_id: string; etapa_id: string | null }[]) {
  if (!filas.length) return 0;
  let creadas = 0;
  for (let i = 0; i < filas.length; i += 500) {
    const { data, error } = await db()
      .from("tarjetas_extra")
      .upsert(filas.slice(i, i + 500).map((f) => ({ ...f, proyecto_id: proyectoId })), { onConflict: "lead_id,pipeline_id", ignoreDuplicates: true })
      .select("id");
    if (error) {
      if (sinTabla(error)) return 0;
      throw new Error(`Error creando tarjetas: ${error.message}`);
    }
    creadas += data?.length ?? 0;
  }
  return creadas;
}

export async function moverTarjeta(leadId: string, pipelineId: string, etapaId: string) {
  await escribir(db().from("tarjetas_extra").update({ etapa_id: etapaId }).eq("lead_id", leadId).eq("pipeline_id", pipelineId), "tarjetas_extra");
}
