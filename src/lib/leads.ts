import "server-only";
import { db, equipo, escribir } from "@/lib/datos";
import type { Proyecto, Respuesta } from "@/lib/tipos";
import type { LeadEntrada } from "@/lib/csv";
import { enHorario, horarioValido } from "@/lib/horarios";
import { calcularOferta, normalizarRespuestas } from "@/lib/oferta";
import { anadirTarjetas } from "@/lib/tarjetas";
import { mismoNombre } from "@/lib/formato";
import { descifrar } from "@/lib/cifrado";
import { borrarCitaGhl, borrarContactoGhl, pipelinesAgendanGhl } from "@/lib/ghl";
import { conPais } from "@/lib/pais";
import { unirEtiquetas } from "@/lib/etiquetas";
import { ABIERTAS } from "@/lib/llamadas";
import { fechaHora } from "@/lib/formato";
import { guardarError } from "@/lib/errores-app";
import { avisarCloserAgenda } from "@/lib/aviso-closer";

// «+34 600-11-22-33», «34600112233» y «600 11 22 33» son el mismo teléfono: con 9 cifras o más
// se comparan las últimas 9 (así el prefijo del país no cuenta). Decisión de Cristian, 9 oct 2026 (V2-12).
export const telefonoClave = (t: string | null) => {
  const d = (t ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : d;
};
const telefonoValido = (t: string | null) => telefonoClave(t).length >= 6;
export { filaALead, type LeadEntrada } from "@/lib/csv";

// Reparto automático al entrar (bloque 2 de 1.0, Cristian 11 oct 2026): n leads entre los callers con % > 0, según su %.
// Con «solo a quien esté en su horario», entre los que lo están en ese momento; si no hay nadie, igual entre todos
// los que tienen %. Nunca a perfiles de prueba ni a quien no esté activo (equipo()). Apagado: no se reparte.
export async function repartoAutomatico(proyecto: Proyecto, n: number, ahora = new Date()): Promise<(string | null)[]> {
  if (!proyecto.reparto_auto || n === 0) return Array(n).fill(null);
  const callers = (await equipo(proyecto.id)).filter((p) => p.rol === "caller");
  if (!callers.length) return Array(n).fill(null);
  const { data: filas, error } = await db().from("miembros_proyecto").select("perfil_id, horario, reparto_pct").eq("proyecto_id", proyecto.id).in("perfil_id", callers.map((c) => c.id));
  if (error) throw new Error(`No se pudo leer el reparto: ${error.message}`);
  let candidatos = (filas ?? []).filter((f) => Number(f.reparto_pct) > 0);
  if (proyecto.reparto_solo_horario) {
    const enTurno = candidatos.filter((f) => enHorario(horarioValido(f.horario), ahora, proyecto.zona_horaria));
    if (enTurno.length) candidatos = enTurno;
  }
  if (!candidatos.length) return Array(n).fill(null);
  const { data: elegidos, error: e2 } = await db().rpc("repartir_por_pct", { p_proyecto: proyecto.id, p_n: n, p_candidatos: candidatos.map((c) => c.perfil_id) });
  if (e2) throw new Error(`No se pudo repartir: ${e2.message}`);
  const lista = (elegidos ?? []) as string[];
  return Array.from({ length: n }, (_, i) => lista[i] ?? null);
}

export async function primeraEtapa(pipelineId: string) {
  const { data } = await db().from("etapas").select("id").eq("pipeline_id", pipelineId).order("orden").limit(1).maybeSingle();
  return data?.id ?? null;
}

// Une respuestas sin perder ninguna: las nuevas sustituyen a la misma pregunta, el resto se queda. Las 6 de la
// Biblioteca se guardan con su nombre único, así se sustituyen aunque lleguen con otro nombre (bloque A).
export function unirRespuestas(antes: Respuesta[], nuevas: Respuesta[]) {
  const m = new Map(normalizarRespuestas(antes).map((r) => [r.pregunta.toLowerCase(), r]));
  for (const r of normalizarRespuestas(nuevas)) if (r.respuesta) m.set(r.pregunta.toLowerCase(), r);
  return [...m.values()];
}

type FilaClave = { id: string; ghl_contact_id: string | null; email: string | null; telefono: string | null };
function indexar(filas: FilaClave[], m = new Map<string, string>()) {
  for (const l of filas) {
    if (l.ghl_contact_id) m.set(`g:${l.ghl_contact_id}`, l.id);
    if (l.email) m.set(`e:${l.email.toLowerCase()}`, l.id);
    if (telefonoValido(l.telefono)) m.set(`t:${telefonoClave(l.telefono)}`, l.id);
  }
  return m;
}

// Arreglo 15: con pocos leads (webhook, landing, «nuevo cliente») se busca solo por sus claves, sin leer
// todos los del proyecto. Con un CSV grande se leen todos de una vez (más rápido que miles de búsquedas).
const POCOS = 50;
async function buscarExistentes(proyectoId: string, entradas: LeadEntrada[]) {
  const sel = "id, ghl_contact_id, email, telefono";
  if (entradas.length > POCOS) {
    const m = new Map<string, string>();
    for (let i = 0; ; i += 1000) {
      const { data, error } = await db().from("leads").select(sel).eq("proyecto_id", proyectoId).order("id").range(i, i + 999);
      if (error) throw new Error(error.message);
      indexar((data ?? []) as FilaClave[], m);
      if (!data || data.length < 1000) break;
    }
    return m;
  }
  const ghl = [...new Set(entradas.map((e) => e.ghl_contact_id).filter((x): x is string => !!x))];
  const emails = [...new Set(entradas.map((e) => e.email?.toLowerCase()).filter((x): x is string => !!x))];
  const tels = [...new Set(entradas.filter((e) => !e.email && telefonoValido(e.telefono)).map((e) => telefonoClave(e.telefono)))];
  const consultas = [
    ghl.length ? db().from("leads").select(sel).eq("proyecto_id", proyectoId).in("ghl_contact_id", ghl) : null,
    emails.length ? db().from("leads").select(sel).eq("proyecto_id", proyectoId).in("email", emails) : null,
    tels.length ? db().from("leads").select(sel).eq("proyecto_id", proyectoId).in("telefono_clave", tels) : null,
  ].filter((q) => q !== null);
  const res = await Promise.all(consultas);
  const m = new Map<string, string>();
  for (const r of res) {
    if (r.error) throw new Error(r.error.message);
    indexar((r.data ?? []) as FilaClave[], m);
  }
  return m;
}

// Fase 3 «Unir»: contacto de GHL de un lead que sobró → contacto del lead que se quedó (tabla ghl_contactos_unidos).
// Así la lectura de GHL no vuelve a crear el lead que sobra.
export async function contactosPrincipales(proyectoId: string, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  const m = new Map<string, string>();
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await db().from("ghl_contactos_unidos").select("contact_id, leads(ghl_contact_id)").eq("proyecto_id", proyectoId).in("contact_id", unicos.slice(i, i + 200));
    if (error) throw new Error(`No se pudo leer «ghl_contactos_unidos»: ${error.message}`);
    for (const f of (data ?? []) as { contact_id: string; leads: { ghl_contact_id: string | null } | null }[]) if (f.leads?.ghl_contact_id) m.set(f.contact_id, f.leads.ghl_contact_id);
  }
  return m;
}

