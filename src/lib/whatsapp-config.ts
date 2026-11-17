import { db } from "@/lib/datos";
import { ErrorUsuario } from "@/lib/resultado";
import type { ConfigWhatsapp, EventoWhatsapp } from "@/lib/tipos";

// Fase D (Jose, 17 nov 2026): los avisos por WhatsApp al equipo (tabla whatsapp_config, una fila por proyecto y evento).
// «cita» = cita agendada, «venta» = venta cerrada. Sin fila = encendido y a los tres (closer, caller y grupo de los CEO).
export const EVENTOS_WHATSAPP: EventoWhatsapp[] = ["cita", "venta"];

const GRUPO = /^[0-9-]+@g\.us$/; // el mismo CHECK que proyectos.whatsapp_grupo en la base
const CAMPOS = ["activo", "a_closer", "a_caller", "a_grupo"] as const;

// Lo mismo que «sin fila» en la tabla
export function configWhatsappPorDefecto(evento: EventoWhatsapp): ConfigWhatsapp {
  return { evento, activo: true, a_closer: true, a_caller: true, a_grupo: true };
}

const esEvento = (x: unknown): x is EventoWhatsapp => EVENTOS_WHATSAPP.includes(x as EventoWhatsapp);

// Lo que llega de la pantalla (o de cualquier POST): se comprueba todo. El evento sale del argumento.
export function validarConfigWhatsapp(entrada: unknown, evento: EventoWhatsapp): ConfigWhatsapp {
  if (!esEvento(evento)) throw new ErrorUsuario("Aviso de WhatsApp no válido.");
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) throw new ErrorUsuario("Configuración del aviso no válida.");
  const e = entrada as Record<string, unknown>;
  if (CAMPOS.some((k) => typeof e[k] !== "boolean")) throw new ErrorUsuario("Configuración del aviso no válida: cada opción es sí o no.");
  return { evento, activo: e.activo as boolean, a_closer: e.a_closer as boolean, a_caller: e.a_caller as boolean, a_grupo: e.a_grupo as boolean };
}

// El id del grupo de los CEO. Vacío = sin grupo (null).
export function grupoValido(v: unknown): string | null {
  if (typeof v !== "string") throw new ErrorUsuario("El id del grupo tiene que terminar en @g.us");
  const limpio = v.trim();
  if (!limpio) return null;
  if (!GRUPO.test(limpio)) throw new ErrorUsuario("El id del grupo tiene que terminar en @g.us");
  return limpio;
}

type FilaWhatsapp = { evento: string; activo: boolean | null; a_closer: boolean | null; a_caller: boolean | null; a_grupo: boolean | null };

// Las 2 configuraciones del proyecto. Sin fila = la de por defecto. Si la lectura falla, lanza (no enseña la de por defecto).
export async function leerConfigsWhatsapp(proyectoId: string): Promise<Record<EventoWhatsapp, ConfigWhatsapp>> {
  const { data, error } = await db().from("whatsapp_config").select("evento, activo, a_closer, a_caller, a_grupo").eq("proyecto_id", proyectoId);
  if (error) throw new Error(`No se pudo leer la configuración de los avisos de WhatsApp: ${error.message}`);
  const filas = (data ?? []) as FilaWhatsapp[];
  const de = (evento: EventoWhatsapp): ConfigWhatsapp => {
    const f = filas.find((x) => x.evento === evento);
    const d = configWhatsappPorDefecto(evento);
    if (!f) return d;
    return { evento, activo: f.activo ?? d.activo, a_closer: f.a_closer ?? d.a_closer, a_caller: f.a_caller ?? d.a_caller, a_grupo: f.a_grupo ?? d.a_grupo };
  };
  return { cita: de("cita"), venta: de("venta") };
}
