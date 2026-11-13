import "server-only";
// Leads nuevos de GHL por la API (Cristian, 16-17 oct 2026: «todo por API, sin workflows»). Cada 60 s, junto a las
// citas, se leen los contactos creados en GHL y cada uno entra en la app según su etiqueta. Se leen contactos, no
// oportunidades: con el workflow apagado, GHL crea el contacto pero no la oportunidad (comprobado el 16 oct con el
// test de Cristian). Decisiones de Cristian:
// · los nuevos (lo de antes se trae una vez con scripts/igualar-ghl.mjs) y, desde el 17 oct, también los que
//   ganan una etiqueta después (p. ej. uno de la Biblioteca que se apunta al Webinar: gana su tarjeta en el Webinar)
// · si en GHL cambian los datos de un lead que ya está, la app se pone al día sin pisar lo suyo: nombre, apellido y
//   teléfono solo si en la app están vacíos; respuestas y etiquetas nuevas se suman
// · etiqueta → pipeline (tabla de abajo); con varias, entra en todos (su tarjeta 🔗 en cada uno); sin ninguna,
//   a «0. Agendas General»
// · siempre en la primera columna; los leads nuevos se reparten solos a los callers, como los de la Entrada
import { db } from "@/lib/datos";
import { guardarLeads, unirRespuestas, type LeadEntrada } from "@/lib/leads";
import { normalizarRespuestas } from "@/lib/oferta";
import { camposGhl, contactoGhl, contactosNuevosGhl, type ContactoNuevoGhl } from "@/lib/ghl";
import { leadDeContactoGhl } from "@/lib/ghl-lead";
import { espejoGhl, type ResultadoEspejo } from "@/lib/ghl-espejo";
import { PIPELINE_GENERAL } from "@/lib/canal";
import { mismoNombre } from "@/lib/formato";
import { unirEtiquetas } from "@/lib/etiquetas";
import type { Proyecto, Respuesta } from "@/lib/tipos";

type Fetch = typeof fetch;
type ResultadoLeads = { nuevos: number; actualizados: number; completados: number; cambiados: number; puestosAlDia: number; espejo?: Omit<ResultadoEspejo, "avisos" | "errores">; avisos: string[]; errores: string[] };

// Sacado de las 1.622 etiquetas de GHL (17 oct): DFY no tiene etiqueta; el resto, a General
export const PIPELINE_ETIQUETA: { etiqueta: string; pipeline: string }[] = [
  { etiqueta: "biblioteca recursos", pipeline: "1. Biblioteca Recursos" },
  { etiqueta: "webinar1", pipeline: "2. Webinar 1" },
];
function tieneEtiquetaDePipeline(tags: string[] | undefined) {
  return (tags ?? []).some((t) => PIPELINE_ETIQUETA.some((x) => x.etiqueta === String(t).trim().toLowerCase()));
}
export function pipelinesDeEtiquetas(tags: string[] | undefined) {
  const t = (tags ?? []).map((x) => String(x).trim().toLowerCase());
  const p = PIPELINE_ETIQUETA.filter((r) => t.includes(r.etiqueta)).map((r) => r.pipeline);
  return p.length ? p : [PIPELINE_GENERAL];
}

const MIN = 60_000;
const MARGEN = 2 * MIN; // se relee un poco hacia atrás por si GHL tarda en indexar alguno (los ya vistos no se repiten)
const MAX_POR_LECTURA = 30; // el resto, en la siguiente (a los 60 s)
// 17 oct (Cristian): GHL crea el contacto y le pone la etiqueta unos segundos después (visto con un lead real de la
// Biblioteca: leído a los 4 s, sin etiqueta, acabó en General). Un contacto sin etiqueta de pipeline se espera 2 min
// antes de mandarlo a General.
const ESPERA_SIN_ETIQUETA = 2 * MIN;
const RELEER = 10 * MIN; // las respuestas pueden llegar un poco después: se releen durante 10 min
const MAX_RELEER = 10;
const GUARDAR_VISTOS = 3 * 24 * 60 * MIN;

