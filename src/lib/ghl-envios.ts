import "server-only";
// Plan GHL, fase 1 (Cristian, 6 nov 2026): el envío a GHL de los leads de las Entradas, en la lectura de cada 60 s
// (/api/ghl/leer). La Entrada guarda el lead al momento y deja su envío «esperando» con su hora (ahora + espera).
// Aquí, de uno en uno por lead: se juntan TODOS sus envíos a esa Entrada → upsert del contacto (sin tags) → etiqueta
// final → se quita `-incompleto` si ya está completo → oportunidad (si la Entrada tiene pipeline de GHL) → el lead
// guarda su ghl_contact_id y la misma etiqueta → «ok». Si falla: hasta 5 intentos (uno por lectura); después
// «error», aviso en rojo en Administración → Entradas (con «Reintentar») y email a Cristian.
// Plan GHL, B y C (Cristian, 7 nov 2026): una oportunidad por cada pipeline de `ghl_oportunidades` (sin columna = la
// primera, leída con GET /opportunities/pipelines, y la que ya existe no se mueve); etiquetas fijas
// (`ghl_etiquetas_extra`). Si el contacto de GHL ya es de otro lead del proyecto (mismo teléfono, otro email: GHL los
// une, el dashboard no), el envío queda «ok», este lead no guarda el id y su historial lo apunta.
import { db } from "@/lib/datos";
import { armarEnvioGhl, etiquetasApp, type EnvioGhl } from "@/lib/entrada-ghl";
import { anadirEtiquetasGhl, crearOActualizarContactoGhl, crearOportunidadGhl, oportunidadesContactoGhl, pipelinesGhl, primeraColumnaGhl, quitarEtiquetasGhl, type OportunidadGhl2, type PipelineGhl } from "@/lib/ghl";

// Mejora «menos llamadas a GHL» (Cristian, 7 nov 2026): lo que se lee de GHL una sola vez por vuelta (cada lectura de
// 60 s), para todos sus leads. Hoy: las columnas de los pipelines. Si la lectura falla, se borra y el siguiente lo reintenta.
export type CacheGhl = { pipelines?: Promise<PipelineGhl[]> };
function columnasGhl(cache: CacheGhl | undefined, o: { token: string; locationId: string; fetchImpl?: Fetch }) {
  if (!cache) return pipelinesGhl(o);
  cache.pipelines ??= pipelinesGhl(o).catch((e) => {
    delete cache.pipelines;
    throw e;
  });
  return cache.pipelines;
}
import { enviarEmail, urlApp } from "@/lib/email";

type Fetch = typeof fetch;
type Json = Record<string, unknown>;

export const MAX_INTENTOS = 5;
export const EMAIL_AVISO_GHL = "info@eternity.llc"; // Cristian, 6 nov 2026
// Con 2 pipelines sin columna: upsert, etiquetas, quitar, pipelines y 2 × (buscar + crear) = hasta 8 llamadas por lead.
// 10 leads = 80 llamadas, por debajo del límite de GHL (100 cada 10 s). Antes 15 leads × 4 llamadas.
const MAX_LEADS_POR_LECTURA = 10;
// Reintentos cada 1 min de verdad (Cristian, 7 nov 2026): la lectura va cada 30 s y la del minuto puede llegar un pelo
// antes; con +60 s se iba a la siguiente (1,5-2 min). Con +50 s la coge la lectura del minuto
const REINTENTAR_EN = 50_000;

export type EntradaGhl = {
  id: string;
  nombre: string;
  ghl_activo: boolean;
  ghl_campos: Record<string, string> | null;
  ghl_pipeline_id: string | null;
  ghl_etapa_id: string | null;
  ghl_etiqueta_base: string | null;
  ghl_campo_completo: string | null;
  ghl_oportunidades: { pipeline_id: string; etapa_id: string | null }[] | null;
  ghl_etiquetas_extra: string[] | null;
};
type Evento = { id: string; entrada_id: string | null; lead_id: string | null; ghl_intentos: number | null };
export type ResultadoEnvios = { enviados: number; reintentos: number; errores: string[] };
export type Avisar = (o: { entrada: string; lead: string; error: string }) => Promise<unknown>;

