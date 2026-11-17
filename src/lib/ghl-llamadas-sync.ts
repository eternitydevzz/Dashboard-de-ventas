import "server-only";
import { db, porTrozos } from "@/lib/datos";
import { descifrar } from "@/lib/cifrado";
import { grabacionGhl, llamadasGhl, textoLineas, transcribirDeepgram, transcripcionGhl, type Linea } from "@/lib/ghl-llamadas";
import { configPara, hayClaveIa, pedirJson, peticion, type LlamarClaude } from "@/lib/ia";

type Opciones = { fetchImpl?: typeof fetch; ahora?: Date; llamar?: LlamarClaude; deepgramKey?: string | null; max?: number };

// 1) Trae las llamadas contestadas de más de 1 minuto (desde la última vez − 1 día; la primera vez, 14 días)
export async function sincronizarLlamadasGhl(proyectoId: string, o: Opciones = {}) {
  const ahora = o.ahora ?? new Date();
  const { data: p } = await db().from("proyectos").select("ghl_token, ghl_location_id, ghl_llamadas_sincronizado_en").eq("id", proyectoId).single();
  if (!p?.ghl_token || !p.ghl_location_id) throw new Error("Conecta GHL en Administración → Integraciones (token y subcuenta).");
  const desde = new Date(p.ghl_llamadas_sincronizado_en ? new Date(p.ghl_llamadas_sincronizado_en).getTime() - 86_400_000 : ahora.getTime() - 14 * 86_400_000);
  const ms = await llamadasGhl({ token: descifrar(p.ghl_token, "el token de GHL"), locationId: p.ghl_location_id, desde, fetchImpl: o.fetchImpl });
  let nuevas = 0;
  if (ms.length) {
    const contactos = [...new Set(ms.map((m) => m.contactId).filter((x): x is string => !!x))];
    const usuarios = [...new Set(ms.map((m) => m.userId).filter((x): x is string => !!x))];
    // En trozos (muchos ids no caben en la petición) y si una lectura falla, lanza (S3-9)
    const [leads, miembros, ya] = await Promise.all([
      porTrozos<{ id: string; ghl_contact_id: string }>(contactos, (t, a, b) => db().from("leads").select("id, ghl_contact_id").eq("proyecto_id", proyectoId).in("ghl_contact_id", t).order("id").range(a, b)),
      porTrozos<{ perfil_id: string; ghl_user_id: string }>(usuarios, (t, a, b) => db().from("miembros_proyecto").select("perfil_id, ghl_user_id").eq("proyecto_id", proyectoId).in("ghl_user_id", t).order("perfil_id").range(a, b)),
      porTrozos<{ ghl_message_id: string }>(ms.map((m) => m.id), (t, a, b) => db().from("llamadas_ghl").select("ghl_message_id").eq("proyecto_id", proyectoId).in("ghl_message_id", t).order("ghl_message_id").range(a, b)),
    ]);
    const existentes = new Set(ya.map((x) => x.ghl_message_id));
    const filas = ms
      .filter((m) => !existentes.has(m.id))
      .map((m) => ({
        proyecto_id: proyectoId,
        ghl_message_id: m.id,
        ghl_contact_id: m.contactId ?? null,
        ghl_user_id: m.userId ?? null,
        lead_id: leads.find((l) => l.ghl_contact_id === m.contactId)?.id ?? null,
        perfil_id: miembros.find((x) => x.ghl_user_id === m.userId)?.perfil_id ?? null,
        fecha: m.dateAdded ?? null,
        duracion: Math.round(Number(m.meta?.callDuration ?? 0)),
        direccion: m.direction ?? null,
      }));
    if (filas.length) {
      const { error } = await db().from("llamadas_ghl").upsert(filas, { onConflict: "proyecto_id,ghl_message_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    nuevas = filas.length;
  }
  await db().from("proyectos").update({ ghl_llamadas_sincronizado_en: ahora.toISOString() }).eq("id", proyectoId);
  return { nuevas };
}

const ESQUEMA = {
  type: "object",
  properties: {
    resumen: { type: "string", description: "Resumen de la llamada en 2-4 frases." },
    puntuacion: { type: "integer", description: "Cómo lo hizo quien llamó, de 0 a 100." },
    interes: { type: "integer", description: "Interés del lead: 1 no responde, 2 responde pero no sabe nada, 3 interesado, 4 quiere saber más, 5 quiere comprar." },
    objeciones: { type: "string", description: "Objeciones del lead y cómo se manejaron, en viñetas." },
    coaching: { type: "string", description: "2-3 mejoras concretas para la próxima llamada, con frases de ejemplo." },
    siguiente_paso: { type: "string", description: "Qué hacer ahora con este lead." },
  },
  required: ["resumen", "puntuacion", "interes", "objeciones", "coaching", "siguiente_paso"],
  additionalProperties: false,
};

// 2) Transcribe (GHL primero; si no la tiene, Deepgram) y analiza con Claude, de una en una
export async function procesarLlamadasGhl(proyectoId: string, o: Opciones = {}) {
  const deepgram = o.deepgramKey !== undefined ? o.deepgramKey : process.env.DEEPGRAM_API_KEY ?? null;
  const puedeIa = !!o.llamar || hayClaveIa();
  const { data: p } = await db().from("proyectos").select("nombre, ghl_token, ghl_location_id").eq("id", proyectoId).single();
  if (!p?.ghl_token || !p.ghl_location_id) return 0;
  const token = descifrar(p.ghl_token, "el token de GHL");
  const atascadas = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: cola } = await db().from("llamadas_ghl").select("*").eq("proyecto_id", proyectoId).or(`estado.eq.pendiente,and(estado.eq.procesando,empezado_en.lt.${atascadas})`).order("fecha", { ascending: false }).limit(o.max ?? 5);
  const cfg = await configPara(proyectoId, null);
  for (const l of cola ?? []) {
    await db().from("llamadas_ghl").update({ estado: "procesando", empezado_en: new Date().toISOString() }).eq("id", l.id);
    try {
      let lineas = (l.transcripcion as Linea[] | null) ?? null;
      let fuente = l.fuente as string | null;
      if (!lineas?.length) {
        const ctx = { token, locationId: p.ghl_location_id, messageId: l.ghl_message_id, fetchImpl: o.fetchImpl };
        lineas = await transcripcionGhl(ctx);
        fuente = "ghl";
        if (!lineas) {
          if (!deepgram) throw new Error("GHL no tiene la transcripción y falta la clave de Deepgram (DEEPGRAM_API_KEY).");
          const audio = await grabacionGhl(ctx);
          if (!audio) {
            await db().from("llamadas_ghl").update({ estado: "sin_audio", error: "GHL no tiene la grabación de esta llamada." }).eq("id", l.id);
            continue;
          }
          lineas = await transcribirDeepgram({ audio, apiKey: deepgram, fetchImpl: o.fetchImpl });
          fuente = "deepgram";
        }
        await db().from("llamadas_ghl").update({ transcripcion: lineas, fuente }).eq("id", l.id);
      }
      if (!lineas.length) throw new Error("La transcripción salió vacía.");
      if (!puedeIa) throw new Error("Transcrita. Falta la clave de Claude en el servidor (ANTHROPIC_API_KEY) para analizarla.");
      const { json } = await pedirJson(
        peticion({
          sistema: [`Eres un analista de ventas que revisa llamadas de callers de «${p.nombre}». El objetivo de un caller es cualificar al lead y agendar una llamada con un closer. Escribe en español de España, breve, con viñetas en Markdown. Si algo no aparece en la llamada, dilo en vez de inventarlo.`, cfg.contexto?.trim() ? `Contexto del negocio:\n${cfg.contexto.trim()}` : ""].filter(Boolean).join("\n\n"),
          usuario: `Duración: ${Math.round((l.duracion ?? 0) / 60)} min\n\nTranscripción:\n${textoLineas(lineas)}`,
          esquema: ESQUEMA,
          maxTokens: 8000,
        }),
        o.llamar
      );
      const x = (json ?? {}) as Record<string, unknown>;
      const s = (v: unknown) => (typeof v === "string" ? v.slice(0, 6000) : "");
      await db()
        .from("llamadas_ghl")
        .update({
          estado: "hecho",
          error: null,
          puntuacion: Math.max(0, Math.min(100, Math.round(Number(x.puntuacion) || 0))),
          analisis: { resumen: s(x.resumen), interes: Math.max(1, Math.min(5, Math.round(Number(x.interes) || 1))), objeciones: s(x.objeciones), coaching: s(x.coaching), siguiente_paso: s(x.siguiente_paso) },
        })
        .eq("id", l.id);
    } catch (e) {
      await db().from("llamadas_ghl").update({ estado: "error", error: e instanceof Error ? e.message : "Error desconocido" }).eq("id", l.id);
    }
  }
  return (cola ?? []).length;
}