// Inserta o actualiza leads (por Contact Id de GHL, por email o, si no hay email, por teléfono).
export async function guardarLeads(
  proyecto: Proyecto,
  entradas: LeadEntrada[],
  opciones: {
    pipelineId: string | null;
    etapaId?: string | null; // si no se da, la primera columna del pipeline
    origen: "csv" | "ghl";
    perfilId: string | null;
    repartir: boolean;
    notaActividad?: string;
  }
) {
  const etapaId = opciones.etapaId !== undefined && opciones.etapaId !== null ? opciones.etapaId : opciones.pipelineId ? await primeraEtapa(opciones.pipelineId) : null;

  // Fase 3: un contacto unido a otro lead entra en ese lead (y no le cambia su contacto de GHL)
  const principal = await contactosPrincipales(proyecto.id, entradas.map((e) => e.ghl_contact_id));
  if (principal.size) entradas = entradas.map((e) => (e.ghl_contact_id && principal.has(e.ghl_contact_id) ? { ...e, ghl_contact_id: principal.get(e.ghl_contact_id)! } : e));

  // Leads ya existentes del proyecto que pueden coincidir
  const existentes = await buscarExistentes(proyecto.id, entradas);

  const nuevos: LeadEntrada[] = [];
  const actualizar: { id: string; e: LeadEntrada }[] = [];
  const vistos = new Set<string>();
  let invalidos = 0;
  for (const e of entradas) {
    if (!e.email && !e.telefono && !e.ghl_contact_id) {
      invalidos++;
      continue;
    }
    const clave = e.ghl_contact_id ? `g:${e.ghl_contact_id}` : e.email ? `e:${e.email}` : `t:${telefonoClave(e.telefono)}`;
    if (vistos.has(clave)) continue; // duplicado dentro del mismo archivo
    vistos.add(clave);
    // El teléfono solo se usa para reconocer al lead cuando no trae email
    const id =
      (e.ghl_contact_id && existentes.get(`g:${e.ghl_contact_id}`)) ||
      (e.email && existentes.get(`e:${e.email}`)) ||
      (!e.email && telefonoValido(e.telefono) && existentes.get(`t:${telefonoClave(e.telefono)}`));
    if (id) actualizar.push({ id, e });
    else nuevos.push(e);
  }

  const turnos = opciones.repartir ? await repartoAutomatico(proyecto, nuevos.length) : [];
  const nombreCaller = new Map<string, string>();
  if (turnos.some(Boolean)) for (const p of await equipo(proyecto.id)) nombreCaller.set(p.id, p.nombre);

  let insertados = 0;
  for (let i = 0; i < nuevos.length; i += 500) {
    const lote = nuevos.slice(i, i + 500).map((e, j) => ({
      proyecto_id: proyecto.id,
      ghl_contact_id: e.ghl_contact_id,
      nombre: e.nombre,
      apellido: e.apellido,
      email: e.email,
      telefono: e.telefono,
      ...conPais(e.telefono),
      etiquetas: e.etiquetas,
      respuestas: normalizarRespuestas(e.respuestas),
      oferta: calcularOferta({ etiquetas: e.etiquetas, fuente: e.extra?.fuente, respuestas: e.respuestas }),
      origen: opciones.origen,
      pipeline_id: opciones.pipelineId,
      etapa_id: etapaId,
      caller_id: turnos[i + j] ?? null,
      ...(e.creado_en ? { creado_en: e.creado_en } : {}),
      ...(e.extra ? { fuente: e.extra.fuente, evento: e.extra.evento, seguimiento: e.extra.seguimiento, quiz_score: e.extra.quiz_score, datos: e.extra.datos } : {}),
    }));
    let { data, error } = await db().from("leads").insert(lote).select("id, caller_id");
    // Arreglo 16: si otro envío creó el mismo lead a la vez (email o contacto repetido), se insertan de uno
    // en uno y el que choca pasa a «actualizar» en vez de fallar todo el lote.
    if (error?.code === "23505") {
      data = [];
      error = null;
      for (const [k, fila] of lote.entries()) {
        const uno = await db().from("leads").insert(fila).select("id, caller_id").single();
        if (!uno.error) data.push(uno.data);
        else if (uno.error.code === "23505") {
          const e = nuevos[i + k];
          const ya = await buscarExistentes(proyecto.id, [e]);
          const id = (e.ghl_contact_id && ya.get(`g:${e.ghl_contact_id}`)) || (e.email && ya.get(`e:${e.email.toLowerCase()}`));
          if (!id) throw new Error(`Error guardando leads: ${uno.error.message}`);
          actualizar.push({ id, e });
        } else throw new Error(`Error guardando leads: ${uno.error.message}`);
      }
    }
    if (error || !data) throw new Error(`Error guardando leads: ${error?.message}`);
    insertados += data.length;
    await db()
      .from("actividades")
      .insert(
        data.map((d) => ({
          proyecto_id: proyecto.id,
          lead_id: d.id,
          perfil_id: opciones.perfilId,
          tipo: opciones.origen === "csv" ? "importacion" : "webhook",
          nota: opciones.notaActividad ?? (opciones.origen === "csv" ? "Importado desde CSV" : "Entró desde GHL"),
        }))
      );
    // Bloque 2: cada reparto automático queda en el historial del lead
    const repartidos = data.filter((d) => d.caller_id);
    if (repartidos.length) {
      const { error: errHist } = await db().from("actividades").insert(repartidos.map((d) => ({ proyecto_id: proyecto.id, lead_id: d.id, perfil_id: null, tipo: "asignacion", nota: `Caller: ${nombreCaller.get(d.caller_id as string) ?? "—"} · reparto automático (%)` })));
      if (errHist) console.error("[actividad] no se pudo guardar el reparto:", errHist.message);
    }
  }

  // Actualiza los que ya existían SIN perder nada (no toca su pipeline principal ni la asignación):
  // etiquetas y respuestas se suman; el origen (fuente, evento, UTM) se queda el primero.
  // Fase 4 (Cristian, 12 oct): si entra por otro pipeline, gana una tarjeta en ese pipeline (como GHL).
  // Lectura por tandas de 500 y escrituras de 20 en 20 (antes, 2-3 viajes seguidos por lead: un CSV grande
  // pasaba del tiempo máximo del servidor y la subida se quedaba en «Importando…»).
  let cambianOferta = 0;
  type Antes = { id: string; etiquetas: string[] | null; respuestas: Respuesta[] | null; fuente: string | null; evento: string | null; seguimiento: Record<string, string> | null; quiz_score: number | null; datos: Record<string, unknown> | null; email: string | null; oferta: string | null; pipeline_id: string | null };
  const previos = new Map<string, Antes>();
  for (let i = 0; i < actualizar.length; i += 500) {
    const { data, error } = await db()
      .from("leads")
      .select("id, etiquetas, respuestas, fuente, evento, seguimiento, quiz_score, datos, email, oferta, pipeline_id")
      .in("id", actualizar.slice(i, i + 500).map((a) => a.id));
    if (error) throw new Error(`Error leyendo leads: ${error.message}`);
    for (const d of (data ?? []) as Antes[]) previos.set(d.id, d);
  }
  const historial: { proyecto_id: string; lead_id: string; perfil_id: string | null; tipo: string; nota: string }[] = [];
  const tarjetasNuevas: { lead_id: string; pipeline_id: string; etapa_id: string | null }[] = [];
  const cambiosPorLead = actualizar.map(({ id, e }) => {
    const antes = previos.get(id);
    // 6 nov (plan GHL): sin repetir mayúsculas/minúsculas y sin volver de -completo a -incompleto
    const etiquetas = unirEtiquetas(antes?.etiquetas, e.etiquetas);
    const respuestas = unirRespuestas(antes?.respuestas ?? [], e.respuestas);
    // Bloque A: la oferta se recalcula con los datos nuevos
    const oferta = calcularOferta({ etiquetas, fuente: antes?.fuente || e.extra?.fuente, respuestas });
    if (oferta !== (antes?.oferta ?? null)) cambianOferta++;
    const cambios: Record<string, unknown> = { etiquetas, respuestas, oferta };
    if (e.telefono) Object.assign(cambios, { telefono: e.telefono, ...conPais(e.telefono) });
    if (e.email && !antes?.email) cambios.email = e.email;
    if (e.nombre) cambios.nombre = e.nombre;
    if (e.apellido) cambios.apellido = e.apellido;
    if (e.ghl_contact_id) cambios.ghl_contact_id = e.ghl_contact_id;
    if (opciones.pipelineId) {
      if (!antes?.pipeline_id) Object.assign(cambios, { pipeline_id: opciones.pipelineId, etapa_id: etapaId });
      else if (antes.pipeline_id !== opciones.pipelineId) tarjetasNuevas.push({ lead_id: id, pipeline_id: opciones.pipelineId, etapa_id: etapaId });
    }
    if (e.extra) {
      if (!antes?.fuente && e.extra.fuente) cambios.fuente = e.extra.fuente;
      if (!antes?.evento && e.extra.evento) cambios.evento = e.extra.evento;
      if (antes?.quiz_score == null && e.extra.quiz_score != null) cambios.quiz_score = e.extra.quiz_score;
      cambios.seguimiento = { ...e.extra.seguimiento, ...(antes?.seguimiento ?? {}) };
      cambios.datos = { ...(antes?.datos ?? {}), ...e.extra.datos };
      const otraVez = [e.extra.evento && e.extra.evento !== antes?.evento ? `evento «${e.extra.evento}»` : "", e.extra.fuente && e.extra.fuente !== antes?.fuente ? `fuente «${e.extra.fuente}»` : ""].filter(Boolean);
      historial.push({ proyecto_id: proyecto.id, lead_id: id, perfil_id: opciones.perfilId, tipo: "webhook", nota: `${opciones.notaActividad ?? "Volvió a entrar"}${otraVez.length ? ` · ${otraVez.join(" · ")}` : ""}` });
    }
    return { id, cambios };
  });
  for (let i = 0; i < cambiosPorLead.length; i += 20) {
    await Promise.all(cambiosPorLead.slice(i, i + 20).map(({ id, cambios }) => escribir(db().from("leads").update(cambios).eq("id", id), "leads")));
  }
  for (let i = 0; i < historial.length; i += 500) {
    const { error } = await db().from("actividades").insert(historial.slice(i, i + 500));
    if (error) console.error("[actividad] no se pudo guardar el historial:", error.message);
  }
  const tarjetas = await anadirTarjetas(proyecto.id, tarjetasNuevas);

  return { insertados, actualizados: actualizar.length, invalidos, repartidos: turnos.filter(Boolean).length, cambianOferta, tarjetas };
}

