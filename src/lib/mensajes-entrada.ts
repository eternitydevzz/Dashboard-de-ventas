import type { Rol } from "@/lib/tipos";

// Bienvenida con mensajes (Cristian, 11 nov 2026; maqueta docs/maqueta-bienvenida.html). Lo puro va aquí (con test);
// las consultas, en mensajes-entrada-datos.ts.

// Las 3 secciones que se precargan al abrir la app, fijas por rol (Cristian, 11 nov: «máximo 3», no las 16 de octubre,
// que saturaban la base). Solo cuentan las que la persona tiene en su menú.
export const PRECARGA_ROL: Record<Rol, string[]> = {
  caller: ["/caller", "/crm", "/mi-funnel"],
  closer: ["/closer", "/crm", "/mi-funnel"],
  director: ["/kpis", "/caller", "/closer"],
  ceo: ["/kpis", "/crm", "/closer"],
};

export type ClaveMensaje =
  | "motivacion" | "grabacion"
  | "ll100" | "ll150" | "ag1" | "ag3" | "ag5" | "venta_agenda"
  | "cag3" | "cag10" | "v1" | "v3" | "v5";

// Felicitaciones: si sale una nueva en el día, la ventana vuelve a abrirse aunque ya se viera ese día
const FELICITACIONES: ClaveMensaje[] = ["ll100", "ll150", "ag1", "ag3", "ag5", "venta_agenda", "cag3", "cag10", "v1", "v3", "v5"];

export type NumerosCaller = { llamadasHoy: number; agendasHoy: number; agendasSemana: number; ventasDeSusAgendasHoy: number };
export type NumerosCloser = { agendasNuevasHoy: number; agendasSemana: number; ventasHoy: number; ventasMes: number };

// Umbrales (Cristian, 11 nov): motivación por debajo de 50 llamadas al día; hitos a las 100 y 150. Agendas del caller
// 1/3/5 en la semana; del closer, 3/10. Ventas del closer 1/3/5 en el mes. Las de agendas y ventas solo salen el día en
// que hay una nueva (si no, la misma felicitación saldría todos los días de la semana o del mes).
export function mensajesCaller(n: NumerosCaller): ClaveMensaje[] {
  const m: ClaveMensaje[] = [];
  if (n.ventasDeSusAgendasHoy > 0) m.push("venta_agenda");
  if (n.llamadasHoy >= 150) m.push("ll150");
  else if (n.llamadasHoy >= 100) m.push("ll100");
  if (n.agendasHoy > 0) {
    if (n.agendasSemana >= 5) m.push("ag5");
    else if (n.agendasSemana >= 3) m.push("ag3");
    else if (n.agendasSemana >= 1) m.push("ag1");
  }
  if (n.llamadasHoy < 50) m.push("motivacion");
  m.push("grabacion");
  return m;
}

export function mensajesCloser(n: NumerosCloser): ClaveMensaje[] {
  const m: ClaveMensaje[] = [];
  if (n.ventasHoy > 0) m.push(n.ventasMes >= 5 ? "v5" : n.ventasMes >= 3 ? "v3" : "v1");
  if (n.agendasNuevasHoy > 0) {
    if (n.agendasSemana >= 10) m.push("cag10");
    else if (n.agendasSemana >= 3) m.push("cag3");
  }
  m.push("grabacion");
  return m;
}

// Cookie «día|clave,clave» con las felicitaciones ya vistas hoy. Se abre si es otro día o hay una felicitación nueva.
export function tocaVentana(cookie: string | undefined, hoy: string, mensajes: ClaveMensaje[]) {
  const [dia, vistas = ""] = (cookie ?? "").split("|");
  const felicitaciones = mensajes.filter((m) => FELICITACIONES.includes(m));
  const nuevaCookie = `${hoy}|${felicitaciones.join(",")}`;
  if (dia !== hoy) return { toca: true, nuevaCookie };
  const yaVistas = new Set(vistas.split(",").filter(Boolean));
  const hayNueva = felicitaciones.some((f) => !yaVistas.has(f));
  return { toca: hayNueva, nuevaCookie: `${hoy}|${[...new Set([...yaVistas, ...felicitaciones])].join(",")}` };
}
