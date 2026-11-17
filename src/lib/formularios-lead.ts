import "server-only";
import { db } from "@/lib/datos";
import { interpretar } from "@/lib/entrada";
import type { Respuesta } from "@/lib/tipos";

// Fase B (17 nov): cada formulario que llegó del lead, uno a uno, con sus respuestas tal cual llegaron.
// Aparte de leads.respuestas (unirRespuestas pisa la misma pregunta); aquí no se pisa nada.
// `fecha` es la ISO de recibido_en: la ficha y el popup la pasan a la zona del proyecto antes de enseñarla.
export type EnvioFormulario = { id: string; fecha: string; entrada: string; respuestas: Respuesta[]; vaciado: boolean };

type FilaEnvio = { id: string; recibido_en: string; tipo: string | null; payload: unknown; entradas: { nombre: string } | null };

export const MAX_ENVIOS = 50; // datos reales (17 nov): el lead con más envíos tiene 9

// limpiar_payload_envios deja payload = {} en los de más de 12 meses: se enseñan como «Contenido borrado»
const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function enviosDelLead(filas: FilaEnvio[]): EnvioFormulario[] {
  return [...filas]
    .sort((a, b) => new Date(b.recibido_en).getTime() - new Date(a.recibido_en).getTime())
    .map((f) => {
      const vaciado = !esObjeto(f.payload) || Object.keys(f.payload).length === 0;
      return {
        id: f.id,
        fecha: f.recibido_en,
        entrada: f.entradas?.nombre || f.tipo || "Sin Entrada",
        respuestas: vaciado ? [] : interpretar(f.payload as Record<string, unknown>).lead.respuestas,
        vaciado,
      };
    });
}

export async function cargarEnviosLead(proyectoId: string, leadId: string): Promise<EnvioFormulario[]> {
  const { data, error } = await db()
    .from("webhook_eventos")
    .select("id, recibido_en, tipo, payload, entradas(nombre)")
    .eq("proyecto_id", proyectoId)
    .eq("lead_id", leadId)
    .order("recibido_en", { ascending: false })
    .limit(MAX_ENVIOS);
  if (error) throw new Error(`Formularios del lead: ${error.message}`);
  return enviosDelLead((data ?? []) as unknown as FilaEnvio[]);
}