// Las preguntas de GHL cambian poco: se guardan 10 min en memoria
const cache = new Map<string, { hasta: number; campos: Map<string, string> }>();
async function preguntas(token: string, locationId: string, fetchImpl: Fetch | undefined, ahora: number) {
  const c = cache.get(locationId);
  if (c && c.hasta > ahora && !fetchImpl) return c.campos;
  const campos = new Map((await camposGhl({ token, locationId, fetchImpl })).map((x) => [x.id, x.name]));
  if (!fetchImpl) cache.set(locationId, { hasta: ahora + 10 * MIN, campos });
  return campos;
}

const fecha = (c: ContactoNuevoGhl) => new Date(c.dateAdded ?? 0).getTime() || 0;
type PipeApp = { id: string; nombre: string; etapas: { id: string; orden: number }[] };

export async function leerLeadsGhl(proyecto: Proyecto & { ghl_location_id: string | null }, token: string, opciones: { fetchImpl?: Fetch; ahora?: Date } = {}): Promise<ResultadoLeads> {
  const { fetchImpl } = opciones;
  const ahora = (opciones.ahora ?? new Date()).getTime();
  const r: ResultadoLeads = { nuevos: 0, actualizados: 0, completados: 0, cambiados: 0, puestosAlDia: 0, avisos: [], errores: [] };
  const locationId = proyecto.ghl_location_id;
  // Sin la migración 20261017130000 el campo no viene: no se hace nada
  if (!locationId || !("ghl_leads_hasta" in proyecto)) return r;
  // Sin fecha de inicio: se empieza ahora (lo anterior entra con el repaso único)
  const hasta = proyecto.ghl_leads_hasta ? new Date(proyecto.ghl_leads_hasta).getTime() : ahora;

  // 1 · Contactos creados después del corte, los más viejos primero; fuera los ya vistos
  const recientes = await contactosNuevosGhl({ token, locationId, desde: new Date(hasta - MARGEN), limite: 100, fetchImpl });
  const { data: vistosFilas, error: errVistos } = recientes.length
    ? await db().from("ghl_oportunidades_vistas").select("opp_id").eq("proyecto_id", proyecto.id).in("opp_id", recientes.map((c) => c.id))
    : { data: [], error: null };
  if (errVistos) throw new Error(`No se pudo leer ghl_oportunidades_vistas: ${errVistos.message}`);
  const yaVistos = new Set((vistosFilas ?? []).map((v) => v.opp_id as string));
  const pendientes = recientes.filter((c) => !yaVistos.has(c.id)).sort((a, b) => fecha(a) - fecha(b)).slice(0, MAX_POR_LECTURA);

  const campos = await preguntas(token, locationId, fetchImpl, ahora);
  const { data: pipesFilas } = await db().from("pipelines").select("id, nombre, etapas(id, orden)").eq("proyecto_id", proyecto.id).eq("tipo", "normal");
  const pipesApp = (pipesFilas ?? []) as PipeApp[];

  // 1b · Espejo de GHL (17 oct): en «2. Webinar 1», mismas columnas y misma columna que su oportunidad. Va antes de
  // los contactos: así uno que solo tiene la oportunidad (p. ej. etiqueta «regalo 1») no acaba en General.
  try {
    const e = await espejoGhl(proyecto, token, campos, { fetchImpl });
    r.espejo = { nuevos: e.nuevos, anadidos: e.anadidos, movidos: e.movidos, columnas: e.columnas };
    r.avisos.push(...e.avisos);
    r.errores.push(...e.errores);
  } catch (e) {
    r.errores.push(`Espejo: ${e instanceof Error ? e.message : e}`);
  }

  // 2 · Cada contacto a los pipelines de sus etiquetas. En orden: si algo falla, se para ahí y la siguiente lectura
  // sigue desde ese contacto.
  let nuevoHasta = hasta;
  for (const c of pendientes) {
    // Sin etiqueta todavía y recién creado: se para aquí (sin marcarlo visto) y la lectura siguiente sigue desde él
    if (!tieneEtiquetaDePipeline(c.tags) && ahora - fecha(c) < ESPERA_SIN_ETIQUETA) break;
    const { lead } = leadDeContactoGhl(c.id, c, campos, { fuente: c.source ?? null, creadoEn: c.dateAdded ?? null });
    try {
      // Sin etiqueta de pipeline y ya en la app (p. ej. por el espejo o por su cita): no va a General, solo sus datos
      const antes = tieneEtiquetaDePipeline(c.tags) ? null : await yaExiste(proyecto.id, lead);
      const g = antes
        ? await guardarLeads(proyecto, [sinPisar(lead, antes)], { pipelineId: null, origen: "ghl", perfilId: null, repartir: false }).then((x) => ({ nuevos: 0, actualizados: x.actualizados }))
        : await meterEnPipelines(proyecto, lead, pipelinesDeEtiquetas(c.tags), pipesApp, r);
      r.nuevos += g.nuevos;
      r.actualizados += g.actualizados;
    } catch (e) {
      r.errores.push(`Contacto ${c.id}: ${e instanceof Error ? e.message : e}`);
      break;
    }
    // `opp_id` guarda el id del contacto (la tabla se creó para oportunidades el 16 oct)
    await db().from("ghl_oportunidades_vistas").upsert({ proyecto_id: proyecto.id, opp_id: c.id, contact_id: c.id, n_respuestas: lead.respuestas.length, visto_en: new Date(ahora).toISOString() });
    nuevoHasta = Math.max(nuevoHasta, fecha(c));
  }

  // 3 · Los contactos que han cambiado en GHL en los últimos 30 min (sin cursor: si la lectura parase más de 30 min,
  // lo recupera el repaso): si ya están en la app, se ponen al día sus datos; si tienen una etiqueta de pipeline que
  // aún no tienen en la app, ganan ese pipeline. Sin etiqueta de pipeline y sin estar en la app, nada (General es
  // solo para los nuevos).
  try {
    await cambiosEnGhl(proyecto, token, locationId, campos, pipesApp, new Set(pendientes.map((c) => c.id)), ahora, fetchImpl, r);
  } catch (e) {
    r.errores.push(`Cambiados: ${e instanceof Error ? e.message : e}`);
  }

  // 4 · Los de los últimos 10 min se releen: si GHL tiene ya más respuestas, se completan
  const hechos = new Set(pendientes.map((c) => c.id));
  const { data: releer } = await db()
    .from("ghl_oportunidades_vistas")
    .select("opp_id, contact_id, n_respuestas")
    .eq("proyecto_id", proyecto.id)
    .gt("visto_en", new Date(ahora - RELEER).toISOString())
    .not("contact_id", "is", null)
    .order("visto_en", { ascending: false })
    .limit(MAX_RELEER + hechos.size);
  for (const v of (releer ?? []).filter((x) => !hechos.has(x.opp_id)).slice(0, MAX_RELEER)) {
    try {
      const c = await contactoGhl({ token, contactId: v.contact_id as string, fetchImpl });
      if (!c) continue;
      const { lead } = leadDeContactoGhl(v.contact_id as string, c, campos, {});
      if (lead.respuestas.length <= (v.n_respuestas ?? 0)) continue;
      const antes = await yaExiste(proyecto.id, lead);
      if (!antes) continue;
      await guardarLeads(proyecto, [sinPisar(lead, antes)], { pipelineId: null, origen: "ghl", perfilId: null, repartir: false });
      await db().from("ghl_oportunidades_vistas").update({ n_respuestas: lead.respuestas.length }).eq("proyecto_id", proyecto.id).eq("opp_id", v.opp_id);
      r.completados++;
    } catch (e) {
      r.errores.push(`Releer ${v.contact_id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (nuevoHasta !== hasta || !proyecto.ghl_leads_hasta) await db().from("proyectos").update({ ghl_leads_hasta: new Date(nuevoHasta).toISOString() }).eq("id", proyecto.id);
  await db().from("ghl_oportunidades_vistas").delete().eq("proyecto_id", proyecto.id).lt("visto_en", new Date(ahora - GUARDAR_VISTOS).toISOString());
  return r;
}

const VENTANA_CAMBIOS = 30 * MIN;
type LeadApp = { id: string; ghl_contact_id: string; pipeline_id: string | null; nombre: string | null; apellido: string | null; email: string | null; telefono: string | null; etiquetas: string[] | null; respuestas: Respuesta[] | null };

// Cristian, 17 oct (tras probarlo con su contacto de test): GHL no pisa lo que ya tiene la app. Nombre, apellido y
// teléfono solo se rellenan si en la app están vacíos; el email, solo si faltaba (es la clave del lead); etiquetas y
// respuestas se suman (no se borra ninguna).
type DatosApp = { nombre: string | null; apellido: string | null; telefono: string | null };
const vacio = (x: string | null | undefined) => !(x ?? "").trim();
function sinPisar(l: LeadEntrada, antes: DatosApp): LeadEntrada {
  return { ...l, extra: undefined, nombre: vacio(antes.nombre) ? l.nombre : "", apellido: vacio(antes.apellido) ? l.apellido : "", telefono: vacio(antes.telefono) ? l.telefono : null };
}

// ¿Trae GHL algo que la app no tiene? (las mismas reglas: si no, no se escribe)
function hayCambios(antes: Omit<LeadApp, "id" | "ghl_contact_id" | "pipeline_id">, l: LeadEntrada) {
  if (l.nombre?.trim() && vacio(antes.nombre)) return true;
  if (l.apellido?.trim() && vacio(antes.apellido)) return true;
  if (l.telefono?.trim() && vacio(antes.telefono)) return true;
  if (l.email && !antes.email) return true;
  // 6 nov (plan GHL): con la misma regla que al guardar; así una `-incompleto` vieja de GHL no reescribe el lead cada minuto
  const tags = new Set((antes.etiquetas ?? []).map((x) => x.toLowerCase()));
  if (unirEtiquetas(antes.etiquetas, l.etiquetas).some((x) => !tags.has(x.toLowerCase()))) return true;
  const previas = normalizarRespuestas(antes.respuestas ?? []);
  return JSON.stringify(unirRespuestas(previas, l.respuestas)) !== JSON.stringify(previas);
}

async function cambiosEnGhl(
  proyecto: Proyecto,
  token: string,
  locationId: string,
  campos: Map<string, string>,
  pipesApp: PipeApp[],
  yaHechos: Set<string>,
  ahora: number,
  fetchImpl: Fetch | undefined,
  r: ResultadoLeads
) {
  const cambiados = (await contactosNuevosGhl({ token, locationId, desde: new Date(ahora - VENTANA_CAMBIOS), limite: 100, campo: "dateUpdated", fetchImpl })).filter((c) => !yaHechos.has(c.id));
  if (!cambiados.length) return;
  // Cómo está cada uno en la app (datos, pipeline principal y tarjetas 🔗), en 2 consultas
  const { data: filas, error } = await db()
    .from("leads")
    .select("id, ghl_contact_id, pipeline_id, nombre, apellido, email, telefono, etiquetas, respuestas")
    .eq("proyecto_id", proyecto.id)
    .in("ghl_contact_id", cambiados.map((c) => c.id));
  if (error) throw new Error(error.message);
  const leads = (filas ?? []) as LeadApp[];
  const { data: tarjetas } = leads.length ? await db().from("tarjetas_extra").select("lead_id, pipeline_id").in("lead_id", leads.map((l) => l.id)) : { data: [] };

  for (const c of cambiados) {
    const ya = leads.find((l) => l.ghl_contact_id === c.id);
    const esta = new Set([ya?.pipeline_id, ...(tarjetas ?? []).filter((t) => t.lead_id === ya?.id).map((t) => t.pipeline_id)].filter(Boolean) as string[]);
    const conEtiqueta = tieneEtiquetaDePipeline(c.tags);
    const faltan = conEtiqueta
      ? pipelinesDeEtiquetas(c.tags).filter((nombre) => {
          const p = pipesApp.find((x) => mismoNombre(x.nombre, nombre));
          return p && !esta.has(p.id);
        })
      : [];
    const { lead } = leadDeContactoGhl(c.id, c, campos, { fuente: c.source ?? null, creadoEn: c.dateAdded ?? null });

    if (faltan.length) {
      const g = await meterEnPipelines(proyecto, lead, faltan, pipesApp, r);
      r.nuevos += g.nuevos;
      r.actualizados += g.actualizados;
      r.cambiados++;
      // Si ya estaba, que se vea en su historial por qué tiene la tarjeta nueva
      if (ya) {
        const { error: errHist } = await db().from("actividades").insert({ proyecto_id: proyecto.id, lead_id: ya.id, perfil_id: null, tipo: "webhook", nota: `Nueva etiqueta en GHL (API) · ahora también en ${faltan.join(", ")}` });
        if (errHist) console.error("[actividad] no se pudo guardar la etiqueta nueva:", errHist.message);
      }
    } else if (ya && hayCambios(ya, lead)) {
      // Solo se escribe si GHL trae algo nuevo (así no se reescribe cada 60 s durante la media hora)
      await guardarLeads(proyecto, [sinPisar(lead, ya)], { pipelineId: null, origen: "ghl", perfilId: null, repartir: false });
      r.puestosAlDia++;
    }
  }
}

// El primer pipeline crea el lead (con su origen, reparto y nota); los demás le dan su tarjeta 🔗 en silencio.
// Si ya estaba en la app (p. ej. lo creó su cita), solo se completan sus datos.
async function meterEnPipelines(proyecto: Proyecto, lead: LeadEntrada, nombres: string[], pipesApp: PipeApp[], r: ResultadoLeads) {
  let nuevos = 0;
  let actualizados = 0;
  let existe: DatosApp | null = await yaExiste(proyecto.id, lead);
  for (const nombre of nombres) {
    const pipe = pipesApp.find((p) => mismoNombre(p.nombre, nombre));
    if (!pipe) {
      r.avisos.push(`El pipeline «${nombre}» no existe en la app`);
      continue;
    }
    const primera = [...(pipe.etapas ?? [])].sort((a, b) => a.orden - b.orden)[0]?.id ?? null;
    const g = await guardarLeads(proyecto, [existe ? sinPisar(lead, existe) : lead], {
      pipelineId: pipe.id,
      etapaId: primera,
      origen: "ghl",
      perfilId: null,
      repartir: true,
      notaActividad: `Entró desde GHL (API) · ${pipe.nombre}`,
    });
    nuevos += g.insertados;
    actualizados += g.actualizados;
    existe ??= { nombre: lead.nombre, apellido: lead.apellido, telefono: lead.telefono };
  }
  return { nuevos, actualizados };
}

// El lead de la app con ese contacto (o email), con lo que GHL no debe pisar; null si no está
async function yaExiste(proyectoId: string, l: LeadEntrada): Promise<DatosApp | null> {
  const sel = "nombre, apellido, telefono";
  const [porGhl, porEmail] = await Promise.all([
    l.ghl_contact_id ? db().from("leads").select(sel).eq("proyecto_id", proyectoId).eq("ghl_contact_id", l.ghl_contact_id).limit(1) : null,
    l.email ? db().from("leads").select(sel).eq("proyecto_id", proyectoId).eq("email", l.email).limit(1) : null,
  ]);
  return ((porGhl?.data?.[0] ?? porEmail?.data?.[0]) as DatosApp | undefined) ?? null;
}
