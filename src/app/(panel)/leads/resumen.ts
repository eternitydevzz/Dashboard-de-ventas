import "server-only";
import { getSesion, esJefe } from "@/lib/auth";
import { db, equipo } from "@/lib/datos";
import { fechaHora, ETIQUETA_ESTADO_CALLER } from "@/lib/formato";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import type { Lead, Respuesta } from "@/lib/tipos";
import { cargarEnviosLead, type EnvioFormulario } from "@/lib/formularios-lead";

// Popup de la card del lead (Cristian, 13 oct 2026): contacto, dónde está, equipo, etiquetas, oferta y respuestas
// del formulario. Lo ve quien puede ver su ficha (el jefe, o su caller o su closer), con la misma regla que /leads/[id].
export type ResumenLead = {
  id: string;
  nombre: string;
  telefono: string | null;
  pais: string | null; // 1b: código del país o «Sin país»
  email: string | null;
  donde: { pipeline: string; columna: string }[]; // el principal primero; después sus tarjetas 🔗
  entro: string;
  caller: string | null;
  closer: string | null;
  estado: string;
  estrellas: number | null;
  etiquetas: string[];
  oferta: Lead["oferta"];
  respuestas: Respuesta[];
  formularios: EnvioFormulario[]; // Fase B: cada envío, del más nuevo; `fecha` ya en la zona del proyecto
};

// Cristian, 14 nov (Ola 2): el popup lo pide por GET (api/leads/[id]/resumen) y no como acción del servidor: Next manda
// las acciones de una en una y el popup esperaba a que acabara de guardarse un movimiento. La ruta da 403 con este texto.
export const SIN_PERMISO = "No puedes ver este lead.";
// Solo las columnas que enseña (antes `*`, con `datos` de GHL)
const CAMPOS = "id, nombre, apellido, telefono, pais, email, pipeline_id, etapa_id, creado_en, caller_id, closer_id, estado_caller, estrellas_caller, etiquetas, oferta, respuestas";

export async function resumenLead(leadId: string) {
  return seguro(async (): Promise<ResumenLead> => {
    const { perfil, proyecto } = await getSesion();
    // Ola 2: el lead, sus tarjetas 🔗 y el equipo a la vez (antes, en fila). Las tarjetas solo se usan si puede verlo.
    // Cristian, 14 nov: estas lecturas también miran su error (antes, un fallo salía como «—» sin avisar)
    const [{ data: lead, error }, gente, { data: extra, error: eExtra }] = await Promise.all([
      db().from("leads").select(CAMPOS).eq("id", leadId).eq("proyecto_id", proyecto.id).maybeSingle<Lead>(),
      equipo(proyecto.id, !!perfil.es_prueba),
      db().from("tarjetas_extra").select("pipeline_id, etapa_id").eq("lead_id", leadId),
    ]);
    if (error) throw new Error(`Popup del lead: ${error.message}`); // D43: un fallo de la base es error genérico, no «No puedes ver»
    if (!lead || (!esJefe(perfil) && lead.caller_id !== perfil.id && lead.closer_id !== perfil.id)) throw new ErrorUsuario(SIN_PERMISO);
    if (eExtra) throw new Error(`Popup del lead (tarjetas_extra): ${eExtra.message}`);
    const tarjetas = [{ pipeline_id: lead.pipeline_id, etapa_id: lead.etapa_id }, ...(extra ?? [])].filter((t) => t.pipeline_id);
    const ids = (k: "pipeline_id" | "etapa_id") => tarjetas.map((t) => t[k]).filter((x): x is string => !!x);
    // Fase B: sus formularios, ya con permiso y a la vez que los nombres (si falla, lanza: error genérico)
    const [{ data: pipes, error: ePipes }, { data: etapas, error: eEtapas }, envios] = await Promise.all([
      ids("pipeline_id").length ? db().from("pipelines").select("id, nombre").in("id", ids("pipeline_id")) : Promise.resolve({ data: [], error: null }),
      ids("etapa_id").length ? db().from("etapas").select("id, nombre").in("id", ids("etapa_id")) : Promise.resolve({ data: [], error: null }),
      cargarEnviosLead(proyecto.id, lead.id),
    ]);
    const eNombres = ePipes ?? eEtapas;
    if (eNombres) throw new Error(`Popup del lead (pipelines/etapas): ${eNombres.message}`);
    const nombreDe = (lista: { id: string; nombre: string }[] | null, id: string | null) => lista?.find((x) => x.id === id)?.nombre ?? "—";
    const persona = (id: string | null) => (id ? gente.find((g) => g.id === id)?.nombre ?? null : null);
    return {
      id: lead.id,
      nombre: `${lead.nombre} ${lead.apellido ?? ""}`.trim(),
      telefono: lead.telefono,
      pais: lead.pais ?? null,
      email: lead.email,
      donde: tarjetas.map((t) => ({ pipeline: nombreDe(pipes, t.pipeline_id), columna: nombreDe(etapas, t.etapa_id) })),
      entro: fechaHora(lead.creado_en, proyecto),
      caller: persona(lead.caller_id),
      closer: persona(lead.closer_id),
      estado: ETIQUETA_ESTADO_CALLER[lead.estado_caller] ?? lead.estado_caller,
      estrellas: lead.estrellas_caller,
      etiquetas: lead.etiquetas ?? [],
      oferta: lead.oferta ?? null,
      respuestas: lead.respuestas ?? [],
      formularios: envios.map((e) => ({ ...e, fecha: fechaHora(e.fecha, proyecto) })),
    };
  });
}
