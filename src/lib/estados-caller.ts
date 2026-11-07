// C11 (plan Callers, 7 nov 2026; decisiones de Cristian): los estados del caller = las 12 columnas del pipeline
// «Callers», en su orden. Sin «No contesta» ni «Link enviado» (los que había pasaron a «Seguimiento», migración
// 20261107150200). Sin fechas: ni hora de «Llamar luego», ni aviso de vencidos, ni vuelta sola a la cola.
export const ESTADOS_CALLER = [
  { v: "nuevo", t: "Leads", color: "#64748b" },
  { v: "llamado", t: "Llamado", color: "#2b59d1" },
  { v: "wsp_enviado", t: "Wsp enviado", color: "#15924a" },
  { v: "no_responde", t: "No responde", color: "#7c8aa3" },
  { v: "no_interesa", t: "No interesa", color: "#d0303f" },
  { v: "seguimiento", t: "Seguimiento", color: "#c98a12" },
  { v: "llamar_luego", t: "Llamar luego", color: "#c46a08" },
  { v: "agendado", t: "Agendado", color: "#3f6ee6" },
  { v: "confirma_agenda", t: "Confirma Agenda", color: "#0891b2" },
  { v: "reagendado", t: "Reagendado", color: "#7c4ddb" },
  { v: "descartado", t: "Descartado", color: "#7b1a22" },
  { v: "vendido", t: "Cerrados", color: "#16a34a" },
] as const;
export type EstadoCaller = (typeof ESTADOS_CALLER)[number]["v"];

// Los 9 botones de «¿Cómo ha ido?» (7c.1). «Leads» es la entrada, «Reagendado» lo pone GHL y «Cerrados» el closer.
export const BOTONES_RESULTADO = ["llamado", "wsp_enviado", "no_responde", "no_interesa", "seguimiento", "llamar_luego", "agendado", "confirma_agenda", "descartado"] as const;
export type BotonResultado = (typeof BOTONES_RESULTADO)[number];

// Punto 16: «contacto» = el lead avanzó (hablaste con él). Llamado, Wsp enviado y No responde no cuentan.
export const AVANZAN: ReadonlySet<string> = new Set(["no_interesa", "seguimiento", "llamar_luego", "agendado", "confirma_agenda", "reagendado", "vendido"]);
// Estrellas de cómo fue la llamada (2 a 5), como hoy (Cristian, 7 nov). Se copian a la cita del closer.
export const CON_ESTRELLAS: ReadonlySet<string> = new Set(["llamar_luego", "no_interesa", "seguimiento", "agendado"]);

// Una actividad del historial ¿es un contacto? Desde el 7 nov los botones apuntan «cambio_etapa» con el estado nuevo;
// antes, «llamada» con su resultado (todo menos «no_contesta» era contestar).
export function esContacto(a: { tipo: string; resultado: string | null }) {
  if (a.tipo === "cambio_etapa") return !!a.resultado && AVANZAN.has(a.resultado);
  if (a.tipo === "cita") return a.resultado === "agendada"; // «Agendado» con su botón (agendarCita)
  if (a.tipo === "llamada") return !!a.resultado && a.resultado !== "no_contesta" && a.resultado !== "llamado";
  return false;
}

const VIEJOS: Record<string, string> = { no_contesta: "No contesta", link_enviado: "Link enviado" };
export const ETIQUETA_ESTADO: Record<string, string> = { ...VIEJOS, ...Object.fromEntries(ESTADOS_CALLER.map((e) => [e.v, e.t])) };
export const etiquetaEstado = (v: string) => ETIQUETA_ESTADO[v] ?? v;
export const colorEstado = (v: string) => ESTADOS_CALLER.find((e) => e.v === v)?.color ?? "#64748b";
