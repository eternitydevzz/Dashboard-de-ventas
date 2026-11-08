import "server-only";
import { db } from "@/lib/datos";
import { enviosEnRojo } from "@/lib/entradas-datos";
import { inicioDia, sumarDias } from "@/lib/formato";
import { ABIERTAS } from "@/lib/llamadas";

// Avisos del CEO (plan GHL F1a, Cristian 8 nov 2026): se calculan al momento, sin tabla. Los usan la campana (F1b)
// y el email diario de las 8:00 de Madrid (F2). F3: más los «otros errores» de la app (tabla errores_app).
export const ZONA_CEO = "Europe/Madrid";

export type AvisoCeo = { tipo: "cita_sin_closer" | "envio_rojo" | "workflow_error" | "calendario" | "otro_error"; cuantos: number; texto: string };

// El día de ayer en la zona dada: «YYYY-MM-DD» y su inicio y fin en UTC (23 o 25 horas el día del cambio de hora)
export function diaAnterior(ahora: Date, zona = ZONA_CEO) {
  const ymd = sumarDias(new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(ahora), -1);
  return { ymd, desde: inicioDia(ymd, zona), hasta: inicioDia(sumarDias(ymd, 1), zona) };
}

export async function avisosCeo(proyectoId: string): Promise<AvisoCeo[]> {
  // Se cuentan en la base (count, sin el tope de 1000 filas). Citas sin closer = lo mismo que porRecuperar (llamadas.ts)
  const contar = { count: "exact", head: true } as const;
  const [citas, entradas, workflows, proyecto, errores] = await Promise.all([
    db().from("citas").select("id", contar).eq("proyecto_id", proyectoId).is("closer_id", null).in("estado", [...ABIERTAS]),
    db().from("entradas").select("id").eq("proyecto_id", proyectoId),
    db().from("workflow_ejecuciones").select("id", contar).eq("proyecto_id", proyectoId).eq("estado", "error"),
    db().from("proyectos").select("ghl_ultimo_resultado").eq("id", proyectoId).maybeSingle(),
    // F3: los que pasaron en el último día, del proyecto o sin proyecto (las acciones); uno por sitio y texto
    db().from("errores_app").select("sitio, texto, veces").or(`proyecto_id.eq.${proyectoId},proyecto_id.is.null`).gte("ultimo_en", new Date(Date.now() - 86_400_000).toISOString()).order("ultimo_en", { ascending: false }).limit(20),
  ]);
  for (const [que, r] of [["citas sin closer", citas], ["entradas", entradas], ["workflows con error", workflows], ["última lectura de GHL", proyecto], ["otros errores", errores]] as const)
    if (r.error) throw new Error(`avisos del CEO (${que}): ${r.error.message}`);
  const rojos = await enviosEnRojo(((entradas.data ?? []) as { id: string }[]).map((e) => e.id));
  // La lectura de calendarios solo guarda el resumen («… · 2 calendario(s) sin leer», ghl-sync.ts:~289); «N con error»
  // cuenta también citas y workflows, que van a «otros errores»
  const resumen = (proyecto.data as { ghl_ultimo_resultado: string | null } | null)?.ghl_ultimo_resultado ?? "";
  const errLectura = Number(resumen.match(/(\d+) calendario\(s\) sin leer/)?.[1] ?? 0);

  const sinCloser = citas.count ?? 0;
  const nWorkflows = workflows.count ?? 0;
  const avisos: AvisoCeo[] = [
    { tipo: "cita_sin_closer", cuantos: sinCloser, texto: `${sinCloser} cita(s) sin closer` },
    { tipo: "envio_rojo", cuantos: rojos.length, texto: `${rojos.length} envío(s) en rojo que no llegaron a GHL` },
    { tipo: "workflow_error", cuantos: nWorkflows, texto: `${nWorkflows} ejecución(es) de workflow con error` },
    { tipo: "calendario", cuantos: errLectura, texto: `En la última lectura de GHL, ${errLectura} calendario(s) no se pudieron leer: ${resumen}` },
    ...((errores.data ?? []) as { sitio: string; texto: string; veces: number }[]).map((e) => ({ tipo: "otro_error" as const, cuantos: e.veces, texto: `${e.sitio}: ${e.texto} (${e.veces} ${e.veces === 1 ? "vez" : "veces"})` })),
  ];
  return avisos.filter((a) => a.cuantos > 0);
}

// Reporte del día anterior en Madrid: leads que entraron y citas que se agendaron ese día
export async function reporteDia(proyectoId: string, ahora: Date) {
  const { ymd, desde, hasta } = diaAnterior(ahora);
  const contar = async (tabla: "leads" | "citas") => {
    const { count, error } = await db().from(tabla).select("id", { count: "exact", head: true }).eq("proyecto_id", proyectoId).gte("creado_en", desde.toISOString()).lt("creado_en", hasta.toISOString());
    if (error) throw new Error(`reporte del día (${tabla}): ${error.message}`);
    return count ?? 0;
  };
  const [leads, agendas] = await Promise.all([contar("leads"), contar("citas")]);
  return { dia: ymd, leads, agendas };
}
