import "server-only";
import { enMemoria, UN_MINUTO } from "@/lib/memoria";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Perfil } from "@/lib/tipos";

export const db = () => createAdminClient();

// Arreglo 22: una escritura que falla no puede acabar en «Guardado». Si hay error, se corta la acción:
// el usuario ve el mensaje genérico de error (seguro) y el detalle queda en el registro del servidor.
export async function escribir<T extends { error: { message: string } | null }>(peticion: PromiseLike<T>, tabla: string): Promise<T> {
  const r = await peticion;
  if (r.error) throw new Error(`No se pudo guardar en «${tabla}»: ${r.error.message}`);
  return r;
}

// Supabase devuelve como mucho 1000 filas por consulta: esto pagina.
export async function todas<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  // 25 oct 2026 (Cristian, la base se saturó con el equipo trabajando): primero UNA página y, solo si viene llena,
  // las siguientes de 2 en 2. Antes se pedían 8 a la vez siempre (Paso G, 10 oct): casi todas volvían vacías y eran
  // la mayoría de las peticiones a Supabase. Mismas filas y en el mismo orden; se para en la primera incompleta.
  const out: T[] = [];
  const paso = 1000;
  for (let pagina = 0, aLaVez = 1; ; pagina += aLaVez, aLaVez = 2) {
    const paginas = await Promise.all(
      Array.from({ length: aLaVez }, (_, k) => {
        const i = (pagina + k) * paso;
        return consulta(i, i + paso - 1);
      })
    );
    for (const { data, error } of paginas) {
      if (error) throw new Error(error.message);
      out.push(...(data ?? []));
      if (!data || data.length < paso) return out;
    }
  }
}

// Ola 3 (C9): un `.in()` con hasta 2.000 ids no cabe en la dirección de la petición: se parte en trozos de 200
export const trozos = <T>(lista: T[], n = 200): T[][] => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, (i + 1) * n));

// Todas las filas de esos ids (trozos de 200, cada uno paginado con `todas`); si una lectura falla, lanza
export async function porTrozos<T>(
  ids: string[],
  consulta: (trozo: string[], desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (const t of trozos(ids)) out.push(...(await todas<T>((d, h) => consulta(t, d, h))));
  return out;
}

// 1.0 (Cristian, 11 oct): los perfiles de prueba no salen en el equipo (cifras, reparto, liquidaciones,
// Equipo y filtros); `conPrueba` los incluye, para que un perfil de prueba vea a los otros de prueba.
// 25 oct 2026: el equipo se guarda 1 minuto en memoria (lib/memoria.ts); se borra al guardar en Equipo o Administración
export function equipo(proyectoId: string, conPrueba = false): Promise<Perfil[]> {
  return enMemoria(`equipo:${proyectoId}:${conPrueba}`, UN_MINUTO, () => equipoDeLaBase(proyectoId, conPrueba));
}

async function equipoDeLaBase(proyectoId: string, conPrueba: boolean): Promise<Perfil[]> {
  const { data, error } = await db()
    .from("miembros_proyecto")
    .select("orden, perfiles(*)")
    .eq("proyecto_id", proyectoId)
    .order("orden");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as { perfiles: Perfil }[]).map((m) => m.perfiles).filter((p) => p.activo && (conPrueba || !p.es_prueba));
}

// Arreglos 10 y 11: quien se desactiva o se quita del proyecto deja de estar en equipo(), pero lo que
// vendió o agendó sigue contando (comisiones del mes, métricas del pasado). Añade a esas personas
// (las que salen en `ids`) con «(baja)» en el nombre.
export async function conBajas(activos: Perfil[], ids: (string | null | undefined)[]): Promise<(Perfil & { baja?: true })[]> {
  const enEquipo = new Set(activos.map((a) => a.id));
  const faltan = [...new Set(ids.filter((x): x is string => !!x && !enEquipo.has(x)))];
  if (!faltan.length) return activos;
  const { data, error } = await db().from("perfiles").select("*").in("id", faltan);
  if (error) throw new Error(error.message);
  return [...activos, ...((data ?? []) as Perfil[]).filter((p) => !p.es_prueba).map((p) => ({ ...p, nombre: `${p.nombre} (baja)`, baja: true as const }))];
}

export async function registrarActividad(a: {
  proyecto_id: string;
  lead_id: string;
  perfil_id: string | null;
  tipo: string;
  resultado?: string | null;
  nota?: string | null;
}) {
  // El historial es secundario: si falla, se apunta en el registro del servidor y la acción sigue (arreglo 22)
  const { error } = await db().from("actividades").insert(a);
  if (error) console.error("[actividad] no se pudo guardar:", error.message);
  await db().from("leads").update({ ultima_actividad: new Date().toISOString() }).eq("id", a.lead_id);
}

// Ids de los perfiles de prueba (1.0): sus llamadas, citas y ventas no cuentan en las cifras del equipo
export async function idsDePrueba(): Promise<Set<string>> {
  const { data, error } = await db().from("perfiles").select("id").eq("es_prueba", true);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((p) => p.id as string));
}

// Quita de las cifras lo hecho por perfiles de prueba (1.0): actividades suyas, citas de un closer de prueba o
// agendadas por un caller de prueba, ventas de un vendedor de prueba y los cobros de esas ventas
export const deVerdad = (prueba: Set<string>) => (id: string | null | undefined) => !id || !prueba.has(id);
