// Conexión con la API de GHL (V2-3). Comprobado en la especificación oficial (9 oct 2026):
// github.com/GoHighLevel/highlevel-api-docs → apps/calendars.json y apps/contacts.json
// · GET /calendars/events?locationId&calendarId|userId&startTime&endTime (milisegundos) · Version 2021-04-15 · permiso calendars/events.readonly
// · GET /contacts/{id} → { contact: { firstName, lastName, email, phone } } · Version 2021-07-28 · permiso contacts.readonly
// · GET /opportunities/pipelines?locationId y GET /opportunities/search?location_id&contact_id · Version 2021-07-28 · permiso opportunities.readonly (13 oct)
// Autenticación: «Private Integration Token» de la subcuenta en Authorization: Bearer.
import { mismoNombre } from "@/lib/formato";

export const GHL_BASE = "https://services.leadconnectorhq.com";

export type EventoGhl = {
  id: string;
  calendarId?: string;
  contactId?: string;
  title?: string;
  startTime?: string;
  appointmentStatus?: string;
  assignedUserId?: string;
  deleted?: boolean;
};
// Plan GHL (16 oct): `lastAttributionSource` = la última página por la que entró (la de la agenda, con su UTM).
// Comprobado con contactos reales: `attributionSource` (la primera) suele venir vacío.
type AtribucionGhl = { url?: string | null; utmSource?: string | null };
export type ContactoGhl = {
  id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  source?: string | null;
  // Respuestas del formulario: { id del campo, valor } (el nombre de la pregunta sale de camposGhl)
  customFields?: { id: string; value?: unknown }[];
  lastAttributionSource?: AtribucionGhl | null;
  attributionSource?: AtribucionGhl | null;
};
type Fetch = typeof fetch;

