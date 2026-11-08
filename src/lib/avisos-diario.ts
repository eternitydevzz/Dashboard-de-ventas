import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmail } from "@/lib/email";
import { ZONA_CEO, avisosCeo, reporteDia } from "@/lib/avisos-ceo";

// Plan GHL F2 (Cristian, 8 nov 2026): email diario a las 8:00 de Madrid. El programador llama cada 15 min de 06:00 a 07:45 UTC
// (cae en la franja 8:00-8:59 de Madrid en verano y en invierno); solo manda la llamada que cae a las 8 de Madrid, y la tabla avisos_diario evita el segundo email.
const DESTINO = "info@eternity.llc";

export type ResultadoDiario = { estado: "fuera_de_hora" | "ya_enviado" | "enviado" } | { estado: "fallo"; motivo: string };

export async function enviarDiario(proyectoId: string, ahora = new Date()): Promise<ResultadoDiario> {
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: ZONA_CEO, hour: "numeric", hourCycle: "h23" }).format(ahora));
  if (hora !== 8) return { estado: "fuera_de_hora" };
  const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_CEO }).format(ahora);

  // Se reserva la fecha antes de mandar: si dos llamadas coinciden, solo una inserta la fila
  const tabla = () => createAdminClient().from("avisos_diario");
  const { data, error } = await tabla().upsert({ proyecto_id: proyectoId, fecha }, { onConflict: "proyecto_id,fecha", ignoreDuplicates: true }).select();
  if (error) throw new Error(`email diario (reservar fecha): ${error.message}`);
  if (!data?.length) return { estado: "ya_enviado" };

  let motivo = "";
  try {
    const [avisos, rep] = await Promise.all([avisosCeo(proyectoId), reporteDia(proyectoId, ahora)]);
    const texto = [
      `Ayer (${rep.dia}): ${rep.leads} lead(s) y ${rep.agendas} agenda(s).`,
      "",
      avisos.length ? `Avisos:\n${avisos.map((a) => `- ${a.texto}`).join("\n")}` : "Sin avisos.",
    ].join("\n");
    const r = await enviarEmail({ para: [DESTINO], asunto: `Eternity · Resumen del ${rep.dia}`, texto });
    if (r.enviado) return { estado: "enviado" };
    motivo = r.motivo;
  } catch (e) {
    motivo = e instanceof Error ? e.message : "Error desconocido";
  }
  // Si falla, se suelta la fecha: la siguiente llamada de la misma franja (a los 15 min) puede reintentar
  await tabla().delete().eq("proyecto_id", proyectoId).eq("fecha", fecha);
  return { estado: "fallo", motivo };
}
