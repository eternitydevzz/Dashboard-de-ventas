import "server-only";
import { esJefe } from "@/lib/auth";
import { exigirSeccion } from "@/lib/permisos";
import { db, equipo } from "@/lib/datos";
import { fechaHora } from "@/lib/formato";
import { ErrorUsuario, esError } from "@/lib/resultado";
import { elegir } from "@/lib/mcp/lectura";
import { guardarTranscripcion } from "@/app/(panel)/grabaciones/acciones";

// MCP, Fase 5 (11 nov 2026; plan en VENTAS/API-DASHBOARD): las grabaciones de los callers se transcriben en el Mac de
// Cristian con Whisper (decidido en la app: grabaciones/acciones.ts) y se suben aquí. Más una herramienta para leer las
// transcripciones de callers y closers (Fases 6 y 7). Solo el CEO y los directores con la sección «grabaciones».

async function jefeConGrabaciones() {
  const s = await exigirSeccion("grabaciones");
  if (!esJefe(s.perfil)) throw new ErrorUsuario("Solo el CEO y los directores trabajan con las transcripciones.");
  return s;
}

// ---------- grabaciones_pendientes ----------
export async function herramientaGrabacionesPendientes(a: { limite?: number }) {
  const { proyecto } = await jefeConGrabaciones();
  const limite = Math.max(1, Math.min(500, Math.trunc(a.limite ?? 100)));
  const { data, count, error } = await db()
    .from("grabaciones_caller")
    .select("id, creado_en, duracion_seg, perfil_id, tipo, leads(nombre, apellido)", { count: "exact" })
    .eq("proyecto_id", proyecto.id)
    .is("transcripcion", null)
    .order("creado_en")
    .limit(limite);
  if (error) throw new Error(`No se pudieron leer las grabaciones: ${error.message}`);
  const gente = await equipo(proyecto.id, true);
  const filas = data ?? [];
  return {
    pantalla: "Grabaciones",
    proyecto: proyecto.nombre,
    pendientes: count ?? filas.length,
    minutos: Math.round(filas.reduce((s, g) => s + (g.duracion_seg ?? 0), 0) / 60),
    grabaciones: filas.map((g) => {
      const l = g.leads as unknown as { nombre: string; apellido: string | null } | null;
      return { id: g.id, fecha: fechaHora(g.creado_en, proyecto), caller: gente.find((p) => p.id === g.perfil_id)?.nombre ?? "—", lead: l ? `${l.nombre} ${l.apellido ?? ""}`.trim() : "Lead borrado", segundos: g.duracion_seg, tipo: g.tipo };
    }),
  };
}

// ---------- enlace_grabacion: enlace firmado de 1 hora para descargar el audio (como /api/grabaciones/[id]) ----------
export async function herramientaEnlaceGrabacion(a: { grabacionId: string }) {
  const { proyecto } = await jefeConGrabaciones();
  const { data: g } = await db().from("grabaciones_caller").select("archivo_path, creado_en").eq("id", a.grabacionId).eq("proyecto_id", proyecto.id).maybeSingle();
  if (!g) throw new ErrorUsuario("Grabación no encontrada.");
  const ext = g.archivo_path.split(".").pop();
  const nombre = `grabacion-${g.creado_en.slice(0, 16).replace(/[:T]/g, "-")}.${ext}`;
  const { data, error } = await db().storage.from("grabaciones").createSignedUrl(g.archivo_path, 3600, { download: nombre });
  if (error || !data) throw new Error(`No se pudo crear el enlace: ${error?.message ?? "sin datos"}`);
  return { url: data.signedUrl, archivo: nombre, caduca: "en 1 hora" };
}

// ---------- subir_transcripcion (la misma acción que el botón «Guardar texto» de la pantalla) ----------
export async function herramientaSubirTranscripcion(a: { grabacionId: string; texto: string }) {
  await jefeConGrabaciones();
  const r = await guardarTranscripcion(a.grabacionId, a.texto);
  if (esError(r)) throw new ErrorUsuario(r.error);
  return { hecho: `Transcripción guardada (${a.texto.trim().length} caracteres).` };
}

