import { unstable_rethrow } from "next/navigation";
import { ErrorUsuario } from "@/lib/error-usuario";
import { guardarError } from "@/lib/errores-app";

// Errores pensados para que los lea el usuario («No tienes permiso», «Pon un nombre»…).
// En producción Next oculta el mensaje de cualquier error lanzado desde una acción,
// así que las acciones DEVUELVEN el error en vez de lanzarlo (guía «expected errors» de Next 16).
export { ErrorUsuario };

export type ConError = { error: string; ok?: undefined };

export function esError(x: unknown): x is ConError {
  return typeof x === "object" && x !== null && "error" in x && typeof (x as ConError).error === "string";
}

// Envuelve el cuerpo de una acción: lo esperado vuelve como { error }, lo inesperado
// se registra en el servidor y el usuario ve un mensaje genérico (sin detalles internos).
export async function seguro<T>(fn: () => Promise<T>): Promise<T | ConError> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e); // redirect(), notFound()… siguen funcionando
    if (e instanceof ErrorUsuario) return { error: e.message };
    console.error("[acción] error inesperado:", e);
    await guardarError("acción", e instanceof Error ? e.message : String(e)); // F3: sale en los avisos del CEO
    return { error: "Algo ha fallado. Inténtalo de nuevo y, si se repite, avisa al director." };
  }
}

// Arreglo 35: las notas tienen un largo máximo (antes, algunas acciones aceptaban cualquier tamaño)
export function notaValida(texto: string | null | undefined, max = 4000) {
  const t = (texto ?? "").trim();
  if (t.length > max) throw new ErrorUsuario(`La nota es demasiado larga (máximo ${String(max).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} caracteres).`);
  return t;
}
