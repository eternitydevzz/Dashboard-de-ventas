import { db } from "@/lib/datos";
import { ErrorUsuario } from "@/lib/resultado";
import type { ConfigReporte, MercadoReporte, ParteReporte } from "@/lib/tipos";

// Fase C (reporte diario): la configuración del reporte de cada mercado (tabla reporte_config, una fila por
// proyecto y mercado). En pantalla, «es» = España y «latam» = USA. La hora es la de la zona de cada mercado.
export const ZONA_REPORTE: Record<MercadoReporte, string> = { es: "Europe/Madrid", latam: "America/New_York" };

export const MERCADOS_REPORTE: MercadoReporte[] = ["es", "latam"];
export const PARTES_REPORTE: ParteReporte[] = ["por_persona", "totales_dia", "totales_mes", "va_mal", "objetivos"];

const MAX_EMAILS = 10;
const MAX_WHATSAPPS = 10;
const HORA = /^([01]\d|2[0-3]):(00|15|30|45)$/; // el cron llama cada 15 minutos
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/; // la misma regla que el resto de la app (equipo/acciones.ts)
const WHATSAPP = /^\+\d{8,15}$/;

// Lo mismo que los valores por defecto de la tabla
export function configPorDefecto(mercado: MercadoReporte): ConfigReporte {
  return { mercado, activo: true, hora: "21:00", emails: ["info@eternity.llc"], whatsapps: [], partes: [...PARTES_REPORTE] };
}

const esMercado = (x: unknown): x is MercadoReporte => MERCADOS_REPORTE.includes(x as MercadoReporte);

function listaDeTextos(x: unknown, que: string): string[] {
  if (!Array.isArray(x) || x.some((v) => typeof v !== "string")) throw new ErrorUsuario(`La lista de ${que} no es válida.`);
  return x.map((v: string) => v.trim()).filter(Boolean);
}

function sinRepetir(lista: string[], que: string) {
  const vistos = new Set<string>();
  for (const v of lista) {
    const k = v.toLowerCase();
    if (vistos.has(k)) throw new ErrorUsuario(`${que} repetido: ${v}`);
    vistos.add(k);
  }
}

function emailsValidos(x: unknown): string[] {
  const emails = listaDeTextos(x, "emails");
  if (emails.length < 1) throw new ErrorUsuario("Pon al menos un email.");
  if (emails.length > MAX_EMAILS) throw new ErrorUsuario(`Como mucho ${MAX_EMAILS} emails.`);
  const malo = emails.find((e) => !EMAIL.test(e));
  if (malo) throw new ErrorUsuario(`Email no válido: ${malo}`);
  sinRepetir(emails, "Email");
  return emails;
}

// Se aceptan espacios, guiones, puntos y paréntesis al escribirlo; se guarda solo «+» y las cifras
function whatsappsValidos(x: unknown): string[] {
  const numeros = listaDeTextos(x, "WhatsApp").map((v) => v.replace(/[\s\-().]/g, ""));
  if (numeros.length > MAX_WHATSAPPS) throw new ErrorUsuario(`Como mucho ${MAX_WHATSAPPS} números de WhatsApp.`);
  const malo = numeros.find((n) => !WHATSAPP.test(n));
  if (malo) throw new ErrorUsuario(`WhatsApp no válido: ${malo}. Tiene que empezar por «+» y llevar de 8 a 15 cifras.`);
  sinRepetir(numeros, "WhatsApp");
  return numeros;
}

function partesValidas(x: unknown): ParteReporte[] {
  if (!Array.isArray(x)) throw new ErrorUsuario("La lista de partes no es válida.");
  const mala = x.find((p) => !PARTES_REPORTE.includes(p as ParteReporte));
  if (mala !== undefined) throw new ErrorUsuario(`Parte del reporte desconocida: ${String(mala)}`);
  if (!x.length) throw new ErrorUsuario("Elige al menos una parte del reporte.");
  return PARTES_REPORTE.filter((p) => x.includes(p)); // siempre en el mismo orden y sin repetir
}

// Lo que llega de la pantalla (o de cualquier POST): se comprueba todo. El mercado sale del argumento.
export function validarConfig(entrada: unknown, mercado: MercadoReporte): ConfigReporte {
  if (!esMercado(mercado)) throw new ErrorUsuario("Mercado no válido.");
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) throw new ErrorUsuario("Configuración del reporte no válida.");
  const e = entrada as Record<string, unknown>;
  if (typeof e.activo !== "boolean") throw new ErrorUsuario("Falta si el reporte está encendido o apagado.");
  if (typeof e.hora !== "string" || !HORA.test(e.hora)) throw new ErrorUsuario("La hora tiene que ser HH:MM en cuartos de hora (:00, :15, :30 o :45).");
  return { mercado, activo: e.activo, hora: e.hora, emails: emailsValidos(e.emails), whatsapps: whatsappsValidos(e.whatsapps), partes: partesValidas(e.partes) };
}

type FilaReporte = { mercado: string; activo: boolean | null; hora: string | null; emails: string[] | null; whatsapps: string[] | null; partes: string[] | null };

// Las 2 configuraciones del proyecto. Sin fila = la de por defecto. Si la lectura falla, lanza (no enseña la de por defecto).
export async function leerConfigsReporte(proyectoId: string): Promise<Record<MercadoReporte, ConfigReporte>> {
  const { data, error } = await db().from("reporte_config").select("mercado, activo, hora, emails, whatsapps, partes").eq("proyecto_id", proyectoId);
  if (error) throw new Error(`No se pudo leer la configuración del reporte: ${error.message}`);
  const filas = (data ?? []) as FilaReporte[];
  const de = (mercado: MercadoReporte): ConfigReporte => {
    const f = filas.find((x) => x.mercado === mercado);
    const d = configPorDefecto(mercado);
    if (!f) return d;
    return {
      mercado,
      activo: f.activo ?? d.activo,
      hora: f.hora ?? d.hora,
      emails: f.emails ?? d.emails,
      whatsapps: f.whatsapps ?? d.whatsapps,
      partes: PARTES_REPORTE.filter((p) => (f.partes ?? d.partes).includes(p)),
    };
  };
  return { es: de("es"), latam: de("latam") };
}
