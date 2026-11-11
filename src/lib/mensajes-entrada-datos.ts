import "server-only";
import { db } from "@/lib/datos";
import { rangoDe } from "@/lib/formato";
import type { NumerosCaller, NumerosCloser } from "@/lib/mensajes-entrada";

// Números de la ventana de entrada. Solo cuentas (count con head: nada de filas), una vez al abrir la app:
// 4 consultas pequeñas por caller o closer (más 1 si hubo ventas hoy en el proyecto).
const contar = { count: "exact", head: true } as const;
const iso = (d: Date | null) => (d as Date).toISOString();

async function cuenta(q: PromiseLike<{ count: number | null; error: { message: string } | null }>, que: string) {
  const { count, error } = await q;
  if (error) throw new Error(`mensajes de entrada (${que}): ${error.message}`);
  return count ?? 0;
}

export async function numerosCaller(perfilId: string, proyectoId: string, zona: string): Promise<NumerosCaller> {
  const hoy = rangoDe("hoy", zona), semana = rangoDe("semana", zona);
  const citas = () => db().from("citas").select("id", contar).eq("proyecto_id", proyectoId).eq("agendada_por", perfilId);
  const [llamadasHoy, agendasHoy, agendasSemana, ventas] = await Promise.all([
    cuenta(db().from("actividades").select("id", contar).eq("proyecto_id", proyectoId).eq("perfil_id", perfilId).eq("tipo", "llamada").gte("creado_en", iso(hoy.desde)), "llamadas de hoy"),
    cuenta(citas().gte("creado_en", iso(hoy.desde)), "agendas de hoy"),
    cuenta(citas().gte("creado_en", iso(semana.desde)), "agendas de la semana"),
    db().from("ventas").select("lead_id").eq("proyecto_id", proyectoId).gte("creado_en", iso(hoy.desde)).limit(200),
  ]);
  if (ventas.error) throw new Error(`mensajes de entrada (ventas de hoy): ${ventas.error.message}`);
  const leads = [...new Set((ventas.data ?? []).map((v) => v.lead_id as string))];
  // ¿Alguna venta de hoy es de un lead que agendó este caller?
  const ventasDeSusAgendasHoy = leads.length ? await cuenta(citas().in("lead_id", leads), "ventas de sus agendas") : 0;
  return { llamadasHoy, agendasHoy, agendasSemana, ventasDeSusAgendasHoy };
}

export async function numerosCloser(perfilId: string, proyectoId: string, zona: string): Promise<NumerosCloser> {
  const hoy = rangoDe("hoy", zona), semana = rangoDe("semana", zona), mes = rangoDe("mes", zona);
  const citas = () => db().from("citas").select("id", contar).eq("proyecto_id", proyectoId).eq("closer_id", perfilId);
  const ventas = () => db().from("ventas").select("id", contar).eq("proyecto_id", proyectoId).eq("vendedor_id", perfilId);
  const [agendasNuevasHoy, agendasSemana, ventasHoy, ventasMes] = await Promise.all([
    cuenta(citas().gte("creado_en", iso(hoy.desde)), "agendas nuevas de hoy"),
    // las llamadas que tiene esta semana (por la fecha de la cita, no por cuándo se agendó)
    cuenta(citas().gte("fecha", iso(semana.desde)).lt("fecha", iso(semana.hasta)), "agendas de la semana"),
    cuenta(ventas().gte("fecha", iso(hoy.desde)), "ventas de hoy"),
    cuenta(ventas().gte("fecha", iso(mes.desde)), "ventas del mes"),
  ]);
  return { agendasNuevasHoy, agendasSemana, ventasHoy, ventasMes };
}
