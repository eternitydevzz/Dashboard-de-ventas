import { linksDe, linksValidos, type LinkPago } from "@/lib/links-pago";

// Cristian (13 nov 2026): cada persona del equipo es de Latam o de España (mismo proyecto, CRM y leads).
// España ve sus propios links, recursos, guion y manuales; lo que España no tenga puesto, lo ve de Latam.
export type Mercado = "latam" | "es";
export const MERCADOS: { v: Mercado; t: string }[] = [
  { v: "latam", t: "Latam" },
  { v: "es", t: "España" },
];
export const mercadoValido = (v: unknown): Mercado | null => (v === "latam" || v === "es" ? v : null);

type ProyectoLinks = { link_agenda?: string | null; link_agenda_es?: string | null; link_reserva?: string | null; link_reserva_es?: string | null };
type ProductoLinks = { links_pago?: unknown; links_pago_es?: unknown; link_pago?: string | null };
type ConMercado = { mercado?: string | null };

// El contenido que ve cada mercado. Sin elegir (null) = Latam, lo de siempre.
// `crudo` (quien edita, mirando España): solo lo puesto para España, sin caer en lo de Latam, para no copiarlo al guardar.
export function contenidoMercado(m: Mercado | null, { crudo = false } = {}) {
  const es = m === "es";
  const deEspana = <T extends ConMercado>(filas: T[]) => filas.filter((f) => f.mercado === "es");
  const deLatam = <T extends ConMercado>(filas: T[]) => filas.filter((f) => f.mercado !== "es"); // sin columna aún = Latam
  return {
    mercado: (es ? "es" : "latam") as Mercado,
    // Cristian (13 nov): España paga en euros el mismo número; solo cambia el símbolo
    moneda: (p: { moneda: "USD" | "EUR" }) => (es ? "EUR" : p.moneda) as "USD" | "EUR",
    linkAgenda: (p: ProyectoLinks) => (es ? p.link_agenda_es || (crudo ? null : p.link_agenda) : p.link_agenda) || null,
    linkReserva: (p: ProyectoLinks) => (es ? p.link_reserva_es || (crudo ? null : p.link_reserva) : p.link_reserva) || null,
    linksPago: (p: ProductoLinks): LinkPago[] => {
      if (!es) return linksDe(p);
      const propios = linksValidos(p.links_pago_es);
      return propios.length || crudo ? propios : linksDe(p);
    },
    // Recursos y manuales: los de España si tiene alguno; si no, los de Latam
    filas: <T extends ConMercado>(filas: T[]): T[] => {
      if (!es) return deLatam(filas);
      const propias = deEspana(filas);
      return propias.length || crudo ? propias : deLatam(filas);
    },
    // Guion (una fila por mercado): el de España o, si no hay, el de Latam
    guion: <T extends ConMercado>(filas: T[]): T | null => (es ? deEspana(filas)[0] : undefined) ?? deLatam(filas)[0] ?? null,
  };
}

// Cristian (13 nov): los jefes filtran y agrupan a callers y closers por mercado. Sin elegir (null) = Latam.
export const mercadoDe = (m: unknown): Mercado => (m === "es" ? "es" : "latam");
export const OPCIONES_FILTRO_MERCADO = [
  { v: "es", t: "España" },
  { v: "latam", t: "Latam" },
];
// ¿Entra esta persona con el filtro «Todos / España / Latam»? (filtro null = todos)
export const entraEnMercado = (mercados: Record<string, Mercado>, perfilId: string | null | undefined, filtro: Mercado | null) =>
  !filtro || mercadoDe(perfilId ? mercados[perfilId] : null) === filtro;