// 4.4 (Cristian, 11 oct): datos de una cita que llega de GHL. La agenda (KPIs, Ranking y comisión) es de quien marcó
// «Link enviado»; si nadie lo marcó, del caller del lead; sin caller, de nadie. Las estrellas son las que puso el
// caller al enviar el link.
// Decisión de Cristian (12 oct 2026): todo lead con una cita que llega de GHL (webhook o sincronización) pasa al
// pipeline «Orgánico», columna «Agendados». Fase 4: la columna se guarda en el proyecto (`etapa_citas_ghl`, se elige
// en el «⋯» de la columna), así no depende del nombre. Sin ese dato (base aún sin la migración), se busca por nombre.
// 13 oct (Cristian): cada workflow de cita de GHL dice a qué pipeline va («pipeline» en Custom Data: «0. Agendas YT»,
// «0. Agendas IG»…); la cita va a su columna «Agendan». Sin ese dato, o si no existe, a la columna de siempre.
export async function columnaCitasGhl(proyectoId: string, pipelineNombre?: string | null): Promise<{ pipeline_id: string; id: string } | null> {
  if (pipelineNombre?.trim()) {
    const { data: pipes } = await db().from("pipelines").select("id, nombre, etapas(id, nombre)").eq("proyecto_id", proyectoId).eq("tipo", "normal");
    const pipe = (pipes ?? []).find((p) => mismoNombre(p.nombre, pipelineNombre));
    const etapa = ((pipe?.etapas ?? []) as { id: string; nombre: string }[]).find((x) => mismoNombre(x.nombre, "Agendan"));
    if (pipe && etapa) return { pipeline_id: pipe.id, id: etapa.id };
  }
  const { data: proy } = await db().from("proyectos").select("*").eq("id", proyectoId).maybeSingle();
  // La elegida en el «⋯»; si no hay ninguna elegida (o la base no tiene el campo), «Orgánico → Agendados» por nombre
  if (proy?.etapa_citas_ghl) {
    const { data } = await db().from("etapas").select("id, pipeline_id").eq("id", proy.etapa_citas_ghl).maybeSingle();
    if (data) return data;
  }
  const { data: pipes } = await db().from("pipelines").select("id, nombre, etapas(id, nombre)").eq("proyecto_id", proyectoId).eq("tipo", "normal");
  return columnaCitasPorNombre((pipes ?? []) as PipelineConEtapas[]);
}

