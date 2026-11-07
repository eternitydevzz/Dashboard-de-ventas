import "server-only";
import { db } from "@/lib/datos";

// Landing software-demo (Cristian, 7 nov 2026): una landing manda cada paso del formulario a su Entrada con el mismo
// `event_id` (JSON v1). Los primeros pasos pueden traer solo el teléfono y el email llegar después. El dashboard
// reconoce a la persona por el email y, solo si el envío no trae email, por el teléfono (src/lib/leads.ts): sin esto,
// el envío con email creaba un segundo lead. Aquí, antes de guardar, si el email todavía no es de ningún lead, se le
// pone al lead que creó ese mismo `event_id` en esa misma Entrada (si aún no tenía email). Así guardarLeads lo
// encuentra por el email y lo completa como siempre. Nunca toca un lead de otra Entrada ni cambia un email que ya había.
export async function completarLeadDelEvento(o: { proyectoId: string; entradaId: string; eventId: unknown; email: string | null }): Promise<boolean> {
  const eventId = typeof o.eventId === "string" ? o.eventId.trim().slice(0, 200) : "";
  if (!eventId || !o.email) return false;

  const { data: yaEsDeOtro } = await db().from("leads").select("id").eq("proyecto_id", o.proyectoId).eq("email", o.email).limit(1).maybeSingle();
  if (yaEsDeOtro) return false; // el email gana, como siempre

  const { data: antes } = await db()
    .from("webhook_eventos")
    .select("lead_id")
    .eq("entrada_id", o.entradaId)
    .eq("payload->>event_id", eventId)
    .not("lead_id", "is", null)
    .order("recibido_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!antes?.lead_id) return false;

  const { data: puesto, error } = await db()
    .from("leads")
    .update({ email: o.email })
    .eq("id", antes.lead_id)
    .eq("proyecto_id", o.proyectoId)
    .is("email", null)
    .select("id");
  if (error) {
    // Nunca rompe el envío: en el peor caso queda como antes (un lead aparte)
    console.error("[entrada] event_id:", error.message);
    return false;
  }
  return (puesto ?? []).length > 0;
}
