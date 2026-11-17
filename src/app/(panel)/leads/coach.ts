"use server";

import { exigirSeccion } from "@/lib/permisos";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { db } from "@/lib/datos";
import { getSesion, esJefe } from "@/lib/auth";
import { configPara, pedirJson, peticion, type LlamarClaude } from "@/lib/ia";
import { anotar, bloqueado } from "@/lib/limite";

// Coach de IA, versión sencilla (decisión de Cristian, V2-11): quien llama escribe lo que dice el lead
// y Claude responde al momento cómo manejarlo. Sin audio. A Claude no se le mandan email ni teléfono.
export async function coachIa(leadId: string | null, loQueDice: string, llamar?: LlamarClaude) {
  return seguro(async () => {
    await exigirSeccion("cola", "crm", "agendas"); // H5
    const { perfil, proyecto } = await getSesion();
    const texto = loQueDice.trim();
    if (texto.length < 3) throw new ErrorUsuario("Escribe lo que ha dicho el lead.");
    if (texto.length > 2000) throw new ErrorUsuario("Demasiado largo: resúmelo en unas frases.");
    // S2-20: cada consulta gasta IA; 30 por persona y hora (Cristian, 17 nov) sobra para llamadas en directo
    const clave = `coach:${perfil.id}`;
    if (await bloqueado(clave, 30, 3_600_000)) throw new ErrorUsuario("Demasiadas consultas al coach en la última hora. Espera un poco.");
    await anotar(clave);
    let respuestas = "";
    if (leadId) {
      const { data: l } = await db().from("leads").select("caller_id, closer_id, respuestas").eq("id", leadId).eq("proyecto_id", proyecto.id).maybeSingle();
      if (!l) throw new ErrorUsuario("Lead no encontrado.");
      if (!esJefe(perfil) && l.caller_id !== perfil.id && l.closer_id !== perfil.id) throw new ErrorUsuario("Este lead no está asignado a ti.");
      respuestas = ((l.respuestas ?? []) as { pregunta: string; respuesta: string }[]).map((r) => `- ${r.pregunta}: ${r.respuesta}`).join("\n");
    }
    const cfg = await configPara(proyecto.id, null);
    const quien = perfil.rol === "caller" ? "un caller (su objetivo es agendar una llamada con el closer, no vender)" : "un closer (su objetivo es cerrar la venta)";
    const { json } = await pedirJson(
      peticion({
        sistema: [
          `Eres un coach de ventas en directo para ${quien} de «${proyecto.nombre}». Responde en español de España, muy breve y práctico: se lee mientras la llamada sigue.`,
          cfg.contexto?.trim() ? `Contexto del negocio:\n${cfg.contexto.trim()}` : "",
        ].filter(Boolean).join("\n\n"),
        usuario: `${respuestas ? `Respuestas del lead en el formulario:\n${respuestas}\n\n` : ""}El lead acaba de decir: «${texto}»\n\n¿Cómo respondo?`,
        esquema: {
          type: "object",
          properties: {
            idea: { type: "string", description: "Qué hay detrás de lo que dice y qué hacer, en 1-2 frases." },
            frases: { type: "array", items: { type: "string" }, description: "2 o 3 frases exactas para decir ahora." },
            pregunta: { type: "string", description: "Una pregunta para seguir la conversación." },
          },
          required: ["idea", "frases", "pregunta"],
          additionalProperties: false,
        },
        maxTokens: 4000,
        esfuerzo: "low",
      }),
      llamar
    );
    const o = (json ?? {}) as { idea?: unknown; frases?: unknown; pregunta?: unknown };
    return {
      idea: typeof o.idea === "string" ? o.idea.slice(0, 1000) : "",
      frases: Array.isArray(o.frases) ? o.frases.filter((x): x is string => typeof x === "string").slice(0, 4).map((x) => x.slice(0, 500)) : [],
      pregunta: typeof o.pregunta === "string" ? o.pregunta.slice(0, 500) : "",
    };
  });
}