// La columna de las citas por nombre, de los pipelines «normal» del proyecto con sus columnas (sin consultar nada:
// la usa también el CRM con lo que ya ha cargado; velocidad, 17 oct 2026)
// 17 oct (Cristian): un solo pipeline de agendas, «0. Agendas General → Agendan»; se siguen aceptando los de antes
type PipelineConEtapas = { id: string; nombre: string; etapas: { id: string; nombre: string }[] };
export function columnaCitasPorNombre(pipes: PipelineConEtapas[]): { pipeline_id: string; id: string } | null {
  const pipe = pipes.find((p) => mismoNombre(p.nombre, "Agendas General")) ?? pipes.find((p) => mismoNombre(p.nombre, "Agendas orgánico") || mismoNombre(p.nombre, "Orgánico"));
  const etapa = (pipe?.etapas ?? []).find((x) => mismoNombre(x.nombre, "Agendan") || mismoNombre(x.nombre, "Agendados"));
  return pipe && etapa ? { pipeline_id: pipe.id, id: etapa.id } : null;
}

// Fase 4 (criterio de Claude, 12 oct): con varios pipelines, el lead no sale del suyo (p. ej. Biblioteca): gana su
// tarjeta en esa columna. Si ese ya es su pipeline principal (o no tiene), se mueve como siempre.
// La cita no dice su pipeline (sincronización, o workflow sin el campo): se pregunta a GHL en qué pipeline tiene el
// contacto su oportunidad en «Agendan» y vale si ese pipeline existe en la app con su «Agendan». Nunca rompe la cita:
// si GHL falla o no hay, `null` y va a la columna de siempre.
export async function pipelineCitaGhl(proyecto: { id: string; ghl_token?: string | null; ghl_location_id?: string | null }, contactId: string | null | undefined, fetchImpl?: typeof fetch): Promise<string | null> {
  if (!contactId || !proyecto.ghl_token || !proyecto.ghl_location_id) return null;
  try {
    const nombres = await pipelinesAgendanGhl({ token: descifrar(proyecto.ghl_token, "el token de GHL"), locationId: proyecto.ghl_location_id, contactId, fetchImpl });
    for (const n of nombres) {
      const c = await columnaCitasGhl(proyecto.id, n);
      const { data } = c ? await db().from("pipelines").select("nombre").eq("id", c.pipeline_id).maybeSingle() : { data: null };
      if (data && mismoNombre(data.nombre, n)) return n;
    }
  } catch (e) {
    console.error("[citas] no se pudo leer el pipeline en GHL:", e instanceof Error ? e.message : e);
  }
  return null;
}