// Email a Cristian cuando un lead no llega a GHL tras los 5 intentos
export const avisarPorEmail: Avisar = ({ entrada, lead, error }) =>
  enviarEmail({
    para: [EMAIL_AVISO_GHL],
    asunto: `GHL: un lead de «${entrada}» no ha llegado`,
    texto: `El lead ${lead} de la Entrada «${entrada}» no se pudo mandar a GHL tras ${MAX_INTENTOS} intentos.\n\nMotivo: ${error}\n\nEn ${urlApp()}/admin?tab=entradas está en rojo con el botón «Reintentar».`,
  }).then((r) => {
    if (!r.enviado) console.error("[ghl-envios] no se pudo mandar el email de aviso:", r.motivo);
  });

export async function enviarPendientesGhl(
  proyecto: { id: string; ghl_location_id: string | null },
  token: string,
  opciones: { fetchImpl?: Fetch; ahora?: Date; avisar?: Avisar } = {}
): Promise<ResultadoEnvios> {
  const ahora = opciones.ahora ?? new Date();
  const avisar = opciones.avisar ?? avisarPorEmail;
  const r: ResultadoEnvios = { enviados: 0, reintentos: 0, errores: [] };
  if (!proyecto.ghl_location_id) return r;

  // 1 · Los envíos cuya hora ya llegó, los más antiguos primero, agrupados por Entrada y lead
  const { data: filas, error } = await db()
    .from("webhook_eventos")
    .select("id, entrada_id, lead_id, ghl_intentos")
    .eq("proyecto_id", proyecto.id)
    .eq("ghl_estado", "esperando")
    .lte("ghl_enviar_en", ahora.toISOString())
    .order("ghl_enviar_en")
    .limit(100);
  if (error) throw new Error(`No se pudieron leer los envíos a GHL: ${error.message}`);
  const grupos = new Map<string, Evento[]>();
  for (const ev of (filas ?? []) as Evento[]) {
    const k = `${ev.entrada_id}|${ev.lead_id}`;
    grupos.set(k, [...(grupos.get(k) ?? []), ev]);
  }
  if (!grupos.size) return r;

  const ids = [...new Set([...grupos.values()].map((g) => g[0].entrada_id).filter((x): x is string => !!x))];
  const { data: ent, error: errEnt } = ids.length ? await db().from("entradas").select("id, nombre, ghl_activo, ghl_campos, ghl_pipeline_id, ghl_etapa_id, ghl_etiqueta_base, ghl_campo_completo, ghl_oportunidades, ghl_etiquetas_extra").in("id", ids) : { data: [], error: null };
  if (errEnt) throw new Error(`No se pudieron leer las Entradas: ${errEnt.message}`);
  const entradas = new Map(((ent ?? []) as EntradaGhl[]).map((x) => [x.id, x]));

  // 2 · De uno en uno por lead (las columnas de GHL, una vez para todos)
  const cache: CacheGhl = {};
  for (const grupo of [...grupos.values()].slice(0, MAX_LEADS_POR_LECTURA)) {
    const { entrada_id, lead_id } = grupo[0];
    const entrada = entrada_id ? entradas.get(entrada_id) : undefined;
    if (!entrada?.ghl_activo || !lead_id) {
      // Interruptor apagado (o sin lead): no se manda; queda apuntado, sin email
      await marcar(grupo.map((x) => x.id), { ghl_estado: "error", ghl_error: !lead_id ? "El envío no tiene lead" : "La Entrada ya no manda a GHL (interruptor apagado)" });
      continue;
    }
    try {
      await enviarLead(proyecto.id, proyecto.ghl_location_id, token, entrada, lead_id, opciones.fetchImpl, cache);
      // Todos sus envíos a esta Entrada que esperaban (también los que aún no tocaban) han ido en este envío
      const { error: errOk } = await db()
        .from("webhook_eventos")
        .update({ ghl_estado: "ok", ghl_error: null })
        .eq("entrada_id", entrada.id)
        .eq("lead_id", lead_id)
        .eq("ghl_estado", "esperando");
      if (errOk) throw new Error(`No se pudo marcar el envío como hecho: ${errOk.message}`);
      r.enviados++;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      const intentos = Math.max(...grupo.map((x) => x.ghl_intentos ?? 0)) + 1;
      const final = intentos >= MAX_INTENTOS;
      await marcar(grupo.map((x) => x.id), final ? { ghl_estado: "error", ghl_intentos: intentos, ghl_error: msg } : { ghl_intentos: intentos, ghl_error: msg, ghl_enviar_en: new Date(ahora.getTime() + REINTENTAR_EN).toISOString() });
      r.errores.push(`${entrada.nombre} · lead ${lead_id}: ${msg}`);
      if (final) {
        const { data: l } = await db().from("leads").select("email, telefono, nombre").eq("id", lead_id).maybeSingle();
        await avisar({ entrada: entrada.nombre, lead: l?.email || l?.telefono || l?.nombre || lead_id, error: msg }).catch((x) => console.error("[ghl-envios] aviso:", x));
      } else r.reintentos++;
    }
  }
  return r;
}

