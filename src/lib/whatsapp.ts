import "server-only";

// Fase D (17 nov 2026): WhatsApp solo para el equipo, a través de WAHA (servidor aparte, en Render).
// Envío de texto: POST <WAHA_URL>/api/sendText con X-Api-Key y { session, chatId, text } (documentación de WAHA).
// Variables: WAHA_URL (sin barra final), WAHA_API_KEY y, opcional, WAHA_SESION (por defecto "default").
// Mismo estilo que email.ts: nunca lanza; si falta la configuración no se manda nada y se dice por qué.
const SESION_POR_DEFECTO = "default";
const TIEMPO_MAXIMO_MS = 10_000;
const SIN_CONFIGURAR = "WhatsApp sin configurar (WAHA_URL / WAHA_API_KEY)";

export type ResultadoWhatsapp = { enviados: string[]; fallos: { destino: string; motivo: string }[] };

// Un id que ya viene formado (grupo @g.us o chat @c.us) se deja tal cual si antes de la @ solo hay cifras y
// guiones. Un teléfono se limpia (espacios, guiones, puntos, paréntesis y «+» inicial) y debe tener 8 a 15 cifras.
export function chatIdDe(numero: string | null | undefined): string | null {
  const valor = (numero ?? "").trim();
  if (!valor) return null;
  const formado = /^([0-9-]+)@(g|c)\.us$/.exec(valor);
  if (formado) return /\d/.test(formado[1]) ? valor : null;
  const cifras = valor.replace(/[\s\-.()]/g, "").replace(/^\+/, "");
  return /^\d{8,15}$/.test(cifras) ? `${cifras}@c.us` : null;
}

export function whatsappConfigurado(): boolean {
  return Boolean(process.env.WAHA_URL?.trim() && process.env.WAHA_API_KEY?.trim());
}

// Motivo corto y sin la clave (por si algún mensaje de error la repitiera)
function motivoDeError(e: unknown, clave: string): string {
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "Tiempo agotado (10 s)";
  const texto = e instanceof Error && e.message ? `Error de red: ${e.message}` : "Error de red";
  return texto.split(clave).join("***").slice(0, 200);
}

async function enviarUno(base: string, clave: string, sesion: string, chatId: string, texto: string) {
  try {
    const r = await fetch(`${base}/api/sendText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": clave },
      body: JSON.stringify({ session: sesion, chatId, text: texto }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    return r.ok ? null : `WAHA respondió ${r.status}`;
  } catch (e) {
    return motivoDeError(e, clave);
  }
}

// `destinos` son chatIds (los de chatIdDe). Se quitan repetidos y se hace un POST por destino.
export async function enviarWhatsapp(destinos: string[], texto: string): Promise<ResultadoWhatsapp> {
  const unicos = [...new Set(destinos.map((d) => (d ?? "").trim()).filter(Boolean))];
  const base = (process.env.WAHA_URL ?? "").trim().replace(/\/+$/, "");
  const clave = (process.env.WAHA_API_KEY ?? "").trim();
  if (!base || !clave) return { enviados: [], fallos: unicos.map((destino) => ({ destino, motivo: SIN_CONFIGURAR })) };
  if (!texto?.trim()) return { enviados: [], fallos: unicos.map((destino) => ({ destino, motivo: "Texto vacío" })) };
  const sesion = process.env.WAHA_SESION?.trim() || SESION_POR_DEFECTO;

  const resultados = await Promise.all(
    unicos.map(async (destino) => {
      const chatId = chatIdDe(destino);
      if (!chatId) return { destino, motivo: "Destino no válido" as string | null };
      return { destino: chatId, motivo: await enviarUno(base, clave, sesion, chatId, texto) };
    }),
  );
  return {
    enviados: resultados.filter((r) => r.motivo === null).map((r) => r.destino),
    fallos: resultados.filter((r) => r.motivo !== null).map((r) => ({ destino: r.destino, motivo: r.motivo as string })),
  };
}
