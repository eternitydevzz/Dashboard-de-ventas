// Llamadas de GHL (V2-11). Comprobado en la especificación oficial (github GoHighLevel/highlevel-api-docs,
// apps/conversations.json, 9 oct 2026) · permiso conversations/message.readonly · Version 2021-04-15:
// · GET /conversations/messages/export?locationId&channel=Call&sortBy=createdAt&sortOrder=desc&limit&cursor
//   → { messages: [{ id, messageType, contactId, userId, dateAdded, direction, meta: { callDuration, callStatus } }], nextCursor }
// · GET /conversations/locations/{locationId}/messages/{id}/transcription → frases { mediaChannel, startTime (ms), transcript }
// · GET /conversations/messages/{id}/locations/{locationId}/recording → audio WAV
// Deepgram (developers.deepgram.com, 9 oct 2026): POST https://api.deepgram.com/v1/listen?model=nova-3&language=es,
// Authorization: Token …, audio en binario; respuesta results.utterances [{ start, speaker, transcript }].
import { GHL_BASE } from "@/lib/ghl";

type Fetch = typeof fetch;
const VERSION = "2021-04-15";
type MensajeGhl = { id: string; messageType?: string; contactId?: string; userId?: string; dateAdded?: string; direction?: string; meta?: { callDuration?: string | number | null; callStatus?: string | null } | null };
export type Linea = { quien: string; inicio: number; texto: string };

const TIPOS_LLAMADA = ["TYPE_CALL", "TYPE_CAMPAIGN_CALL", "TYPE_CAMPAIGN_MANUAL_CALL", "TYPE_CUSTOM_CALL"];
// Decisión de Cristian: todas las llamadas contestadas de más de 1 minuto
export const esLlamadaUtil = (m: MensajeGhl) => TIPOS_LLAMADA.includes(m.messageType ?? "") && ["completed", "answered"].includes(m.meta?.callStatus ?? "") && Number(m.meta?.callDuration ?? 0) >= 60;

async function pedir(f: Fetch, token: string, ruta: string) {
  const res = await f(`${GHL_BASE}${ruta}`, { headers: { Authorization: `Bearer ${token}`, Version: VERSION, Accept: "application/json" }, cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw new Error("GHL no deja leer las llamadas: añade al token el permiso «conversations/message.readonly».");
  if (res.status === 429) throw new Error("GHL pide esperar (demasiadas peticiones). Prueba en unos minutos.");
  return res;
}

// De la más nueva a la más antigua, hasta llegar a «desde»
export async function llamadasGhl(o: { token: string; locationId: string; desde: Date; fetchImpl?: Fetch; maxPaginas?: number }) {
  const f = o.fetchImpl ?? fetch;
  const fuera: MensajeGhl[] = [];
  let cursor: string | null = null;
  for (let p = 0; p < (o.maxPaginas ?? 30); p++) {
    const q = new URLSearchParams({ locationId: o.locationId, channel: "Call", sortBy: "createdAt", sortOrder: "desc", limit: "100" });
    if (cursor) q.set("cursor", cursor);
    const res = await pedir(f, o.token, `/conversations/messages/export?${q}`);
    if (!res.ok) throw new Error(`GHL respondió ${res.status} al pedir las llamadas.`);
    const j = (await res.json()) as { messages?: MensajeGhl[]; nextCursor?: string | null };
    const ms = j.messages ?? [];
    let viejas = false;
    for (const m of ms) {
      if (m.dateAdded && new Date(m.dateAdded).getTime() < o.desde.getTime()) viejas = true;
      else fuera.push(m);
    }
    cursor = j.nextCursor ?? null;
    if (!cursor || viejas || !ms.length) break;
  }
  return fuera.filter(esLlamadaUtil);
}

// La transcripción que ya hizo GHL (si la subcuenta transcribe llamadas). null si no hay.
export async function transcripcionGhl(o: { token: string; locationId: string; messageId: string; fetchImpl?: Fetch }): Promise<Linea[] | null> {
  const res = await pedir(o.fetchImpl ?? fetch, o.token, `/conversations/locations/${encodeURIComponent(o.locationId)}/messages/${encodeURIComponent(o.messageId)}/transcription`);
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`GHL respondió ${res.status} al pedir la transcripción.`);
  const j = (await res.json()) as unknown;
  const frases = (Array.isArray(j) ? j : j && typeof j === "object" ? Object.values(j).find(Array.isArray) ?? [] : []) as { mediaChannel?: number; startTime?: number; transcript?: string }[];
  const lineas = frases.filter((x) => x?.transcript?.trim()).map((x) => ({ quien: `Canal ${x.mediaChannel ?? "?"}`, inicio: Math.round((Number(x.startTime) || 0) / 1000), texto: x.transcript!.trim() }));
  return lineas.length ? lineas : null;
}

export async function grabacionGhl(o: { token: string; locationId: string; messageId: string; fetchImpl?: Fetch }): Promise<ArrayBuffer | null> {
  const res = await pedir(o.fetchImpl ?? fetch, o.token, `/conversations/messages/${encodeURIComponent(o.messageId)}/locations/${encodeURIComponent(o.locationId)}/recording`);
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`GHL respondió ${res.status} al pedir la grabación.`);
  const audio = await res.arrayBuffer();
  return audio.byteLength > 1000 ? audio : null;
}

export async function transcribirDeepgram(o: { audio: ArrayBuffer; apiKey: string; fetchImpl?: Fetch }): Promise<Linea[]> {
  const q = new URLSearchParams({ model: "nova-3", language: "es", smart_format: "true", utterances: "true", diarize_model: "latest" });
  const res = await (o.fetchImpl ?? fetch)(`https://api.deepgram.com/v1/listen?${q}`, { method: "POST", headers: { Authorization: `Token ${o.apiKey}`, "Content-Type": "audio/wav" }, body: o.audio, cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw new Error("Deepgram no acepta la clave (DEEPGRAM_API_KEY).");
  if (res.status === 402) throw new Error("Deepgram: la cuenta no tiene saldo.");
  if (!res.ok) throw new Error(`Deepgram respondió ${res.status}.`);
  const j = (await res.json()) as { results?: { utterances?: { start?: number; speaker?: number; transcript?: string }[]; channels?: { alternatives?: { transcript?: string }[] }[] } };
  const u = (j.results?.utterances ?? []).filter((x) => x.transcript?.trim());
  if (u.length) return u.map((x) => ({ quien: `Persona ${(x.speaker ?? 0) + 1}`, inicio: Math.round(Number(x.start) || 0), texto: x.transcript!.trim() }));
  const t = j.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
  return t ? [{ quien: "Llamada", inicio: 0, texto: t }] : [];
}

export const textoLineas = (ls: Linea[]) => ls.map((l) => `[${String(Math.floor(l.inicio / 60)).padStart(2, "0")}:${String(l.inicio % 60).padStart(2, "0")}] ${l.quien}: ${l.texto}`).join("\n");
