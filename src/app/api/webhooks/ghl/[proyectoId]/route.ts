import { escribir } from "@/lib/datos";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { columnaCitasGhl, datosAgendaGhl, guardarLeads, juntarConCitaAbierta, moverAAgendadosOrganico, pipelineCitaGhl, telefonoClave, type LeadEntrada } from "@/lib/leads";
import { avisarCloserAgenda } from "@/lib/aviso-closer";
import { estadoTrasCitaGhl } from "@/lib/estado-cita-ghl";
import { ponerEtiqueta } from "@/lib/ghl-sync";
import { dentroDelLimite } from "@/lib/limite";
import { interpretar } from "@/lib/entrada";
import type { Proyecto } from "@/lib/tipos";
import { fechaDeGhl, mismoNombre } from "@/lib/formato";

// Recibe eventos de los workflows de GHL (acción «Webhook»).
// Campo `tipo`: lead_nuevo | cita_agendada | cambio_etapa.
// En GHL: acción «Custom Webhook» con Event = CUSTOM y el JSON de GUIA-GHL.md en «Raw Body».
// AVISO: el formato exacto de GHL no se ha probado todavía con datos reales
// (se probará al publicar). Por eso se guarda siempre el payload completo.

const db = () => createAdminClient();

function igual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
function primero(o: Json, claves: string[]) {
  for (const c of claves) {
    const partes = c.split(".");
    let v: unknown = o;
    for (const p of partes) v = v && typeof v === "object" ? (v as Json)[p] : undefined;
    const s = str(v);
    if (s) return s;
  }
  return "";
}

// Todo lo que llega se interpreta igual que en las «Entradas» (src/lib/entrada.ts): no se pierde nada.
function aLead(b: Json): LeadEntrada {
  const r = interpretar(b);
  return { ...r.lead, extra: { fuente: r.fuente, evento: r.evento, seguimiento: r.seguimiento, quiz_score: r.quiz_score, datos: r.datos } };
}

// Arreglo 18: se busca con filtros normales (.eq), nunca pegando el texto dentro del filtro (una coma o un
// paréntesis en el email lo rompía), y también por teléfono (últimas 9 cifras, como el resto de la app).
async function buscarLead(proyectoId: string, e: LeadEntrada) {
  const base = () => db().from("leads").select("id, pipeline_id").eq("proyecto_id", proyectoId);
  if (e.ghl_contact_id) {
    const { data } = await base().eq("ghl_contact_id", e.ghl_contact_id).limit(1).maybeSingle();
    if (data) return data;
  }
  if (e.email) {
    const { data } = await base().eq("email", e.email.toLowerCase()).limit(1).maybeSingle();
    if (data) return data;
  }
  const tel = telefonoClave(e.telefono);
  if (!e.email && tel.length >= 6) {
    const { data } = await base().eq("telefono_clave", tel).limit(1).maybeSingle();
    if (data) return data;
  }
  return null;
}

