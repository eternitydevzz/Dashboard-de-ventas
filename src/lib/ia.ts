import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/datos";
import { ErrorUsuario } from "@/lib/resultado";
import { esquemaAnalisis, limpiarAnalisis, MODELO_IA, promptSistema, textoLlamada, type ConfigAgentes } from "@/lib/ia-agentes";

// Una sola puerta a Claude: así los tests la cambian por una falsa y nunca se gasta sin querer.
export type PeticionClaude = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
export type LlamarClaude = (p: PeticionClaude) => Promise<Anthropic.Beta.Messages.BetaMessage>;

export const hayClaveIa = () => !!process.env.ANTHROPIC_API_KEY;

const llamarDeVerdad: LlamarClaude = (p) => new Anthropic().beta.messages.create(p);

// Lo común de cada petición: Sonnet 5.5 · fallbacks "default" (si un filtro de seguridad rechaza, el servidor
// lo reintenta en otro modelo; recomendado por Anthropic) · JSON con formato fijo · esfuerzo medio.
export function peticion(o: { sistema: string; usuario: string; esquema: Record<string, unknown>; maxTokens?: number; esfuerzo?: "low" | "medium" | "high" }): PeticionClaude {
  return {
    model: MODELO_IA,
    max_tokens: o.maxTokens ?? 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: o.sistema, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: o.usuario }],
    output_config: { effort: o.esfuerzo ?? "medium", format: { type: "json_schema", schema: o.esquema } },
  };
}

// Llama a Claude y devuelve el JSON. Los errores salen en español, sin datos internos, y se enseñan al usuario (ErrorUsuario).
export async function pedirJson(p: PeticionClaude, llamar: LlamarClaude = llamarDeVerdad) {
  if (llamar === llamarDeVerdad && !hayClaveIa()) throw new ErrorUsuario("Falta la clave de Claude en el servidor (ANTHROPIC_API_KEY).");
  let r: Anthropic.Beta.Messages.BetaMessage;
  try {
    r = await llamar(p);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ErrorUsuario("Claude no acepta la clave (ANTHROPIC_API_KEY).");
    if (e instanceof Anthropic.RateLimitError) throw new ErrorUsuario("Claude pide esperar (demasiadas peticiones). Se reintentará.");
    if (e instanceof Anthropic.BadRequestError) throw new ErrorUsuario(`Claude rechazó la petición: ${e.message.slice(0, 200)}`);
    if (e instanceof Anthropic.APIError) throw new ErrorUsuario(`Claude respondió ${e.status ?? "con un error"}. Se reintentará.`);
    if (e instanceof Anthropic.APIConnectionError) throw new ErrorUsuario("No se pudo conectar con Claude. Se reintentará.");
    throw e;
  }
  if (r.stop_reason === "refusal") throw new ErrorUsuario(`Claude no ha querido analizar esto${r.stop_details?.category ? ` (motivo: ${r.stop_details.category})` : ""}.`);
  if (r.stop_reason === "max_tokens") throw new ErrorUsuario("La respuesta de Claude se cortó (demasiado larga).");
  const texto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return { json: JSON.parse(texto) as unknown, usage: r.usage, modelo: r.model };
  } catch {
    throw new ErrorUsuario("Claude no devolvió el formato esperado.");
  }
}

// Configuración que toca: la del producto encima de la general
export async function configPara(proyectoId: string, productoId: string | null) {
  const { data } = await db().from("config_ia").select("producto_id, contexto, agentes").eq("proyecto_id", proyectoId);
  const general = (data ?? []).find((c) => !c.producto_id);
  const prod = productoId ? (data ?? []).find((c) => c.producto_id === productoId) : undefined;
  return {
    contexto: prod?.contexto?.trim() ? prod.contexto : general?.contexto ?? null,
    agentes: { ...((general?.agentes ?? {}) as ConfigAgentes), ...((prod?.agentes ?? {}) as ConfigAgentes) },
  };
}

