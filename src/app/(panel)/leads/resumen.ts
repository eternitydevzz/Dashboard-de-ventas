"use server";

import { getSesion, esJefe } from "@/lib/auth";
import { db, equipo } from "@/lib/datos";
import { fechaHora, ETIQUETA_ESTADO_CALLER } from "@/lib/formato";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import type { Lead, Respuesta } from "@/lib/tipos";

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
};

export async function resumenLead(leadId: string) {
  return seguro(async (): Promise<ResumenLead> => {
    const { perfil, proyecto } = await getSesion();
    const { data: lead } = await db().from("leads").select("*").eq("id", leadId).eq("proyecto_id", proyecto.id).maybeSingle<Lead>();
    if (!lead || (!esJefe(perfil) && lead.caller_id !== perfil.id && lead.closer_id !== perfil.id)) throw new ErrorUsuario("No puedes ver este lead.");
    const [gente, { data: extra }] = await Promise.all([equipo(proyecto.id, !!perfil.es_prueba), db().from("tarjetas_extra").select("pipeline_id, etapa_id").eq("lead_id", lead.id)]);
    const tarjetas = [{ pipeline_id: lead.pipeline_id, etapa_id: lead.etapa_id }, ...(extra ?? [])].filter((t) => t.pipeline_id);
    const ids = (k: "pipeline_id" | "etapa_id") => tarjetas.map((t) => t[k]).filter((x): x is string => !!x);
    const [{ data: pipes }, { data: etapas }] = await Promise.all([
      ids("pipeline_id").length ? db().from("pipelines").select("id, nombre").in("id", ids("pipeline_id")) : Promise.resolve({ data: [] }),
      ids("etapa_id").length ? db().from("etapas").select("id, nombre").in("id", ids("etapa_id")) : Promise.resolve({ data: [] }),
    ]);
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
    };
  });
}
