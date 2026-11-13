import { ErrorUsuario } from "@/lib/resultado";

// C10 (plan Callers, 7 nov): grabaciones de llamadas hechas desde el guion (micrófono del ordenador).
// Cada navegador graba en su formato: Chrome y Firefox en webm/ogg (opus), Safari en mp4 (aac).
const EXT: Record<string, string> = { "audio/webm": "webm", "video/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/mpeg": "mp3" };
const TIPO: Record<string, string> = { webm: "audio/webm", ogg: "audio/ogg", mp4: "audio/mp4", mp3: "audio/mpeg" };

export function extDeTipo(mime: string) {
  return EXT[mime.split(";")[0].trim().toLowerCase()] ?? null;
}
export function tipoGrabacion(ruta: string) {
  return TIPO[ruta.split(".").pop() ?? ""] ?? "audio/webm";
}

export function duracionTexto(seg: number) {
  const s = Math.max(0, Math.floor(seg));
  const dos = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  return h ? `${h}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}` : `${dos(Math.floor(s / 60))}:${dos(s % 60)}`;
}

// Cristian (13 nov): al pulsar un resultado o «Siguiente» la grabación avisa y, si en 30 s no se pulsa
// «Saltar aviso», se para sola (la app no ve cuándo se cuelga el móvil y seguía grabando la vida privada del caller).
export const AVISO_FIN_SEG = 30;
export function quedanAviso(fin: number, ahora: number) {
  return Math.max(0, Math.ceil((fin - ahora) / 1000));
}

export function transcripcionValida(t: unknown) {
  const s = String(t ?? "").trim();
  if (!s) throw new ErrorUsuario("La transcripción está vacía.");
  if (s.length > 200_000) throw new ErrorUsuario("La transcripción es demasiado larga (máximo 200.000 caracteres).");
  return s;
}
