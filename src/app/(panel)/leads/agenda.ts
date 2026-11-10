"use server";

import { exigirSeccion } from "@/lib/permisos";
import { getSesion } from "@/lib/auth";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { localAIso } from "@/lib/formato";
import { db } from "@/lib/datos";
import { closerLibreA, tieneHorario } from "@/lib/agenda-libre";
import { ajustesDe, CITA_NO_OCUPA, TEXTO_MOTIVO } from "@/lib/disponibilidad";
import { horarioValido } from "@/lib/horarios";
import { huecosLibres } from "@/lib/huecos";
import { closerDeLaRotacion } from "@/lib/rotacion";

// Al elegir la hora en una ventana de agendar a mano: si el closer elegido está libre (si no, se avisa y se puede
// agendar igual). La rotación de closers se quitó el 11 oct (4.4): el closer de las citas por link lo pone GHL.
export async function consultarAgenda(fechaLocal: string, closerId: string | null) {
  return seguro(async () => {
    await exigirSeccion("cola", "crm", "agendas", "clientes");
    const { proyecto } = await getSesion();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fechaLocal)) throw new ErrorUsuario("Fecha no válida.");
    const inicio = new Date(localAIso(fechaLocal, proyecto.zona_horaria));
    let aviso: string | null = null;
    if (closerId) {
      const libre = await closerLibreA(proyecto, closerId, inicio);
      if (!libre.libre) {
        const sinHorario = libre.motivo === "fuera_horario" && !(await tieneHorario(proyecto.id, closerId));
        const { data: p } = await db().from("perfiles").select("nombre").eq("id", closerId).maybeSingle();
        aviso = `${p?.nombre ?? "Ese closer"}: ${sinHorario ? "no tiene horario puesto" : TEXTO_MOTIVO[libre.motivo].toLowerCase()}.`;
      }
    }
    return { aviso };
  });
}

// Ventana de «Agendado» del caller (plan Callers 7c.3; Cristian, 7 nov): las horas libres del closer de la rotación
// en los próximos 21 días, para el calendario. Se piden al abrir la ventana (no viajan con la cola).
export async function huecosAgendaRotacion(leadId?: string) {
  return seguro(async () => {
    await exigirSeccion("cola", "crm", "agendas", "clientes");
    const { proyecto } = await getSesion();
    // 11 nov: el closer depende del país del lead (el mismo que pondrá agendarCita)
    const { data: lead } = leadId ? await db().from("leads").select("pais").eq("id", leadId).eq("proyecto_id", proyecto.id).maybeSingle() : { data: null };
    const closerId = await closerDeLaRotacion(proyecto.id, (lead?.pais as string | null | undefined) ?? null);
    const ahora = new Date();
    const [{ data: m }, { data: citas, error }] = await Promise.all([
      db().from("miembros_proyecto").select("horario, calendario, perfiles(nombre)").eq("proyecto_id", proyecto.id).eq("perfil_id", closerId).maybeSingle(),
      db().from("citas").select("fecha").eq("closer_id", closerId).gte("fecha", ahora.toISOString()).lte("fecha", new Date(ahora.getTime() + 23 * 86_400_000).toISOString()).not("estado", "in", `(${CITA_NO_OCUPA.join(",")})`),
    ]);
    if (error) throw new Error(`No se pudieron leer las citas: ${error.message}`);
    const horario = horarioValido(m?.horario);
    const dias = huecosLibres({ horario, ajustes: ajustesDe(proyecto.calendario, m?.calendario), citas: (citas ?? []).map((c) => c.fecha as string), ahora, zona: proyecto.zona_horaria, dias: 21 });
    return { closer: (m?.perfiles as unknown as { nombre: string } | null)?.nombre ?? "El closer", sinHorario: !horario, dias, zona: proyecto.zona_horaria };
  });
}
