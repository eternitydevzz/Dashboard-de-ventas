import "server-only";
import { db } from "@/lib/datos";
import { enviarEmail } from "@/lib/email";
import { leerConfigsReporte, ZONA_REPORTE } from "@/lib/reporte-config";
import { datosReporte } from "@/lib/reporte-diario-datos";
import { fechaReporte, textoReporte } from "@/lib/reporte-diario";
import type { MercadoReporte, Proyecto } from "@/lib/tipos";

// Fase C: el envío del reporte diario por email (mismo patrón que el email de las 8:00, avisos-diario.ts).
// El cron llama cada 15 min todo el día (migración 20261125100000_reporte_diario.sql). Se manda si el reporte está
// encendido y en su zona (Madrid para «es», Nueva York para «latam») ya es su hora o más tarde; la fila de
// reporte_envios (proyecto, mercado, fecha de su zona) evita el segundo envío del día. WhatsApp: Fase D, aún no.

type ResultadoReporte = { estado: "apagado" | "fuera_de_hora" | "ya_enviado" | "enviado" } | { estado: "fallo"; motivo: string };

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "Error desconocido");

// «HH:MM» en la zona (en-GB con h23 da «00:05», no «24:05»); se compara como texto con la hora de la config
const horaLocal = (ahora: Date, zona: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ahora);

async function leerProyecto(proyectoId: string): Promise<Proyecto> {
  const { data, error } = await db().from("proyectos").select("*").eq("id", proyectoId).maybeSingle<Proyecto>();
  if (error) throw new Error(`reporte diario (leer proyecto): ${error.message}`);
  if (!data) throw new Error("reporte diario: el proyecto no existe");
  return data;
}

export async function enviarReporte(proyectoId: string, mercado: MercadoReporte, ahora = new Date()): Promise<ResultadoReporte> {
  let config;
  try {
    config = (await leerConfigsReporte(proyectoId))[mercado];
  } catch (e) {
    return { estado: "fallo", motivo: mensaje(e) };
  }
  if (!config.activo) return { estado: "apagado" };
  const zona = ZONA_REPORTE[mercado];
  if (horaLocal(ahora, zona) < config.hora) return { estado: "fuera_de_hora" };
  const fecha = fechaReporte(ahora, zona);

  // Se reserva la fecha antes de mandar: si dos llamadas coinciden, solo una inserta la fila
  const tabla = () => db().from("reporte_envios");
  const { data, error } = await tabla()
    .upsert({ proyecto_id: proyectoId, mercado, fecha }, { onConflict: "proyecto_id,mercado,fecha", ignoreDuplicates: true })
    .select();
  if (error) return { estado: "fallo", motivo: `reporte diario (reservar fecha): ${error.message}` };
  if (!data?.length) return { estado: "ya_enviado" };

  let motivo = "";
  try {
    const proyecto = await leerProyecto(proyectoId);
    const { asunto, texto, html } = textoReporte(await datosReporte(proyecto, mercado, ahora), config.partes);
    const r = await enviarEmail({ para: config.emails, asunto, texto, html });
    if (r.enviado) return { estado: "enviado" };
    motivo = r.motivo;
  } catch (e) {
    motivo = mensaje(e);
  }
  // Si falla, se suelta la fecha: la siguiente llamada del cron (a los 15 min) puede reintentar
  const { error: errorSoltar } = await tabla().delete().eq("proyecto_id", proyectoId).eq("mercado", mercado).eq("fecha", fecha);
  if (errorSoltar) motivo = `${motivo} (y no se pudo soltar la fecha: ${errorSoltar.message})`;
  return { estado: "fallo", motivo };
}