export async function moverAAgendadosOrganico(proyectoId: string, leadId: string, pipelineNombre?: string | null) {
  const destino = await columnaCitasGhl(proyectoId, pipelineNombre);
  if (!destino) return;
  const { data: lead } = await db().from("leads").select("pipeline_id").eq("id", leadId).maybeSingle();
  if (!lead?.pipeline_id || lead.pipeline_id === destino.pipeline_id) {
    await escribir(db().from("leads").update({ pipeline_id: destino.pipeline_id, etapa_id: destino.id }).eq("id", leadId), "leads");
    return;
  }
  const creadas = await anadirTarjetas(proyectoId, [{ lead_id: leadId, pipeline_id: destino.pipeline_id, etapa_id: destino.id }]);
  if (!creadas) {
    const { error } = await db().from("tarjetas_extra").update({ etapa_id: destino.id }).eq("lead_id", leadId).eq("pipeline_id", destino.pipeline_id);
    // Sin la tabla (migración sin aplicar): como antes, se mueve el lead
    if (error) await escribir(db().from("leads").update({ pipeline_id: destino.pipeline_id, etapa_id: destino.id }).eq("id", leadId), "leads");
  }
}

// Workflows, «Mover en el dashboard» en modo real (Cristian, 7 nov 2026): lleva el lead a una columna de un pipeline del
// proyecto (sin columna = la primera). Como moverAAgendadosOrganico: si el lead está en ese pipeline (o en ninguno), se
// mueve el lead; si está en otro, se mueve (o se crea) su tarjeta 🔗 en ese pipeline.
export async function moverLeadDashboard(proyectoId: string, leadId: string, pipelineId: string, etapaId: string | null) {
  const { data: p } = await db().from("pipelines").select("id, etapas(id, orden)").eq("id", pipelineId).eq("proyecto_id", proyectoId).maybeSingle();
  if (!p) throw new Error("Mover en el dashboard: ese pipeline no es de este proyecto");
  const etapas = ((p.etapas ?? []) as { id: string; orden: number }[]).sort((a, b) => a.orden - b.orden);
  const destino = etapaId ? etapas.find((e) => e.id === etapaId) : etapas[0];
  if (!destino) throw new Error("Mover en el dashboard: esa columna no es de ese pipeline");
  const { data: lead } = await db().from("leads").select("pipeline_id").eq("id", leadId).eq("proyecto_id", proyectoId).maybeSingle();
  if (!lead) throw new Error("Mover en el dashboard: no se encontró el lead");
  if (!lead.pipeline_id || lead.pipeline_id === pipelineId) {
    await escribir(db().from("leads").update({ pipeline_id: pipelineId, etapa_id: destino.id }).eq("id", leadId), "leads");
    return;
  }
  const creadas = await anadirTarjetas(proyectoId, [{ lead_id: leadId, pipeline_id: pipelineId, etapa_id: destino.id }]);
  if (!creadas) await escribir(db().from("tarjetas_extra").update({ etapa_id: destino.id }).eq("lead_id", leadId).eq("pipeline_id", pipelineId), "tarjetas_extra");
}

