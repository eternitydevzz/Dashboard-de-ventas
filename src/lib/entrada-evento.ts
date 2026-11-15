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

// Cristian, 15 nov («sí, arréglalo»): desde el 13 nov, 4 envíos de la web llegaron 2 veces idénticos (mismo event_id y
// mismo contenido) en 1-5 s (reintento de la web o doble clic). Ese repetido se ignora. El formulario por pasos manda
// el mismo event_id con contenido distinto: ese sí sigue (arriba). Sin event_id no hay con qué compararlo: sigue.
const ordenado = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(ordenado) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenado((v as Record<string, unknown>)[k])])) : v;
// La base (jsonb) reordena las claves: se comparan ya ordenadas
export const mismoEnvio = (a: unknown, b: unknown) => JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));

export async function envioRepetido(entradaId: string, cuerpo: Record<string, unknown>): Promise<boolean> {
  const eventId = typeof cuerpo.event_id === "string" ? cuerpo.event_id.trim().slice(0, 200) : "";
  if (!eventId) return false;
  const { data, error } = await db()
    .from("webhook_eventos")
    .select("payload")
    .eq("entrada_id", entradaId)
    .eq("payload->>event_id", eventId)
    .gte("recibido_en", new Date(Date.now() - 60_000).toISOString())
    .order("recibido_en", { ascending: false })
    .limit(5);
  // Si no se puede mirar, se procesa como siempre (mejor un envío de más que perder uno)
  if (error) return false;
  return (data ?? []).some((f) => mismoEnvio(f.payload, cuerpo));
}