// Fase 4: con `conCita`, un lead que no existía nace ya en la columna de citas de GHL (su pipeline principal)
async function buscarOCrearLead(proyecto: Proyecto, b: Json, conCita = false, pipelineCita: string | null = null) {
  const e = aLead(b);
  if (!e.ghl_contact_id && !e.email && telefonoClave(e.telefono).length < 6) throw new Error("No se pudo identificar el lead: no viene email, teléfono ni contacto de GHL");
  const ya = await buscarLead(proyecto.id, e);
  if (ya) return ya;
  const destino = conCita ? await columnaCitasGhl(proyecto.id, pipelineCita) : null;
  const { data: pipe } = destino ? { data: null } : await db().from("pipelines").select("id").eq("proyecto_id", proyecto.id).eq("tipo", "normal").order("orden").limit(1).maybeSingle();
  await guardarLeads(proyecto, [e], { pipelineId: destino?.pipeline_id ?? pipe?.id ?? null, etapaId: destino?.id, origen: "ghl", perfilId: null, repartir: true });
  return buscarLead(proyecto.id, e);
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/webhooks/ghl/[proyectoId]">) {
  const { proyectoId } = await ctx.params;
  // D43: la clave solo en la cabecera x-eternity-secreto (en la URL acaba en los registros)
  const secreto = request.headers.get("x-eternity-secreto") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(proyectoId)) return NextResponse.json({ ok: false }, { status: 404 });
  // Tamaño: se corta antes de leer el cuerpo si el remitente ya dice que es enorme
  if (Number(request.headers.get("content-length") ?? 0) > 500_000) return NextResponse.json({ ok: false, error: "Demasiado grande" }, { status: 413 });
  const { data: proyecto } = await db().from("proyectos").select("*").eq("id", proyectoId).maybeSingle<Proyecto>();
  if (!proyecto || !secreto || !igual(secreto, proyecto.webhook_secreto)) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!(await dentroDelLimite(`webhook-fallo:${ip}`, 30, 15 * 60_000))) return NextResponse.json({ ok: false, error: "Demasiados intentos" }, { status: 429 });
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  // Ritmo: 300 eventos por minuto y proyecto, contados tras la clave (D43: sin clave no se gasta el cupo del proyecto)
  if (!(await dentroDelLimite(`webhook:${proyectoId}`, 300, 60_000))) return NextResponse.json({ ok: false, error: "Demasiadas peticiones" }, { status: 429 });

  const texto = await request.text();
  if (texto.length > 500_000) return NextResponse.json({ ok: false, error: "Demasiado grande" }, { status: 413 });
  let body: Json;
  try {
    body = JSON.parse(texto);
  } catch {
    return NextResponse.json({ ok: false, error: "JSON no válido" }, { status: 400 });
  }
  const tipo = primero(body, ["tipo", "customData.tipo", "type"]) || "lead_nuevo";
  const { data: evento } = await db().from("webhook_eventos").insert({ proyecto_id: proyecto.id, tipo, payload: body }).select("id").single();

  try {
    if (tipo === "lead_nuevo") {
      const { data: pipes } = await db().from("pipelines").select("id, nombre").eq("proyecto_id", proyecto.id).eq("tipo", "normal").order("orden");
      const pipelineNombre = primero(body, ["pipeline", "customData.pipeline"]);
      // Sin el número ni tildes: «Biblioteca Recursos» vale para «1. Biblioteca Recursos» (13 oct)
      const pipelineId = (pipelineNombre ? pipes?.find((p) => mismoNombre(p.nombre, pipelineNombre)) : null)?.id ?? pipes?.[0]?.id ?? null;
      await guardarLeads(proyecto, [aLead(body)], { pipelineId, origen: "ghl", perfilId: null, repartir: true });
    } else if (tipo === "cita_agendada" && (proyecto.ghl_calendarios ?? []).length) {
      // Plan GHL, fase 4 (16 oct): el proyecto lee sus citas por la API cada 30 s (con su canal, su calendario y su
      // closer). El aviso del workflow solo se guarda: si creara la cita, la mandaría a «Orgánico» antes de saber el canal.
      if (evento) await db().from("webhook_eventos").update({ procesado: true, error: "Ignorado: las citas se leen por la API" }).eq("id", evento.id);
      return NextResponse.json({ ok: true, ignorado: true });
    } else if (tipo === "cita_agendada") {
      // 13 oct: el workflow de cada calendario dice su pipeline («0. Agendas YT», «0. Agendas IG»…)
      // Si el workflow no lo dice, se pregunta a GHL en qué pipeline está su oportunidad en «Agendan»
      const pipelineCita = primero(body, ["pipeline", "customData.pipeline"]) || (await pipelineCitaGhl(proyecto, aLead(body).ghl_contact_id));
      const lead = await buscarOCrearLead(proyecto, body, true, pipelineCita);
      if (!lead) throw new Error("No se pudo identificar el lead");
      // 11 oct 2026: GHL manda calendar.startTime sin zona ("2026-10-14T15:30:00", hora de calendar.selectedTimezone).
      // Se prueba cada campo por orden y vale el primero que sea una fecha; sin zona, se lee en la del calendario
      // (o la del proyecto). El texto tipo «Wednesday, October 14, 2026 9:30 PM» no vale (no trae zona).
      const zonaCita = primero(body, ["calendar.selectedTimezone", "appointment.timezone", "timezone"]) || proyecto.zona_horaria;
      let fecha: Date | null = null;
      for (const c of ["fecha", "calendar.startTime", "appointment.start_time", "start_time", "startTime", "customData.fecha"]) {
        const v = primero(body, [c]);
        if (v && (fecha = fechaDeGhl(v, zonaCita))) break;
      }
      if (!fecha) throw new Error("La cita no trae fecha");
      const closerEmail = primero(body, ["closer_email", "customData.closer_email", "user.email", "assigned_user.email"]).toLowerCase();
      let closerId: string | null = null;
      // Arreglo 20: el closer se busca solo entre los miembros de este proyecto
      if (closerEmail) {
        const { data: c } = await db().from("miembros_proyecto").select("perfil_id, perfiles!inner(email, rol)").eq("proyecto_id", proyecto.id).eq("perfiles.email", closerEmail).eq("perfiles.rol", "closer").limit(1).maybeSingle();
        closerId = c?.perfil_id ?? null;
      }
      // Si GHL reenvía la misma cita, se actualiza la que ya existe (no se duplica)
      const ghlCitaId = primero(body, ["calendar.appointmentId", "appointment.id", "appointment_id"]) || null;
      // Arreglo 19: sin id de GHL, se busca una cita del mismo lead a la misma hora antes de crear otra
      const { data: yaExiste } = ghlCitaId
        ? await db().from("citas").select("id").eq("proyecto_id", proyecto.id).eq("ghl_cita_id", ghlCitaId).maybeSingle()
        : await db().from("citas").select("id").eq("proyecto_id", proyecto.id).eq("lead_id", lead.id).eq("fecha", fecha.toISOString()).neq("estado", "reagendada").limit(1).maybeSingle();
      if (yaExiste) await db().from("citas").update({ fecha: fecha.toISOString(), ...(closerId ? { closer_id: closerId } : {}) }).eq("id", yaExiste.id);
      else {
        // Fase 3: el aviso del workflow no trae el canal, así que no hay crédito de caller; con una cita abierta, se junta
        const agenda = await datosAgendaGhl(lead.id, null);
        const junta = await juntarConCitaAbierta(proyecto.id, lead.id, { fecha: fecha.toISOString(), closerId, ghlCitaId, origen: "ghl", agendadaPor: agenda.agendada_por });
        if (junta?.error) throw new Error(`No se pudo guardar en «citas»: ${junta.error.message}`);
        if (!junta) {
          const { data: nueva } = await escribir(db().from("citas").insert({ proyecto_id: proyecto.id, lead_id: lead.id, closer_id: closerId, ...agenda, fecha: fecha.toISOString(), origen: "ghl", ghl_cita_id: ghlCitaId }).select("id").single(), "citas");
          if (nueva && closerId && fecha.getTime() > Date.now()) await avisarCloserAgenda({ proyectoId: proyecto.id, closerId, citaId: nueva.id, motivo: "nueva" });
        }
      }
      // F21 y C11 punto 15 (Callers, 7 nov): la misma regla que la lectura de cada minuto. Vendido no se toca;
      // confirma agenda o descartado → «reagendado» con su etiqueta; el resto → «agendado».
      const { data: actual } = await db().from("leads").select("estado_caller").eq("id", lead.id).maybeSingle();
      const tras = estadoTrasCitaGhl(actual?.estado_caller);
      if (tras) {
        await escribir(db().from("leads").update({ estado_caller: tras.estado, llamar_en: null, ...(closerId ? { closer_id: closerId } : {}) }).eq("id", lead.id), "leads");
        if (tras.etiqueta) await ponerEtiqueta(lead.id, tras.etiqueta);
        await moverAAgendadosOrganico(proyecto.id, lead.id, pipelineCita);
      }
      await escribir(db().from("actividades").insert({ proyecto_id: proyecto.id, lead_id: lead.id, tipo: "cita", resultado: "agendada", nota: "Cita agendada en el calendario de GHL" }), "actividades");
    } else if (tipo === "cambio_etapa") {
      const lead = await buscarOCrearLead(proyecto, body);
      if (!lead) throw new Error("No se pudo identificar el lead");
      const etapaNombre = primero(body, ["etapa", "pipeline_stage", "pipleline_stage", "stage", "customData.etapa"]);
      const pipelineNombre = primero(body, ["pipeline_name", "pipeline", "customData.pipeline"]);
      if (!etapaNombre) throw new Error("No viene el nombre de la etapa");
      const { data: etapas } = await db().from("etapas").select("id, nombre, pipeline_id, pipelines!inner(proyecto_id, nombre, tipo)").eq("pipelines.proyecto_id", proyecto.id).eq("pipelines.tipo", "normal");
      const etapa = (etapas ?? []).find((e) => {
        const pipe = (Array.isArray(e.pipelines) ? e.pipelines[0] : e.pipelines) as { nombre: string } | null;
        return mismoNombre(e.nombre, etapaNombre) && (!pipelineNombre || mismoNombre(pipe?.nombre, pipelineNombre));
      });
      if (!etapa) throw new Error(`No existe la columna «${etapaNombre}» en la app`);
      await escribir(db().from("leads").update({ etapa_id: etapa.id, pipeline_id: etapa.pipeline_id }).eq("id", lead.id), "leads");
      await escribir(db().from("actividades").insert({ proyecto_id: proyecto.id, lead_id: lead.id, tipo: "cambio_etapa", nota: `GHL: movido a «${etapaNombre}»` }), "actividades");
    } else {
      throw new Error(`Tipo desconocido: ${tipo}`);
    }
    if (evento) await db().from("webhook_eventos").update({ procesado: true }).eq("id", evento.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (evento) await db().from("webhook_eventos").update({ error: msg.slice(0, 300) }).eq("id", evento.id);
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }
}