export async function datosAgendaGhl(leadId: string, canal: string | null): Promise<{ agendada_por: string | null; estrellas_caller: number | null }> {
  // C11 (Cristian, 7 nov, punto 10): la agenda de GHL es del caller del lead (ya no de quien mandó el link)
  // Fase 3 (Cristian, 13 nov): y solo si entró por el link de callers (utm_source=callers); si no, de nadie
  const { data } = await db().from("leads").select("caller_id, estrellas_caller").eq("id", leadId).maybeSingle();
  return { agendada_por: canal === "callers" ? data?.caller_id ?? null : null, estrellas_caller: data?.estrellas_caller ?? null };
}

// Fase 3 (Cristian, 13 nov): una sola agenda por lead, «manda la última». Si el lead ya tiene una cita abierta, esa
// fila se queda (con su creado_en: cuenta 1 agenda) con la hora, el closer y el evento de GHL de la que entra; el
// crédito, el de la nueva si lo tiene. En GHL queda un solo evento: el viejo se borra. null = no había abierta (se
// crea como siempre). `error` es el de la base (p. ej. citas_closer_hora_unica), para que quien llama lo trate igual
// que el de un insert. Avisa al closer si cambian hora o closer y la cita es futura.
export const CAMPOS_CITA = "id, ghl_cita_id, estado, fecha, closer_id, canal, ghl_calendario, creado_en, lead_id, agendada_por";
export type CitaEntrante = { fecha: string; closerId: string | null; ghlCitaId: string | null; origen: "manual" | "ghl"; agendadaPor: string | null; extra?: Record<string, unknown> };
export async function juntarConCitaAbierta(proyectoId: string, leadId: string, e: CitaEntrante, o: { perfilId?: string | null; ahora?: Date; sinAviso?: boolean; noRepetir?: boolean } = {}) {
  const { data: vieja, error: errLeer } = await db().from("citas").select("id, fecha, closer_id, agendada_por, ghl_cita_id").eq("proyecto_id", proyectoId).eq("lead_id", leadId).in("estado", [...ABIERTAS]).order("fecha", { ascending: false }).limit(1).maybeSingle();
  if (errLeer) throw new Error(`No se pudo leer «citas»: ${errLeer.message}`);
  if (!vieja) return null;
  const closerId = e.closerId ?? vieja.closer_id;
  // Agendar a mano: la misma cita otra vez (doble clic) da el aviso de siempre, sin tocar GHL
  if (o.noRepetir && closerId === vieja.closer_id && new Date(e.fecha).getTime() === new Date(vieja.fecha).getTime()) return { data: null, error: { code: "23505", message: "citas_app_unica: misma cita" }, ghlViejo: null };
  const { data, error } = await db()
    .from("citas")
    .update({ ...e.extra, fecha: e.fecha, closer_id: closerId, ghl_cita_id: e.ghlCitaId, origen: e.origen, agendada_por: e.agendadaPor ?? vieja.agendada_por })
    .eq("id", vieja.id)
    .in("estado", [...ABIERTAS]) // una que se cerró mientras tanto no se toca
    .select(CAMPOS_CITA)
    .single();
  if (error || !data) return { data: null, error: error ?? { code: "", message: "la cita acaba de cambiar" }, ghlViejo: null };

  const { data: proy } = await db().from("proyectos").select("zona_horaria, ghl_token").eq("id", proyectoId).single();
  const ghlViejo = vieja.ghl_cita_id && vieja.ghl_cita_id !== e.ghlCitaId ? (vieja.ghl_cita_id as string) : null;
  let notaGhl = "";
  if (ghlViejo) {
    try {
      if (!proy?.ghl_token) throw new Error("el proyecto no tiene GHL conectado");
      await borrarCitaGhl({ token: descifrar(proy.ghl_token, "el token de GHL"), citaId: ghlViejo });
    } catch (err) {
      // Si se queda en GHL, la lectura la traería otra vez: que se vea en el historial y en los avisos del CEO
      const msg = err instanceof Error ? err.message : String(err);
      notaGhl = ` · no se pudo borrar en GHL la cita vieja (bórrala a mano): ${msg.slice(0, 150)}`;
      await guardarError("juntar citas: borrar la vieja en GHL", msg, proyectoId);
    }
  }
  const antes = proy ? fechaHora(vieja.fecha, proy) : vieja.fecha;
  const { error: errHist } = await db().from("actividades").insert({ proyecto_id: proyectoId, lead_id: leadId, perfil_id: o.perfilId ?? null, tipo: "cita", resultado: "juntada", nota: `Agenda juntada con la que ya tenía (era el ${antes}): queda una sola con la hora nueva${notaGhl}` });
  if (errHist) console.error("[actividad] no se pudo guardar la cita juntada:", errHist.message);

  const cambia = closerId !== vieja.closer_id || new Date(e.fecha).getTime() !== new Date(vieja.fecha).getTime();
  if (!o.sinAviso && closerId && cambia && new Date(e.fecha).getTime() > (o.ahora ?? new Date()).getTime()) await avisarCloserAgenda({ proyectoId, closerId, citaId: vieja.id, motivo: "cambio" });
  return { data, error: null, ghlViejo };
}