async function marcar(ids: string[], cambios: Json) {
  const { error } = await db().from("webhook_eventos").update(cambios).in("id", ids);
  if (error) console.error("[ghl-envios] no se pudo apuntar el estado:", error.message);
}

async function enviarLead(proyectoId: string, locationId: string, token: string, entrada: EntradaGhl, leadId: string, fetchImpl?: Fetch, cache?: CacheGhl) {
  // Todos los envíos del lead a esta Entrada, en orden de llegada (registro, cuestionario, uno tardío…)
  const { data: evs, error } = await db().from("webhook_eventos").select("payload").eq("entrada_id", entrada.id).eq("lead_id", leadId).eq("procesado", true).order("recibido_en");
  if (error) throw new Error(`No se pudieron leer los envíos del lead: ${error.message}`);
  const envio = armarEnvioGhl(
    (evs ?? []).map((x) => (x.payload ?? {}) as Json),
    {
      campos: entrada.ghl_campos ?? {},
      pipelineId: entrada.ghl_pipeline_id,
      etapaId: entrada.ghl_etapa_id,
      oportunidades: Array.isArray(entrada.ghl_oportunidades) ? entrada.ghl_oportunidades : [],
      etiquetaBase: entrada.ghl_etiqueta_base,
      etiquetasExtra: Array.isArray(entrada.ghl_etiquetas_extra) ? entrada.ghl_etiquetas_extra : [],
      campoCompleto: entrada.ghl_campo_completo ?? "",
    }
  );
  await mandarEnvioGhl({ proyectoId, locationId, token, envio, leadId, fetchImpl, cache });
}