// Deja la grabación lista para analizar (o la vuelve a poner en cola con «Re-analizar»)
export async function encolarAnalisis(proyectoId: string, grabacionId: string) {
  const { data: g } = await db().from("grabaciones").select("id, cita_id, closer_id, citas(lead_id)").eq("id", grabacionId).eq("proyecto_id", proyectoId).maybeSingle();
  if (!g) return;
  const leadId = (g.citas as unknown as { lead_id: string } | null)?.lead_id ?? null;
  await db().from("analisis_llamadas").upsert({ proyecto_id: proyectoId, grabacion_id: g.id, cita_id: g.cita_id, closer_id: g.closer_id, lead_id: leadId, estado: "pendiente", error: null }, { onConflict: "grabacion_id" });
}

async function analizarUno(analisisId: string, llamar?: LlamarClaude) {
  const { data: a } = await db().from("analisis_llamadas").select("*, grabaciones(titulo, inicio, resumen, transcripcion), proyectos(nombre)").eq("id", analisisId).single();
  if (!a) return;
  await db().from("analisis_llamadas").update({ estado: "procesando", empezado_en: new Date().toISOString() }).eq("id", analisisId);
  try {
    const g = a.grabaciones as { titulo: string | null; inicio: string | null; resumen: string | null; transcripcion: unknown };
    const { data: lead } = a.lead_id ? await db().from("leads").select("nombre, apellido").eq("id", a.lead_id).maybeSingle() : { data: null };
    const { data: venta } = a.lead_id ? await db().from("ventas").select("producto_id, productos(nombre)").eq("lead_id", a.lead_id).order("fecha", { ascending: false }).limit(1).maybeSingle() : { data: null };
    const cfg = await configPara(a.proyecto_id, venta?.producto_id ?? null);
    const usuario = textoLlamada({ titulo: g.titulo, lead: lead ? `${lead.nombre} ${lead.apellido ?? ""}`.trim() : null, producto: (venta?.productos as unknown as { nombre: string } | null)?.nombre ?? null, fecha: g.inicio, resumenFathom: g.resumen, transcripcion: Array.isArray(g.transcripcion) ? g.transcripcion : null });
    if (usuario.length > 600_000) throw new Error("La transcripción es demasiado larga para analizarla de una vez.");
    const { json, usage, modelo } = await pedirJson(peticion({ sistema: promptSistema({ negocio: (a.proyectos as { nombre: string }).nombre, contexto: cfg.contexto, agentes: cfg.agentes }), usuario, esquema: esquemaAnalisis(cfg.agentes) }), llamar);
    const r = limpiarAnalisis(json, cfg.agentes);
    await db()
      .from("analisis_llamadas")
      .update({ estado: "hecho", modelo, puntuacion: r.puntuacion, resultado: r.resultado, resumen: r.resumen, secciones: r.secciones, autocompletado: r.autocompletado, autocompletado_estado: r.autocompletado ? "pendiente" : null, tokens: usage, error: null, analizado_en: new Date().toISOString() })
      .eq("id", analisisId);
  } catch (e) {
    await db().from("analisis_llamadas").update({ estado: "error", error: e instanceof Error ? e.message : "Error desconocido" }).eq("id", analisisId);
  }
}

// Analiza las pendientes (y las que se quedaron «procesando» más de 10 minutos), de una en una.
// Pocas por vez: en Vercel una función dura como mucho 300 s (plan Hobby, fluid compute); lo que quede va en la siguiente vuelta.
export async function procesarPendientes(proyectoId: string, o: { llamar?: LlamarClaude; max?: number } = {}) {
  const atascadas = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data } = await db().from("analisis_llamadas").select("id").eq("proyecto_id", proyectoId).or(`estado.eq.pendiente,and(estado.eq.procesando,empezado_en.lt.${atascadas})`).order("creado_en").limit(o.max ?? 4);
  for (const x of data ?? []) await analizarUno(x.id, o.llamar);
  return (data ?? []).length;
}