// ---------- transcripciones (para analizar: callers, closers por Fathom y llamadas de GHL) ----------
export type ArgsTranscripciones = { fuente: "callers" | "fathom" | "ghl"; persona?: string; dias?: number; limite?: number };

const texto = (t: unknown) =>
  typeof t === "string" ? t : Array.isArray(t) ? t.map((x) => (typeof x === "object" && x ? `${(x as { quien?: string; speaker?: { display_name?: string } }).quien ?? (x as { speaker?: { display_name?: string } }).speaker?.display_name ?? ""}: ${(x as { texto?: string; text?: string }).texto ?? (x as { text?: string }).text ?? ""}` : String(x))).join("\n") : "";

export async function herramientaTranscripciones(a: ArgsTranscripciones) {
  const { proyecto } = await jefeConGrabaciones();
  const limite = Math.max(1, Math.min(50, Math.trunc(a.limite ?? 20)));
  const desde = a.dias ? new Date(Date.now() - a.dias * 86_400_000).toISOString() : null;
  const gente = await equipo(proyecto.id, true);
  const persona = a.persona ? elegir(gente, a.persona, "persona").id : null;
  const quien = (id: string | null) => (id ? gente.find((g) => g.id === id)?.nombre ?? "—" : "—");
  if (a.fuente === "callers") {
    let q = db().from("grabaciones_caller").select("id, creado_en, duracion_seg, perfil_id, lead_id, transcripcion").eq("proyecto_id", proyecto.id).not("transcripcion", "is", null);
    if (persona) q = q.eq("perfil_id", persona);
    if (desde) q = q.gte("creado_en", desde);
    const { data, error } = await q.order("creado_en", { ascending: false }).limit(limite);
    if (error) throw new Error(error.message);
    return { fuente: "Grabaciones de callers", total: data?.length ?? 0, llamadas: (data ?? []).map((g) => ({ id: g.id, fecha: fechaHora(g.creado_en, proyecto), persona: quien(g.perfil_id), leadId: g.lead_id, minutos: Math.round((g.duracion_seg ?? 0) / 60), texto: g.transcripcion })) };
  }
  if (a.fuente === "fathom") {
    let q = db().from("grabaciones").select("id, inicio, titulo, closer_id, cita_id, resumen, transcripcion").eq("proyecto_id", proyecto.id).not("transcripcion", "is", null);
    if (persona) q = q.eq("closer_id", persona);
    if (desde) q = q.gte("inicio", desde);
    const { data, error } = await q.order("inicio", { ascending: false }).limit(limite);
    if (error) throw new Error(error.message);
    return { fuente: "Llamadas de closers (Fathom)", total: data?.length ?? 0, llamadas: (data ?? []).map((g) => ({ id: g.id, fecha: g.inicio ? fechaHora(g.inicio, proyecto) : null, titulo: g.titulo, persona: quien(g.closer_id), citaId: g.cita_id, resumen: g.resumen, texto: texto(g.transcripcion) })) }; // Fathom no guarda el lead: va por la cita
  }
  let q = db().from("llamadas_ghl").select("id, fecha, duracion, perfil_id, lead_id, transcripcion").eq("proyecto_id", proyecto.id).not("transcripcion", "is", null);
  if (persona) q = q.eq("perfil_id", persona);
  if (desde) q = q.gte("fecha", desde);
  const { data, error } = await q.order("fecha", { ascending: false }).limit(limite);
  if (error) throw new Error(error.message);
  return { fuente: "Llamadas de GHL", total: data?.length ?? 0, llamadas: (data ?? []).map((g) => ({ id: g.id, fecha: g.fecha ? fechaHora(g.fecha, proyecto) : null, persona: quien(g.perfil_id), leadId: g.lead_id, minutos: Math.round((g.duracion ?? 0) / 60), texto: texto(g.transcripcion) })) };
}