// Lo que se hace en GHL con un envío ya calculado (hoy, desde la Entrada; desde la 4a-2, también desde un workflow en
// modo real): contacto → etiquetas → quitar → oportunidades → el lead guarda su contacto de GHL y sus etiquetas.
// `quitarExtra`: etiquetas que un paso «Quitar etiqueta» del workflow quita además de `-incompleto`.
export async function mandarEnvioGhl(o: { proyectoId: string; locationId: string; token: string; envio: EnvioGhl; leadId: string; quitarExtra?: string[]; fetchImpl?: Fetch; cache?: CacheGhl }) {
  const { proyectoId, locationId, token, envio, leadId, fetchImpl } = o;
  if (!envio.contacto.email && !envio.contacto.phone) throw new Error("El lead no tiene email ni teléfono para GHL");

  const c = await crearOActualizarContactoGhl({ token, locationId, contacto: envio.contacto, customFields: envio.customFields, fetchImpl });
  if (envio.etiquetas.length) await anadirEtiquetasGhl({ token, contactId: c.id, etiquetas: envio.etiquetas, fetchImpl });
  // Solo si la tiene (o si GHL no dijo cuáles tiene): así no se gasta una llamada en cada lead completo
  const q = envio.quitar?.toLowerCase();
  if (envio.quitar && (!c.etiquetas || c.etiquetas.some((t) => t.toLowerCase() === q))) await quitarEtiquetasGhl({ token, contactId: c.id, etiquetas: [envio.quitar], fetchImpl });
  const extra = [...new Set((o.quitarExtra ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (extra.length) await quitarEtiquetasGhl({ token, contactId: c.id, etiquetas: extra, fetchImpl });
  // Sin columna fijada: la primera de GHL (columnas leídas una vez por vuelta) y la que ya existe no se mueve
  const sinColumna = envio.oportunidades.some((o) => !o.etapaId);
  const pipelines = sinColumna ? await columnasGhl(o.cache, { token, locationId, fetchImpl }) : [];
  // Con 2 o más pipelines, sus oportunidades se buscan UNA vez (antes, una búsqueda por pipeline). Con 1, la búsqueda
  // de siempre (filtrada por pipeline): cuesta lo mismo
  const existentes: OportunidadGhl2[] | undefined = envio.oportunidades.length > 1 ? await oportunidadesContactoGhl({ token, locationId, contactId: c.id, fetchImpl }) : undefined;
  for (const op of envio.oportunidades) {
    const etapaId = op.etapaId ?? primeraColumnaGhl(pipelines, op.pipelineId);
    if (!etapaId) throw new Error(`El pipeline ${op.pipelineId} no está en GHL o no tiene columnas`);
    await crearOportunidadGhl({ token, locationId, contactId: c.id, pipelineId: op.pipelineId, etapaId, nombre: op.nombre, mover: !!op.etapaId, existentes, fetchImpl });
  }

  // El lead del dashboard: su contacto de GHL (así la lectura de 60 s lo reconoce) y la misma etiqueta que en GHL
  const { data: lead, error: errLead } = await db().from("leads").select("ghl_contact_id, etiquetas").eq("id", leadId).eq("proyecto_id", proyectoId).maybeSingle();
  if (errLead || !lead) throw new Error(`No se encontró el lead en el dashboard${errLead ? `: ${errLead.message}` : ""}`);
  const cambios: Json = { etiquetas: etiquetasApp(lead.etiquetas, envio) };
  // C: si ese contacto de GHL ya es de otro lead del proyecto, este no lo guarda (chocaría con
  // leads_proyecto_id_ghl_contact_id_key) y se apunta en su historial. Los dos leads se quedan (Cristian, 7 nov).
  let otro: { id: string; email: string | null; telefono: string | null } | null = null;
  if (!lead.ghl_contact_id) {
    const { data: ya, error: errYa } = await db().from("leads").select("id, email, telefono").eq("proyecto_id", proyectoId).eq("ghl_contact_id", c.id).neq("id", leadId).limit(1).maybeSingle();
    if (errYa) throw new Error(`No se pudo comprobar el contacto de GHL en el dashboard: ${errYa.message}`);
    otro = ya;
    if (!otro) cambios.ghl_contact_id = c.id;
  }
  const { error: errUp } = await db().from("leads").update(cambios).eq("id", leadId);
  if (errUp) throw new Error(`GHL ya tiene el contacto (${c.id}), pero no se pudo guardar en el lead: ${errUp.message}`);
  if (otro) {
    const nota = `Es el mismo contacto de GHL que el lead ${otro.email || otro.telefono || otro.id} (${c.id}): GHL los une por teléfono; aquí siguen siendo 2 leads`;
    const { error: errAct } = await db().from("actividades").insert({ proyecto_id: proyectoId, lead_id: leadId, perfil_id: null, tipo: "webhook", nota });
    if (errAct) console.error("[ghl-envios] no se pudo apuntar en el historial:", errAct.message);
  }
}