async function llamar(fetchImpl: Fetch, token: string, ruta: string, version: string) {
  const res = await fetchImpl(`${GHL_BASE}${ruta}`, { headers: { Authorization: `Bearer ${token}`, Version: version, Accept: "application/json" }, cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw new Error("GHL no acepta el token (revisa que sea de esta subcuenta y que tenga los permisos de calendario y contactos).");
  if (res.status === 429) throw new Error("GHL pide esperar (demasiadas peticiones). Prueba en unos minutos.");
  if (!res.ok) throw new Error(`GHL respondió ${res.status}.`);
  return res.json();
}

export async function eventosGhl(o: { token: string; locationId: string; calendarId?: string | null; userId?: string | null; desde: Date; hasta: Date; fetchImpl?: Fetch }): Promise<EventoGhl[]> {
  const q = new URLSearchParams({ locationId: o.locationId, startTime: String(o.desde.getTime()), endTime: String(o.hasta.getTime()) });
  if (o.calendarId) q.set("calendarId", o.calendarId);
  else if (o.userId) q.set("userId", o.userId);
  else throw new Error("Falta el calendario o el usuario de GHL.");
  const j = await llamar(o.fetchImpl ?? fetch, o.token, `/calendars/events?${q}`, "2021-04-15");
  return Array.isArray(j?.events) ? j.events : [];
}

export async function contactoGhl(o: { token: string; contactId: string; fetchImpl?: Fetch }): Promise<ContactoGhl | null> {
  const j = await llamar(o.fetchImpl ?? fetch, o.token, `/contacts/${encodeURIComponent(o.contactId)}`, "2021-07-28");
  return j?.contact ?? null;
}

// Plan GHL (16 oct): nombre del calendario. Necesita el permiso calendars.readonly (hoy el token no lo tiene: 401);
// sin él, null y la cita guarda el id del calendario.
export async function nombreCalendarioGhl(o: { token: string; calendarId: string; fetchImpl?: Fetch }): Promise<string | null> {
  try {
    const j = await llamar(o.fetchImpl ?? fetch, o.token, `/calendars/${encodeURIComponent(o.calendarId)}`, "2021-04-15");
    return typeof j?.calendar?.name === "string" ? j.calendar.name.trim() || null : null;
  } catch {
    return null;
  }
}

// Plan GHL (16 oct): una cita que ya no viene en la lista se comprueba una a una antes de cancelarla.
// «borrada» = GHL dice que no existe (404) o la marca borrada/cancelada · «sigue» = existe y no está cancelada ·
// «no_se» = GHL falló (no se toca nada).
export async function estadoCitaGhl(o: { token: string; citaId: string; fetchImpl?: Fetch }): Promise<"borrada" | "sigue" | "no_se"> {
  try {
    const res = await (o.fetchImpl ?? fetch)(`${GHL_BASE}/calendars/events/appointments/${encodeURIComponent(o.citaId)}`, {
      headers: { Authorization: `Bearer ${o.token}`, Version: "2021-04-15", Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 404) return "borrada";
    if (!res.ok) return "no_se";
    const j = await res.json();
    const c = j?.appointment ?? j?.event ?? j;
    if (!c?.id) return "no_se";
    return c.deleted === true || estadoDesdeGhl(c.appointmentStatus) === "cancelada" ? "borrada" : "sigue";
  } catch {
    return "no_se";
  }
}

// 13 oct (Cristian): los pipelines de GHL donde el contacto tiene una oportunidad en la columna «Agendan»
// (la más reciente primero). Lo usan las citas que no dicen su pipeline: así van a «Agendan» del mismo pipeline que en GHL.
type OportunidadGhl = { pipelineId?: string; pipelineStageId?: string; updatedAt?: string; createdAt?: string };
export type PipelineGhl = { id: string; name: string; stages?: { id: string; name: string; position?: number }[] };
export async function pipelinesAgendanGhl(o: { token: string; locationId: string; contactId: string; fetchImpl?: Fetch }): Promise<string[]> {
  const f = o.fetchImpl ?? fetch;
  const [p, s] = await Promise.all([
    llamar(f, o.token, `/opportunities/pipelines?locationId=${encodeURIComponent(o.locationId)}`, "2021-07-28"),
    llamar(f, o.token, `/opportunities/search?location_id=${encodeURIComponent(o.locationId)}&contact_id=${encodeURIComponent(o.contactId)}&limit=20`, "2021-07-28"),
  ]);
  const pipelines: PipelineGhl[] = Array.isArray(p?.pipelines) ? p.pipelines : [];
  const opps: OportunidadGhl[] = Array.isArray(s?.opportunities) ? s.opportunities : [];
  const fecha = (x: OportunidadGhl) => new Date(x.updatedAt ?? x.createdAt ?? 0).getTime() || 0;
  return [...opps]
    .sort((a, b) => fecha(b) - fecha(a))
    .map((op) => {
      const pl = pipelines.find((x) => x.id === op.pipelineId);
      const etapa = pl?.stages?.find((x) => x.id === op.pipelineStageId);
      return pl && etapa && mismoNombre(etapa.name, "Agendan") ? pl.name : null;
    })
    .filter((x): x is string => !!x);
}

// Leads por API (Cristian, 16-17 oct 2026): se leen los contactos nuevos (no las oportunidades: sin workflow,
// GHL no las crea). Preguntas: GET /locations/{id}/customFields → { customFields: [{ id, name }] } · locations/customFields.readonly
// Contactos creados (o cambiados) después de una fecha, los más viejos primero (17 oct, comprobado con la subcuenta
// real: trae etiquetas, respuestas —customFields— y source; el filtro y el orden valen con dateAdded y con dateUpdated).
// POST /contacts/search { locationId, pageLimit, sort: campo asc, filters: campo > fecha } · permiso contacts.readonly
export type ContactoNuevoGhl = ContactoGhl & { id: string; dateAdded?: string; dateUpdated?: string };
export async function contactosNuevosGhl(o: { token: string; locationId: string; desde: Date; limite: number; campo?: "dateAdded" | "dateUpdated"; fetchImpl?: Fetch }): Promise<ContactoNuevoGhl[]> {
  const campo = o.campo ?? "dateAdded";
  const res = await (o.fetchImpl ?? fetch)(`${GHL_BASE}/contacts/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${o.token}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      locationId: o.locationId,
      pageLimit: o.limite,
      sort: [{ field: campo, direction: "asc" }],
      filters: [{ field: campo, operator: "range", value: { gt: o.desde.toISOString() } }],
    }),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new Error("GHL no acepta el token (revisa el permiso de contactos).");
  if (res.status === 429) throw new Error("GHL pide esperar (demasiadas peticiones).");
  if (!res.ok) throw new Error(`GHL respondió ${res.status}.`);
  const j = await res.json();
  return Array.isArray(j?.contacts) ? j.contacts.filter((c: { id?: unknown }) => typeof c?.id === "string") : [];
}
// Espejo de pipelines (17 oct). Comprobado con la subcuenta real: /opportunities/search acepta pipeline_id y pagina
// con startAfter + startAfterId (meta).
export type OportunidadGhl2 = { id: string; contactId?: string; pipelineId?: string; pipelineStageId?: string; createdAt?: string };
export async function pipelinesGhl(o: { token: string; locationId: string; fetchImpl?: Fetch }): Promise<PipelineGhl[]> {
  const j = await llamar(o.fetchImpl ?? fetch, o.token, `/opportunities/pipelines?locationId=${encodeURIComponent(o.locationId)}`, "2021-07-28");
  return Array.isArray(j?.pipelines) ? j.pipelines : [];
}
// Plan GHL, B (Cristian, 7 nov): la primera columna de un pipeline de GHL (la de menor `position`; sin ella, la
// primera de la lista). null si el pipeline no está o no tiene columnas.
export function columnasEnOrdenGhl<T extends { id: string; position?: number }>(stages: T[] | undefined): T[] {
  const pos = (s: T, i: number) => (typeof s.position === "number" ? s.position : i);
  return (stages ?? [])
    .filter((s) => typeof s?.id === "string")
    .map((s, i) => ({ s, p: pos(s, i) }))
    .sort((a, b) => a.p - b.p)
    .map((x) => x.s);
}
export function primeraColumnaGhl(pipelines: PipelineGhl[], pipelineId: string): string | null {
  return columnasEnOrdenGhl(pipelines.find((p) => p.id === pipelineId)?.stages)[0]?.id ?? null;
}
export async function oportunidadesDePipelineGhl(o: { token: string; locationId: string; pipelineId: string; maxPaginas?: number; fetchImpl?: Fetch }): Promise<OportunidadGhl2[]> {
  const todas: OportunidadGhl2[] = [];
  let despues = "";
  for (let i = 0; i < (o.maxPaginas ?? 20); i++) {
    const q = `location_id=${encodeURIComponent(o.locationId)}&pipeline_id=${encodeURIComponent(o.pipelineId)}&limit=100${despues}`;
    const j = await llamar(o.fetchImpl ?? fetch, o.token, `/opportunities/search?${q}`, "2021-07-28");
    const ops: OportunidadGhl2[] = Array.isArray(j?.opportunities) ? j.opportunities : [];
    todas.push(...ops.filter((x) => x?.id));
    const m = j?.meta;
    if (!ops.length || !m?.startAfterId || m.startAfter == null) break;
    despues = `&startAfter=${encodeURIComponent(String(m.startAfter))}&startAfterId=${encodeURIComponent(String(m.startAfterId))}`;
  }
  return todas;
}
export async function camposGhl(o: { token: string; locationId: string; fetchImpl?: Fetch }): Promise<{ id: string; name: string }[]> {
  const j = await llamar(o.fetchImpl ?? fetch, o.token, `/locations/${encodeURIComponent(o.locationId)}/customFields`, "2021-07-28");
  return Array.isArray(j?.customFields) ? j.customFields.filter((c: { id?: unknown; name?: unknown }) => typeof c?.id === "string" && typeof c?.name === "string") : [];
}

// ---------- Escribir en GHL (Plan GHL, fase 1, Cristian 6 nov 2026) ----------
// Comprobado el 6 nov en la especificación oficial (apps/contacts.json y apps/opportunities.json), todo Version 2021-07-28:
// · POST /contacts/upsert { locationId, firstName, lastName, email, phone, source, customFields: [{ id, field_value }] }
//   → { new, contact } · contacts.write. Su campo `tags` BORRA todas las etiquetas del contacto: aquí no se manda nunca.
//   Sigue el ajuste de la subcuenta (Maestria: allowDuplicateContact = false → reconoce al contacto por email o teléfono).
// · POST y DELETE /contacts/{id}/tags { tags } · contacts.write
// · Oportunidad: GET /opportunities/search?location_id&contact_id&pipeline_id (opportunities.readonly) y, si no hay,
//   POST /opportunities/ { pipelineId, locationId, name, status, contactId, pipelineStageId } · opportunities.write.
//   No se usa POST /opportunities/upsert: su cuerpo no lleva contactId (decisión de Cristian, 6 nov).
// · Fase 3 (6 nov): si ya tiene una en ese pipeline pero en otra columna, se mueve a la de la Entrada con
//   PUT /opportunities/{id} { pipelineStageId } (opportunities.write), como hacía la rama BIBLIOTECA del workflow viejo.
// · B (7 nov): solo se mueve si se pide (`mover`: la Entrada fija la columna). Si no, la que ya existe se queda donde
//   está: al reservar, GHL la pasa a «Agendan» y un cuestionario reenviado no debe sacarla de ahí.
type Json = Record<string, unknown>;
async function escribir(fetchImpl: Fetch, token: string, metodo: "POST" | "PUT" | "DELETE", ruta: string, cuerpo: Json, permiso: string, version = "2021-07-28") {
  const res = await fetchImpl(`${GHL_BASE}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, Version: version, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new Error(`GHL no acepta el token (revisa que la integración tenga el permiso ${permiso}).`);
  if (res.status === 429) throw new Error("GHL pide esperar (demasiadas peticiones).");
  if (!res.ok) {
    // GHL explica el error en `message` (texto o lista): solo eso, recortado
    const j = (await res.json().catch(() => null)) as { message?: unknown } | null;
    const m = Array.isArray(j?.message) ? j.message.join("; ") : typeof j?.message === "string" ? j.message : "";
    throw new Error(`GHL respondió ${res.status}${m ? `: ${m.slice(0, 200)}` : ""}.`);
  }
  return res.json().catch(() => ({}));
}

export type ContactoParaGhl = { firstName?: string; lastName?: string; email?: string; phone?: string; source?: string };
export async function crearOActualizarContactoGhl(o: {
  token: string;
  locationId: string;
  contacto: ContactoParaGhl;
  customFields: { id: string; field_value: string }[];
  fetchImpl?: Fetch;
}): Promise<{ id: string; nuevo: boolean; etiquetas: string[] | null }> {
  // Solo los datos del contacto, uno a uno: así nunca se cuela `tags` aunque venga en el objeto
  const { firstName, lastName, email, phone, source } = o.contacto;
  const cuerpo: Json = { locationId: o.locationId };
  for (const [k, v] of Object.entries({ firstName, lastName, email, phone, source })) if (v) cuerpo[k] = v;
  if (o.customFields.length) cuerpo.customFields = o.customFields;
  const j = await escribir(o.fetchImpl ?? fetch, o.token, "POST", "/contacts/upsert", cuerpo, "Edit Contacts (contacts.write)");
  const c = j?.contact;
  if (typeof c?.id !== "string") throw new Error("GHL contestó sin id de contacto.");
  return { id: c.id, nuevo: j?.new === true, etiquetas: Array.isArray(c.tags) ? c.tags.map(String) : null };
}

// Encargo de Callers (C11 punto 13, Cristian 7 nov 2026): crear la cita en el calendario de GHL del closer cuando el
// caller agenda en la app. Especificación oficial (apps/calendars.json): POST /calendars/events/appointments, Version
// 2021-04-15, permiso calendars/events.write; obligatorios calendarId, locationId, contactId y startTime; devuelve `id`.
// Sin `toNotify`: los avisos del calendario de GHL (email y SMS) se mandan como si el lead reservara solo (Cristian).
export async function crearCitaGhl(o: { token: string; locationId: string; calendarId: string; contactId: string; inicio: Date; minutos: number; titulo: string; usuarioId?: string | null; fetchImpl?: Fetch }): Promise<string> {
  const fin = new Date(o.inicio.getTime() + Math.max(5, o.minutos) * 60_000);
  const cuerpo: Json = { calendarId: o.calendarId, locationId: o.locationId, contactId: o.contactId, startTime: o.inicio.toISOString(), endTime: fin.toISOString(), title: o.titulo.slice(0, 200), appointmentStatus: "confirmed" };
  if (o.usuarioId) cuerpo.assignedUserId = o.usuarioId;
  const j = await escribir(o.fetchImpl ?? fetch, o.token, "POST", "/calendars/events/appointments", cuerpo, "calendars/events.write", "2021-04-15");
  const id = j?.id ?? j?.appointment?.id;
  if (typeof id !== "string" || !id) throw new Error("GHL contestó sin id de cita.");
  return id;
}

export async function anadirEtiquetasGhl(o: { token: string; contactId: string; etiquetas: string[]; fetchImpl?: Fetch }) {
  if (!o.etiquetas.length) return;
  await escribir(o.fetchImpl ?? fetch, o.token, "POST", `/contacts/${encodeURIComponent(o.contactId)}/tags`, { tags: o.etiquetas }, "Edit Contacts (contacts.write)");
}

export async function quitarEtiquetasGhl(o: { token: string; contactId: string; etiquetas: string[]; fetchImpl?: Fetch }) {
  if (!o.etiquetas.length) return;
  await escribir(o.fetchImpl ?? fetch, o.token, "DELETE", `/contacts/${encodeURIComponent(o.contactId)}/tags`, { tags: o.etiquetas }, "Edit Contacts (contacts.write)");
}

export async function crearOportunidadGhl(o: {
  token: string;
  locationId: string;
  contactId: string;
  pipelineId: string;
  etapaId: string | null;
  nombre: string;
  mover?: boolean; // por defecto sí (lo de antes); false = la que ya existe no se mueve
  // Mejora «menos llamadas» (Cristian, 7 nov): las oportunidades del contacto ya buscadas (oportunidadesContactoGhl).
  // Con ella no se busca otra vez, y la que se crea se añade a la lista
  existentes?: OportunidadGhl2[];
  fetchImpl?: Fetch;
}): Promise<{ id: string; nueva: boolean; movida: boolean }> {
  const f = o.fetchImpl ?? fetch;
  let lista = o.existentes;
  if (!lista) {
    const q = new URLSearchParams({ location_id: o.locationId, contact_id: o.contactId, pipeline_id: o.pipelineId, limit: "20" });
    const s = await llamar(f, o.token, `/opportunities/search?${q}`, "2021-07-28");
    lista = Array.isArray(s?.opportunities) ? s.opportunities : [];
  }
  const ya = (lista ?? []).find((x: OportunidadGhl2) => x?.id && x.pipelineId === o.pipelineId);
  if (ya) {
    if (o.mover === false || !o.etapaId || ya.pipelineStageId === o.etapaId) return { id: ya.id, nueva: false, movida: false };
    await escribir(f, o.token, "PUT", `/opportunities/${encodeURIComponent(ya.id)}`, { pipelineStageId: o.etapaId }, "Edit Opportunities (opportunities.write)");
    return { id: ya.id, nueva: false, movida: true };
  }
  const cuerpo: Json = { locationId: o.locationId, pipelineId: o.pipelineId, contactId: o.contactId, name: o.nombre, status: "open" };
  if (o.etapaId) cuerpo.pipelineStageId = o.etapaId;
  const j = await escribir(f, o.token, "POST", "/opportunities/", cuerpo, "Edit Opportunities (opportunities.write)");
  const id = j?.opportunity?.id ?? j?.id;
  if (typeof id !== "string") throw new Error("GHL contestó sin id de oportunidad.");
  o.existentes?.push({ id, contactId: o.contactId, pipelineId: o.pipelineId, pipelineStageId: o.etapaId ?? undefined });
  return { id, nueva: true, movida: false };
}

// Todas las oportunidades de un contacto en UNA llamada (sin pipeline; 100 es el máximo de GHL, apps/opportunities.json).
// Comprobado el 7 nov en la especificación oficial: GHL no tiene forma de crear varias oportunidades de una vez.
export async function oportunidadesContactoGhl(o: { token: string; locationId: string; contactId: string; fetchImpl?: Fetch }): Promise<OportunidadGhl2[]> {
  const q = new URLSearchParams({ location_id: o.locationId, contact_id: o.contactId, limit: "100" });
  const s = await llamar(o.fetchImpl ?? fetch, o.token, `/opportunities/search?${q}`, "2021-07-28");
  return Array.isArray(s?.opportunities) ? s.opportunities : [];
}

// Estado de GHL → estado de la cita en la app. `null` = no se toca (lo decide el closer).
export function estadoDesdeGhl(s: string | undefined): "confirmada" | "cancelada" | "no_show" | "invalida" | null {
  switch ((s ?? "").toLowerCase()) {
    case "confirmed":
      return "confirmada";
    case "cancelled":
      return "cancelada";
    case "noshow":
      return "no_show";
    case "invalid":
      return "invalida";
    default:
      return null; // new, booked, showed, active, completed…
  }
}

// Un estado de GHL solo cambia una cita que aún está abierta (no pisa lo que ya registró el closer)
export function nuevoEstado(actual: string, deGhl: ReturnType<typeof estadoDesdeGhl>) {
  const abierta = ["pendiente", "confirmacion_pendiente", "confirmada"].includes(actual);
  if (!abierta || !deGhl || deGhl === "invalida") return actual;
  // 16 oct (Cristian): GHL marca «confirmed» toda reserva del widget, así que no pisa «Confirmación pendiente»,
  // que lo pone el equipo a mano. Una cancelación o un no show de GHL sí cuentan.
  if (deGhl === "confirmada" && (actual === "confirmada" || actual === "confirmacion_pendiente")) return actual;
  return deGhl;
}
