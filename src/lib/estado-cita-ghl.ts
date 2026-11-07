// Encargo de Callers (plan Callers C11 punto 15 y F21; con el OK de Cristian, 7 nov 2026): qué le pasa al lead cuando
// llega una cita de GHL (webhook de citas y lectura de cada minuto). Una sola regla para los dos sitios:
// - vendido: no se toca (ni estado ni etiqueta);
// - confirma agenda o descartado: vuelve a reservar → «reagendado» y la etiqueta «Reagendado»;
// - el resto: «agendado», como hasta ahora.
// Solo devuelve estados de los 12 del caller (src/lib/estados-caller.ts).
export const ETIQUETA_REAGENDADO = "Reagendado";

export function estadoTrasCitaGhl(actual: string | null | undefined): { estado: "agendado" | "reagendado"; etiqueta: string | null } | null {
  if (actual === "vendido") return null;
  if (actual === "confirma_agenda" || actual === "descartado") return { estado: "reagendado", etiqueta: ETIQUETA_REAGENDADO };
  return { estado: "agendado", etiqueta: null };
}
