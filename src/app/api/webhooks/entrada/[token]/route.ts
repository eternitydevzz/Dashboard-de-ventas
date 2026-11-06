import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardarLeads, telefonoClave } from "@/lib/leads";
import { dentroDelLimite } from "@/lib/limite";
import { aplicarReglas, interpretar, reglasValidas } from "@/lib/entrada";
import type { Proyecto } from "@/lib/tipos";

// Dirección de una landing («Entradas» en Administración). La landing manda aquí el mismo
// JSON que manda a GHL. Se guarda TODO tal cual y después se interpreta: nombre, email,
// teléfono, respuestas, UTM… y las reglas deciden pipeline, columna y etiquetas.
// La dirección lleva un token secreto (como los webhooks de entrada de GHL).
// La landing puede enviar desde el navegador del visitante: por eso se permite CORS.

const db = () => createAdminClient();
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};
const responder = (cuerpo: object, status = 200) => NextResponse.json(cuerpo, { status, headers: CORS });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

type Entrada = { id: string; proyecto_id: string; nombre: string; pipeline_id: string | null; etapa_id: string | null; reglas: unknown; activa: boolean; ghl_activo?: boolean; ghl_espera_seg?: number | null };

export async function POST(request: NextRequest, ctx: RouteContext<"/api/webhooks/entrada/[token]">) {
  const { token } = await ctx.params;
  if (!/^[0-9a-f]{48}$/.test(token)) return responder({ ok: false, error: "No encontrada" }, 404);
  if (Number(request.headers.get("content-length") ?? 0) > 500_000) return responder({ ok: false, error: "Demasiado grande" }, 413);
  if (!(await dentroDelLimite(`entrada:${token}`, 300, 60_000))) return responder({ ok: false, error: "Demasiadas peticiones" }, 429);

  const { data: entrada } = await db().from("entradas").select("*").eq("token", token).maybeSingle<Entrada>();
  if (!entrada || !entrada.activa) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!(await dentroDelLimite(`entrada-fallo:${ip}`, 30, 15 * 60_000))) return responder({ ok: false, error: "Demasiados intentos" }, 429);
    return responder({ ok: false, error: "No encontrada" }, 404);
  }

  const texto = await request.text();
  if (texto.length > 500_000) return responder({ ok: false, error: "Demasiado grande" }, 413);
  let cuerpo: Record<string, unknown>;
  try {
    const j = JSON.parse(texto);
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error();
    cuerpo = j;
  } catch {
    return responder({ ok: false, error: "JSON no válido" }, 400);
  }

  // 1 · Se guarda el envío entero, pase lo que pase después
  const { data: evento } = await db()
    .from("webhook_eventos")
    .insert({ proyecto_id: entrada.proyecto_id, entrada_id: entrada.id, tipo: `entrada: ${entrada.nombre}`, payload: cuerpo })
    .select("id")
    .single();
  // El motivo completo queda en el registro (Administración → Entradas); fuera solo sale si es esperado
  const fallo = async (msg: string, status = 422, publico = msg) => {
    if (evento) await db().from("webhook_eventos").update({ error: msg.slice(0, 300) }).eq("id", evento.id);
    return responder({ ok: false, error: publico }, status);
  };

  try {
    // 2 · Se interpreta
    const r = interpretar(cuerpo);
    if (!r.lead.email && telefonoClave(r.lead.telefono).length < 6) return await fallo("El envío no trae email ni teléfono");
    const { data: proyecto } = await db().from("proyectos").select("*").eq("id", entrada.proyecto_id).single<Proyecto>();
    if (!proyecto) return await fallo("Proyecto no encontrado", 404);

    // 3 · Las reglas deciden pipeline, columna y etiquetas (como el workflow de GHL)
    const destino = aplicarReglas(cuerpo, reglasValidas(entrada.reglas), { pipeline_id: entrada.pipeline_id, etapa_id: entrada.etapa_id });
    const lead = { ...r.lead, etiquetas: [...new Set([...r.lead.etiquetas, ...destino.etiquetas])], extra: { fuente: r.fuente, evento: r.evento, seguimiento: r.seguimiento, quiz_score: r.quiz_score, datos: r.datos } };
    await guardarLeads(proyecto, [lead], {
      pipelineId: destino.pipeline_id,
      etapaId: destino.etapa_id,
      origen: "ghl",
      perfilId: null,
      repartir: true,
      notaActividad: `Entró por «${entrada.nombre}»`,
    });

    // 4 · El envío queda unido a su lead
    const q = db().from("leads").select("id").eq("proyecto_id", proyecto.id);
    const { data: guardado } = await (lead.email ? q.eq("email", lead.email) : q.eq("telefono", lead.telefono!)).order("creado_en", { ascending: false }).limit(1).maybeSingle();
    // 5 · Plan GHL, fase 1 (Cristian, 6 nov 2026): si la Entrada manda a GHL, el envío espera (1 min por defecto) por
    // si llega el cuestionario; lo manda la lectura de cada 60 s (src/lib/ghl-envios.ts), un solo envío por lead.
    const ghl = entrada.ghl_activo && guardado?.id ? { ghl_estado: "esperando", ghl_enviar_en: new Date(Date.now() + (entrada.ghl_espera_seg ?? 60) * 1000).toISOString() } : {};
    if (evento) await db().from("webhook_eventos").update({ procesado: true, lead_id: guardado?.id ?? null, ...ghl }).eq("id", evento.id);
    return responder({ ok: true });
  } catch (e) {
    console.error("[entrada] error:", e);
    return await fallo(e instanceof Error ? e.message : "Error", 500, "No se pudo guardar el envío");
  }
}
