import type { Pipeline } from "@/lib/tipos";

// C8 (plan Callers, 7 nov; maqueta «Mi CRM»): el pipeline «Callers» es el mismo para todos, pero a cada caller se le
// enseña como «<Su nombre> Caller» (ya solo ve sus leads, crm/page.tsx). Jefes y closers lo siguen viendo «Callers».
// Solo cambia el texto que se ve: nada de la app busca el pipeline por su nombre.
export function nombreVisiblePipeline(p: Pick<Pipeline, "nombre" | "tipo">, quien: { rol: string; nombre: string }) {
  if (p.tipo !== "callers" || quien.rol !== "caller") return p.nombre;
  const pila = quien.nombre.trim().split(/\s+/)[0] || quien.nombre;
  return `${pila} Caller`;
}
