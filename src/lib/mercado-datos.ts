import "server-only";
import { cache } from "react";
import { db } from "@/lib/datos";
import { contenidoMercado, mercadoDe, mercadoValido, type Mercado } from "@/lib/mercado";
import type { Proyecto } from "@/lib/tipos";

// El mercado que eligió la persona en este proyecto. `undefined` = no es miembro o la base aún no tiene la
// columna (no se le pregunta); null = sin elegir. Una vez por petición.
export const leerMercado = cache(async (proyectoId: string, perfilId: string): Promise<Mercado | null | undefined> => {
  const { data, error } = await db().from("miembros_proyecto").select("mercado").eq("proyecto_id", proyectoId).eq("perfil_id", perfilId).maybeSingle();
  if (error || !data) return undefined;
  return mercadoValido(data.mercado);
});

// El mercado de cada persona del proyecto (perfil_id → «es» / «latam»). Si la base aún no tiene la columna, vacío = todos Latam.
export const mercadosDelProyecto = cache(async (proyectoId: string): Promise<Record<string, Mercado>> => {
  const { data, error } = await db().from("miembros_proyecto").select("perfil_id, mercado").eq("proyecto_id", proyectoId);
  if (error) return {};
  return Object.fromEntries((data ?? []).map((m) => [m.perfil_id as string, mercadoDe(m.mercado)]));
});

export const miMercado = async (proyectoId: string, perfilId: string) => (await leerMercado(proyectoId, perfilId)) ?? null;

// Lo que se enseña en una pantalla: quien edita elige «Latam / España» con ?mercado= (por defecto Latam, lo de hoy);
// el resto ve lo de su mercado
export async function mercadoVista(editor: boolean, param: unknown, proyectoId: string, perfilId: string): Promise<Mercado | null> {
  return editor ? (mercadoValido(param) ?? "latam") : miMercado(proyectoId, perfilId);
}

// El link de agenda que copia quien llama (el de su mercado)
export async function miLinkAgenda(proyecto: Proyecto, perfilId: string) {
  return contenidoMercado(await miMercado(proyecto.id, perfilId)).linkAgenda(proyecto);
}

// La moneda en que ve los precios y registra ventas: € para España (mismo número; Cristian, 13 nov)
export async function miMoneda(proyecto: Proyecto, perfilId: string) {
  return contenidoMercado(await miMercado(proyecto.id, perfilId)).moneda(proyecto);
}
