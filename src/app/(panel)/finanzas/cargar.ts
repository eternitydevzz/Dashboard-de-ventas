import "server-only";
import { db, equipo } from "@/lib/datos";
import { cargarFinanzas } from "@/lib/finanzas-datos";
import type { Proyecto } from "@/lib/tipos";

export type DatosFinanzas = Awaited<ReturnType<typeof cargarPantallaFinanzas>>;

// Todo lo que necesita la pantalla de Finanzas: finanzas + nombres (leads, personas, productos)
export async function cargarPantallaFinanzas(proyecto: Proyecto) {
  const [f, gente, programados, cambio] = await Promise.all([
    cargarFinanzas(proyecto.id),
    equipo(proyecto.id),
    db().from("egresos_programados").select("*").eq("proyecto_id", proyecto.id).order("proxima"),
    db().from("tipos_cambio").select("por_usd").eq("proyecto_id", proyecto.id).eq("moneda", "EUR").maybeSingle(),
  ]);
  // si la base falla, error.tsx en vez de una pantalla vacía como si no hubiera nada
  for (const [r, que] of [[programados, "los gastos programados"], [cambio, "el tipo de cambio"]] as const)
    if (r.error) throw new Error(`No se pudo leer ${que}: ${r.error.message}`);
  const ids = [...new Set([...f.ventas.map((v) => v.lead_id), ...f.vencimientos.map((v) => v.lead_id).filter((x): x is string => !!x)])];
  const leads = new Map<string, { nombre: string; email: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db().from("leads").select("id, nombre, apellido, email").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`No se pudieron leer los leads: ${error.message}`);
    for (const l of data ?? []) leads.set(l.id, { nombre: `${l.nombre} ${l.apellido ?? ""}`.trim(), email: l.email });
  }
  return {
    ...f,
    gente,
    persona: new Map(gente.map((g) => [g.id, g])),
    leads,
    producto: new Map(f.productos.map((p) => [p.id, p.nombre as string])),
    programados: (programados.data ?? []) as { id: string; descripcion: string; importe: number; categoria_id: string | null; cuenta_id: string | null; cada: "semana" | "mes" | "anio"; proxima: string; activo: boolean }[],
    porUsd: cambio.data ? Number(cambio.data.por_usd) : null,
  };
}
