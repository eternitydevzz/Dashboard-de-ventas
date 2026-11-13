// Fathom por API (V2-9). Comprobado en la documentación oficial (9 oct 2026):
// developers.fathom.ai/api-reference/meetings/list-meetings
// · GET https://api.fathom.ai/external/v1/meetings · cabecera X-Api-Key
// · created_after (ISO), cursor, include_summary, include_transcript · respuesta { items, next_cursor, limit }
// · cada reunión: title, meeting_title, recording_id, url, share_url, scheduled_start_time, scheduled_end_time,
//   recording_start_time, recording_end_time, calendar_invitees [{ name, email, is_external }], default_summary.markdown_formatted, transcript
import { normal } from "@/lib/llamadas";

const FATHOM_BASE = "https://api.fathom.ai/external/v1";
type Fetch = typeof fetch;

type ReunionFathom = {
  title?: string | null;
  meeting_title?: string | null;
  recording_id: number;
  url?: string | null;
  share_url?: string | null;
  scheduled_start_time?: string | null;
  scheduled_end_time?: string | null;
  recording_start_time?: string | null;
  recording_end_time?: string | null;
  calendar_invitees?: { name?: string | null; email?: string | null; is_external?: boolean }[] | null;
  default_summary?: { markdown_formatted?: string | null } | null;
  transcript?: { speaker?: { display_name?: string }; text?: string; timestamp?: string }[] | null;
};

export async function reunionesFathom(o: { apiKey: string; desde: Date; fetchImpl?: Fetch; maxPaginas?: number }): Promise<ReunionFathom[]> {
  const f = o.fetchImpl ?? fetch;
  const fuera: ReunionFathom[] = [];
  let cursor: string | null = null;
  for (let pagina = 0; pagina < (o.maxPaginas ?? 20); pagina++) {
    const q = new URLSearchParams({ created_after: o.desde.toISOString(), include_summary: "true", include_transcript: "true" });
    if (cursor) q.set("cursor", cursor);
    const res = await f(`${FATHOM_BASE}/meetings?${q}`, { headers: { "X-Api-Key": o.apiKey, Accept: "application/json" }, cache: "no-store" });
    if (res.status === 401 || res.status === 403) throw new Error("Fathom no acepta la API key (revísala en Fathom → Settings → API Access).");
    if (res.status === 429) throw new Error("Fathom pide esperar (demasiadas peticiones). Prueba en unos minutos.");
    if (!res.ok) throw new Error(`Fathom respondió ${res.status}.`);
    const j = (await res.json()) as { items?: ReunionFathom[]; next_cursor?: string | null };
    fuera.push(...(j.items ?? []).filter((x) => x && typeof x.recording_id === "number"));
    cursor = j.next_cursor ?? null;
    if (!cursor) break;
  }
  return fuera;
}

// «{nombre cliente}: Sesión estratégica» + «Ana López: Sesión estratégica» → «Ana López».
// En el formato, «…» o «...» valen cualquier cosa; {nombre} también vale.
export function nombreDesdeTitulo(titulo: string | null | undefined, formato: string | null | undefined) {
  if (!titulo || !formato) return null;
  const marca = /\{\s*nombre(?:\s+cliente)?\s*\}/i;
  if (!marca.test(formato)) return null;
  const [antes, despues] = formato.split(marca);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/(…|\\\.\\\.\\\.)/g, ".*").replace(/\s+/g, "\\s*");
  const m = titulo.trim().match(new RegExp(`^${esc(antes)}(.+?)${esc(despues ?? "")}$`, "i"));
  return m?.[1]?.trim() || null;
}

export type CitaC = { id: string; fecha: string; closer_id: string | null; lead: { nombre: string; email: string | null } | null };
const H = 3600_000;

// Une una grabación con su cita (del mismo closer). Por orden: email del invitado → nombre del título → hora.
// Si hay más de una posible, no se elige: queda pendiente (la revisa una persona).
export function conciliarGrabacion(g: { inicio: string | null; titulo: string | null; invitados: { email?: string | null; is_external?: boolean }[] }, citas: CitaC[], formato: string | null) {
  if (!g.inicio) return { cita_id: null, motivo: "La grabación no tiene fecha." };
  const t = new Date(g.inicio).getTime();
  const cerca = citas.filter((c) => Math.abs(new Date(c.fecha).getTime() - t) <= 24 * H);
  const unica = (xs: CitaC[], motivo: string) => (xs.length === 1 ? { cita_id: xs[0].id, motivo } : null);
  const emails = new Set(g.invitados.filter((i) => i.is_external !== false && i.email).map((i) => i.email!.toLowerCase()));
  const porEmail = cerca.filter((c) => c.lead?.email && emails.has(c.lead.email.toLowerCase()));
  const r1 = unica(porEmail, "Por el email del invitado");
  if (r1) return r1;
  const nombre = nombreDesdeTitulo(g.titulo, formato);
  if (nombre) {
    const n = normal(nombre);
    const r2 = unica(cerca.filter((c) => c.lead && normal(c.lead.nombre).length > 1 && (normal(c.lead.nombre).includes(n) || n.includes(normal(c.lead.nombre)))), "Por el nombre del título");
    if (r2) return r2;
  }
  const r3 = unica(cerca.filter((c) => Math.abs(new Date(c.fecha).getTime() - t) <= 0.5 * H), "Por la hora (±30 min)");
  if (r3) return r3;
  const posibles = cerca.length;
  return { cita_id: null, motivo: posibles ? `${posibles} citas posibles ese día: elige a mano.` : "No hay ninguna cita de este closer cerca de esa hora." };
}
