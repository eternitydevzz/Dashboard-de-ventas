import "server-only";
import { esJefe, getSesion } from "@/lib/auth";
import { exigirSeccion } from "@/lib/permisos";
import { db, escribir } from "@/lib/datos";
import { ErrorUsuario } from "@/lib/resultado";
import { limpiarFicha, mismaFicha, type Ficha } from "@/lib/ficha-cualificacion";

// C6: la ficha de un lead, solo para quien puede tocarlo (jefes, o su caller o closer)
async function leadDeLaFicha(leadId: string) {
  await exigirSeccion("cola", "crm", "agendas", "clientes");
  const { perfil, proyecto } = await getSesion();
  const { data: lead } = await db().from("leads").select("id, caller_id, closer_id").eq("id", leadId).eq("proyecto_id", proyecto.id).maybeSingle();
  if (!lead) throw new ErrorUsuario("Lead no encontrado.");
  if (!esJefe(perfil) && lead.caller_id !== perfil.id && lead.closer_id !== perfil.id) throw new ErrorUsuario("Este lead no está asignado a ti.");
  return { perfil, proyecto };
}

export async function leerFichaDe(leadId: string): Promise<Ficha> {
  await leadDeLaFicha(leadId);
  const { data } = await db().from("cualificaciones").select("campos").eq("lead_id", leadId).maybeSingle();
  return limpiarFicha(data?.campos);
}

// Idempotente (7c.2): se llama muchas veces (al escribir, al pulsar botones, al cerrar, al salir de la página),
// pero solo escribe si algo cambió. Una fila por lead.
export async function guardarFichaDe(leadId: string, entrada: unknown): Promise<{ cambiado: boolean }> {
  const { perfil, proyecto } = await leadDeLaFicha(leadId);
  const campos = limpiarFicha(entrada);
  const { data: actual } = await db().from("cualificaciones").select("campos").eq("lead_id", leadId).maybeSingle();
  if (mismaFicha(actual?.campos ?? {}, campos)) return { cambiado: false };
  await escribir(
    db().from("cualificaciones").upsert({ lead_id: leadId, proyecto_id: proyecto.id, campos, actualizado_por: perfil.id, actualizado_en: new Date().toISOString() }),
    "cualificaciones"
  );
  return { cambiado: true };
}

// Para «Exportar» del CRM (solo jefes): las fichas de los leads marcados, en trozos (la base corta las listas largas)
export async function fichasDeLeads(ids: string[]): Promise<Record<string, Ficha>> {
  await exigirSeccion("crm");
  const { perfil, proyecto } = await getSesion();
  if (!esJefe(perfil)) throw new ErrorUsuario("Solo el CEO y los directores exportan.");
  const fichas: Record<string, Ficha> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db().from("cualificaciones").select("lead_id, campos").eq("proyecto_id", proyecto.id).in("lead_id", ids.slice(i, i + 200));
    for (const f of data ?? []) fichas[f.lead_id] = limpiarFicha(f.campos);
  }
  return fichas;
}
