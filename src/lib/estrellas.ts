import { ErrorUsuario } from "@/lib/resultado";

// Estrellas de calidad del lead (aprobadas por Cristian, 9 oct 2026).
// Caller: 1 no responde · 2 responde pero no sabe nada · 3 responde e interesado · 4 quiere saber más · 5 quiere comprar.
//   El caller elige de 2 a 5 (C11, 7 nov: ya no hay «No contesta», que ponía 1 sola).
// Closer, al cerrar la llamada: 1 no califica · 2 poco encaje · 3 encaja pero sin dinero ahora · 4 encaja y paga con plazo · 5 encaja y puede pagar ya.
//   «No califica» pone 1 sola.
export const ESCALA_CALLER = ["No responde", "Responde pero no sabe nada", "Responde y está interesado", "Responde y quiere saber más", "Responde y quiere comprar"];
export const ESCALA_CLOSER = ["No califica", "Poco encaje", "Encaja pero sin dinero ahora", "Encaja y paga con plazo", "Encaja y puede pagar ya"];

export function estrellasEntre(valor: unknown, min: number, max: number) {
  const n = Number(valor);
  if (valor === null || valor === undefined || valor === "" || !Number.isInteger(n) || n < min || n > max) throw new ErrorUsuario(`Elige las estrellas (de ${min} a ${max}).`);
  return n;
}
