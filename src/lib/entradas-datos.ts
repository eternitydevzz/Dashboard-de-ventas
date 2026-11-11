import "server-only";
import { db, todas } from "@/lib/datos";
import { hoyEnZona, inicioDia, sumarDias } from "@/lib/formato";
import { porDia } from "@/lib/entradas-panel";

// Panel de endpoints (plan GHL, punto 0, Cristian 7 nov 2026): lecturas de la pestaña Entradas.

export type ResumenEntrada = { envios: number; leads: number; rojos: number; ultimo: string | null };
export type EnvioEntrada = {
  id: string;
  entrada_id: string;
  lead_id: string | null;
  procesado: boolean;
  error: string | null;
  recibido_en: string;
  payload: Record<string, unknown>;
  ghl_estado?: "esperando" | "ok" | "error" | null;
  ghl_intentos?: number;
  ghl_error?: string | null;
};
export const COLUMNAS_ENVIO = "id, entrada_id, lead_id, procesado, error, recibido_en, payload, ghl_estado, ghl_intentos, ghl_error";
export const ULTIMOS = 15; // los que se ven al abrir
export const VER_MAS = 50; // los que trae cada «Ver más» (cada envío lleva el formulario entero)

// Envíos, leads distintos, rojos y el último de cada Entrada del proyecto, en una consulta (migración 20261107140000)
export async function resumenEntradas(proyectoId: string) {
  const { data, error } = await db().rpc("resumen_entradas", { p_proyecto: proyectoId });
  if (error) throw new Error(`resumen_entradas: ${error.message}`);
  const m = new Map<string, ResumenEntrada>();
  for (const f of (data ?? []) as { entrada_id: string; envios: number; leads: number; rojos: number; ultimo: string | null }[])
    m.set(f.entrada_id, { envios: Number(f.envios), leads: Number(f.leads), rojos: Number(f.rojos), ultimo: f.ultimo });
  return m;
}

// Todos los envíos en rojo (los que no llegaron a GHL), sin límite: salen siempre arriba con «Reintentar»
export async function enviosEnRojo(entradaIds: string[]) {
  if (!entradaIds.length) return [];
  const { data, error } = await db().from("webhook_eventos").select(COLUMNAS_ENVIO).in("entrada_id", entradaIds).eq("ghl_estado", "error").order("recibido_en", { ascending: false });
  if (error) throw new Error(`envíos en rojo: ${error.message}`);
  return (data ?? []) as EnvioEntrada[];
}

// Una página de envíos de una Entrada, del más nuevo al más viejo
export async function enviosDeEntrada(entradaId: string, desde: number, cuantos: number) {
  const { data, error } = await db().from("webhook_eventos").select(COLUMNAS_ENVIO).eq("entrada_id", entradaId).order("recibido_en", { ascending: false }).range(desde, desde + cuantos - 1);
  if (error) throw new Error(`envíos de la Entrada: ${error.message}`);
  return (data ?? []) as EnvioEntrada[];
}

// Rediseño de Entradas (Cristian, 11 nov 2026): envíos por día de los últimos `dias` días, para el gráfico de cada tarjeta
export const DIAS_GRAFICO = 14;
export async function enviosPorDia(entradaIds: string[], zona: string, dias = DIAS_GRAFICO) {
  if (!entradaIds.length) return new Map<string, number[]>();
  const hoy = hoyEnZona(zona);
  const desde = inicioDia(sumarDias(hoy, -(dias - 1)), zona).toISOString();
  const filas = await todas<{ entrada_id: string; recibido_en: string }>((a, b) =>
    db().from("webhook_eventos").select("entrada_id, recibido_en").in("entrada_id", entradaIds).gte("recibido_en", desde).order("id").range(a, b)
  );
  return porDia(filas, dias, hoy, zona);
}
