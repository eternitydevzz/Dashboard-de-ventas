import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardarLeads, telefonoClave } from "@/lib/leads";
import { dentroDelLimite } from "@/lib/limite";
import { aplicarReglas, interpretar, reglasValidas } from "@/lib/entrada";
import { crearEjecuciones } from "@/lib/workflows-motor";
import { ipDelEnvio } from "@/lib/ip-envio";
import { completarLeadDelEvento } from "@/lib/entrada-evento";
import { enviarEmail, urlApp } from "@/lib/email";
import { EMAIL_AVISO_GHL } from "@/lib/ghl-envios";
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

type Entrada = { id: string; proyecto_id: string; nombre: string; pipeline_id: string | null; etapa_id: string | null; reglas: unknown; activa: boolean; ghl_activo?: boolean; ghl_espera_seg?: number | null; envia_desde?: string | null };

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
    // Plan GHL, punto 3 (Cristian, 7 nov): la IP de la persona, en el seguimiento (ver src/lib/ip-envio.ts)
    const ip = ipDelEnvio({ cuerpo, cabecera: request.headers.get("x-forwarded-for"), enviaDesde: entrada.envia_desde ?? null });
    const seguimiento = ip ? { ...r.seguimiento, ip } : r.seguimiento;
    const lead = { ...r.lead, etiquetas: [...new Set([...r.lead.etiquetas, ...destino.etiquetas])], extra: { fuente: r.fuente, evento: r.evento, seguimiento, quiz_score: r.quiz_score, datos: r.datos } };
    // Mismo event_id que un envío anterior de esta Entrada sin email: se completa ese lead (no se crea otro)
    await completarLeadDelEvento({ proyectoId: proyecto.id, entradaId: entrada.id, eventId: cuerpo.event_id, email: lead.email });
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
    const { data: guardado, error: errGuardado } = await (lead.email ? q.eq("email", lead.email) : q.eq("telefono", lead.telefono!)).order("creado_en", { ascending: false }).limit(1).maybeSingle();
    // Sin esto el envío se quedaría sin GHL ni workflow en silencio; el catch de abajo responde 500
    if (errGuardado) throw new Error(`No se pudo buscar el lead guardado: ${errGuardado.message}`);
    // 5 · Plan GHL, fase 1 (Cristian, 6 nov 2026): si la Entrada manda a GHL, el envío espera (1 min por defecto) por
    // si llega el cuestionario; lo manda la lectura de cada 60 s (src/lib/ghl-envios.ts), un solo envío por lead.
    const ghl = entrada.ghl_activo && guardado?.id ? { ghl_estado: "esperando", ghl_enviar_en: new Date(Date.now() + (entrada.ghl_espera_seg ?? 60) * 1000).toISOString() } : {};
    if (evento) await db().from("webhook_eventos").update({ procesado: true, lead_id: guardado?.id ?? null, ...ghl }).eq("id", evento.id);
    // 6 · Workflows, 4a-1 (Cristian, 7 nov 2026): si la Entrada tiene un workflow encendido, se crea su ejecución.
    // Un fallo aquí NUNCA cambia la respuesta: el lead ya está guardado y lo de hoy sigue igual.
    if (guardado?.id) {
      try {
        await crearEjecuciones({ proyectoId: proyecto.id, entradaId: entrada.id, leadId: guardado.id, envio: cuerpo });
      } catch (e) {
        console.error("[entrada] workflow:", e instanceof Error ? e.message : e);
      }
    }
    // 7 · Plan GHL, sección 5, punto 2 (forma B, Cristian 8 nov 2026): Entrada «Desde un workflow de GHL» y el lead
    // vuelve <10 min después de escribirlo nosotros en GHL = posible bucle → email (no cambia la respuesta).
    if (entrada.envia_desde === "ghl" && guardado?.id) {
      try {
        await avisarSiVuelve(entrada, guardado.id);
      } catch (e) {
        console.error("[entrada] aviso de bucle:", e instanceof Error ? e.message : e);
      }
    }
    return responder({ ok: true });
  } catch (e) {
    console.error("[entrada] error:", e);
    return await fallo(e instanceof Error ? e.message : "Error", 500, "No se pudo guardar el envío");
  }
}

// Escritura NUESTRA en GHL de este lead en los últimos 10 min: un envío «ok» de cualquier Entrada (se manda en cuanto
// llega su ghl_enviar_en) o una ejecución que pasó por algún tramo en real (cada uno apunta {modo:"real"} en su registro
// y actualiza actualizado_en, también los intermedios que siguen «esperando»: workflows-motor.ts:77-78,148).
// shortcut: un tramo real sin pasos de GHL (o un reintento) también cuenta (solo daría un email de más); sin columnas nuevas.
async function avisarSiVuelve(entrada: Entrada, leadId: string) {
  const hace10 = new Date(Date.now() - 10 * 60_000).toISOString();
  const [ev, ej] = await Promise.all([
    db().from("webhook_eventos").select("id").eq("lead_id", leadId).eq("ghl_estado", "ok").gte("ghl_enviar_en", hace10).limit(1),
    db().from("workflow_ejecuciones").select("id").eq("lead_id", leadId).contains("registro", JSON.stringify([{ modo: "real" }])).gte("actualizado_en", hace10).limit(1),
  ]);
  // Con un array, postgrest-js manda `cs.{[object Object]}` (no es JSON): por eso va como texto, y el error no se calla
  if (ev.error || ej.error) throw new Error((ev.error ?? ej.error)!.message);
  if (!ev.data?.length && !ej.data?.length) return;
  if (!(await dentroDelLimite(`ghl-vuelve:${entrada.id}`, 1, 60 * 60_000))) return;
  const r = await enviarEmail({
    para: [EMAIL_AVISO_GHL],
    asunto: `GHL: posible bucle en «${entrada.nombre}»`,
    texto: `Un lead (${leadId}) ha vuelto a la Entrada «${entrada.nombre}» desde GHL menos de 10 min después de que el dashboard lo escribiera en GHL. Puede ser un círculo sin fin: revisa el workflow de GHL que manda a esta Entrada.\n\nEl lead se ha guardado igual.\n\n${urlApp()}/admin?tab=entradas`,
  });
  if (!r.enviado) console.error("[entrada] no se pudo mandar el email del bucle:", r.motivo);
}