// Fase 3 (Cristian, 13 nov): tras «Unir» en la app, GHL queda igual. La API v2 de GHL no tiene «unir contactos»
// (apps/contacts.json, comprobado el 14 nov): se borran allí los eventos de las citas que se juntaron y el contacto que
// sobra. Las etiquetas del que sobra NO se copian al principal: en GHL, poner una etiqueta puede lanzar workflows
// (emails y SMS) a la persona otra vez; la app ya las tiene juntas. Si GHL falla, la unión de la app no se deshace:
// queda en el historial del lead y en los avisos del CEO, con el id para hacerlo a mano. Devuelve lo que falló.
export type UnionLeads = { ghl_sobra: string | null; ghl_citas_sobran: string[]; citas_juntadas: number; cita_en_sobra: boolean };
export async function igualarGhlTrasUnir(proyectoId: string, leadId: string, u: UnionLeads, perfilId: string | null = null): Promise<string[]> {
  const fallos: string[] = [];
  const hecho: string[] = [];
  if (u.citas_juntadas) hecho.push("agendas juntadas: queda una sola, con la hora y el closer de la última");
  if (u.ghl_sobra || u.ghl_citas_sobran.length) {
    let token: string | null = null;
    try {
      const { data: proy, error } = await db().from("proyectos").select("ghl_token").eq("id", proyectoId).single();
      if (error) throw new Error(error.message);
      if (!proy?.ghl_token) throw new Error("el proyecto no tiene GHL conectado");
      token = descifrar(proy.ghl_token, "el token de GHL");
    } catch (e) {
      fallos.push(`no se pudo conectar con GHL (${e instanceof Error ? e.message : String(e)})`);
    }
    for (const citaId of u.ghl_citas_sobran) {
      if (!token) {
        fallos.push(`borra a mano en GHL la cita ${citaId}`);
        continue;
      }
      try {
        await borrarCitaGhl({ token, citaId });
        hecho.push(`cita ${citaId} borrada en GHL`);
      } catch (e) {
        fallos.push(`no se pudo borrar en GHL la cita ${citaId} (bórrala a mano): ${(e instanceof Error ? e.message : String(e)).slice(0, 150)}`);
      }
    }
    if (u.ghl_sobra) {
      // La cita que queda es un evento de ese contacto y GHL no deja pasarlo a otro: borrarlo podría llevársela
      if (u.cita_en_sobra) fallos.push(`el contacto ${u.ghl_sobra} tiene la cita que se queda y GHL no deja pasarla a otro contacto: únelo a mano en GHL`);
      else if (!token) fallos.push(`une o borra a mano en GHL el contacto ${u.ghl_sobra}`);
      else {
        try {
          await borrarContactoGhl({ token, contactId: u.ghl_sobra });
          hecho.push(`contacto ${u.ghl_sobra} borrado en GHL`);
        } catch (e) {
          fallos.push(`no se pudo borrar en GHL el contacto ${u.ghl_sobra} (únelo o bórralo a mano): ${(e instanceof Error ? e.message : String(e)).slice(0, 150)}`);
        }
      }
    }
  }
  const nota = ["Unido con un lead duplicado", ...hecho, ...fallos.map((f) => `GHL: ${f}`)].join(" · ");
  const { error: errHist } = await db().from("actividades").insert({ proyecto_id: proyectoId, lead_id: leadId, perfil_id: perfilId, tipo: "nota", nota });
  if (errHist) console.error("[actividad] no se pudo guardar la unión:", errHist.message);
  if (fallos.length) await guardarError("unir leads: GHL", fallos.join(" · "), proyectoId);
  return fallos;
}
