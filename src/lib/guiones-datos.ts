import "server-only";
import { db } from "@/lib/datos";
import { GUION_EJEMPLO, guionValido, type Guion, type RolGuion } from "@/lib/guiones";
import { getSesion } from "@/lib/sesion";
import { contenidoMercado, type Mercado } from "@/lib/mercado";
import { miMercado } from "@/lib/mercado-datos";

// Fase 6: el guion guardado del proyecto o, si no hay (o la base aún no tiene la tabla), el de ejemplo.
// 13 nov: el de su mercado (España cae en el de Latam). Sin `mercado`, el de quien ha entrado.
// `propio` = hay uno guardado para ese mercado (para «Volver al de…» en el editor).
export async function cargarGuion(proyectoId: string, rol: RolGuion, mercado?: Mercado | null): Promise<{ guion: Guion; deEjemplo: boolean; propio: boolean }> {
  const m = mercado !== undefined ? mercado : await miMercado(proyectoId, (await getSesion()).perfil.id);
  const { data, error } = await db().from("guiones").select("*").eq("proyecto_id", proyectoId).eq("rol", rol);
  const fila = !error ? contenidoMercado(m).guion((data ?? []) as { mercado?: string; contenido: unknown }[]) : null;
  const g = fila ? guionValido(fila.contenido) : null;
  const propio = !!fila && (fila.mercado ?? "latam") === (m === "es" ? "es" : "latam");
  return g ? { guion: g, deEjemplo: false, propio } : { guion: GUION_EJEMPLO[rol], deEjemplo: true, propio: false };
}

// El guion que ve quien llama: el del closer para los closers; el del caller para el resto
export const rolDelGuion = (rol: string): RolGuion => (rol === "closer" ? "closer" : "caller");

type MarcaGuardada = { id: string; lead_id: string; perfil_id: string | null; rol: RolGuion; hechos: number; total: number; resultado: string | null; creado_en: string };

export async function ultimasMarcas(proyectoId: string, limite = 200): Promise<{ filas: MarcaGuardada[]; sinTabla: boolean }> {
  const { data, error } = await db().from("guion_marcas").select("id, lead_id, perfil_id, rol, hechos, total, resultado, creado_en").eq("proyecto_id", proyectoId).order("creado_en", { ascending: false }).limit(limite);
  if (error) return { filas: [], sinTabla: true };
  return { filas: (data ?? []) as MarcaGuardada[], sinTabla: false };
}
