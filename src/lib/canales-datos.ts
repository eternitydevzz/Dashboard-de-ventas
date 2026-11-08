import "server-only";
import { db } from "@/lib/datos";
import { CANALES_POR_DEFECTO, type TablaCanales } from "@/lib/canal";

// Plan GHL B2b: los canales del proyecto (tabla `canales`), en su orden. Sin filas, los de siempre: así nacen los
// proyectos nuevos y los de los tests. canal.ts no lee la base porque lo importa un componente cliente.
export async function canalesDe(proyectoId: string): Promise<TablaCanales> {
  const { data, error } = await db().from("canales").select("clave, nombre, alias, paginas").eq("proyecto_id", proyectoId).order("orden");
  if (error) throw new Error(`No se pudieron leer los canales: ${error.message}`);
  return data?.length ? (data as TablaCanales) : CANALES_POR_DEFECTO;
}
