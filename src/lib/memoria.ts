import "server-only";
import { after } from "next/server";

// 25 oct 2026 (Cristian: «que no vuelva a pasar»): con el equipo trabajando, cada pantalla volvía a pedir a Supabase
// todo el historial aunque otra persona lo acabara de pedir, y la base del plan gratis se saturó. Esta memoria del
// servidor guarda lo pesado durante un rato (decisión de Cristian: hasta 1 minuto de retraso para lo que cambian los
// demás) y lo comparte: 10 personas que piden lo mismo en ese minuto = 1 sola consulta. Si llegan a la vez, esperan
// juntas a la misma respuesta. Cada una recibe su propia copia (nadie puede estropear los datos de otro).
// Si la consulta falla, no se guarda: la siguiente vuelve a intentarlo.
const guardado = new Map<string, { hasta: number; valor: Promise<unknown> }>();
const MAXIMO = 300;

export function enMemoria<T>(clave: string, ms: number, cargar: () => Promise<T>): Promise<T> {
  // En los tests no se guarda nada: escriben y leen al momento
  if (process.env.VITEST) return cargar();
  const ahora = Date.now();
  const hay = guardado.get(clave);
  if (hay && hay.hasta > ahora) return (hay.valor as Promise<T>).then((v) => structuredClone(v));
  const valor = cargar();
  guardado.set(clave, { hasta: ahora + ms, valor });
  valor.catch(() => {
    if (guardado.get(clave)?.valor === valor) guardado.delete(clave);
  });
  if (guardado.size > MAXIMO) for (const [k, v] of guardado) if (v.hasta <= ahora) guardado.delete(k);
  return valor.then((v) => structuredClone(v));
}

export const UN_MINUTO = 60_000;

// D41 (Cristian, 13 nov 2026): KPIs → Leads «al instante». Como enMemoria, pero al caducar no hace esperar a nadie:
// devuelve lo último bueno y lo pone al día por detrás (una sola recarga a la vez). Si lo último tiene más de
// `maximo`, sí se espera a la base. Solo para lo que pueda enseñarse unos minutos atrasado.
const ultimo = new Map<string, { en: number; valor: unknown }>();
const recargando = new Map<string, Promise<unknown>>();
let vuelta = 0; // sube con olvidarTodo(): lo que se cargaba antes de olvidar no se guarda

export function alInstante<T>(clave: string, ms: number, cargar: () => Promise<T>, maximo = 10 * UN_MINUTO): Promise<T> {
  if (process.env.VITEST) return cargar();
  const hay = ultimo.get(clave);
  const edad = hay ? Date.now() - hay.en : Infinity;
  if (edad < ms) return Promise.resolve(structuredClone(hay!.valor as T));
  let recarga = recargando.get(clave) as Promise<T> | undefined;
  if (!recarga) {
    const v = vuelta;
    const inicio = Date.now();
    const p: Promise<T> = cargar()
      .then((valor) => {
        if (v === vuelta) ultimo.set(clave, { en: inicio, valor });
        return valor;
      })
      .finally(() => {
        if (recargando.get(clave) === p) recargando.delete(clave);
      });
    p.catch((e) => console.error(`[memoria] cargar ${clave}`, e));
    recargando.set(clave, p);
    // En Vercel la función se puede parar al responder: after() la mantiene viva hasta acabar la recarga
    try {
      after(() => p.catch(() => {}));
    } catch {
      // fuera de una petición (scripts): la recarga sigue igual
    }
    recarga = p;
  }
  if (edad < maximo) return Promise.resolve(structuredClone(hay!.valor as T));
  return recarga.then((v) => structuredClone(v));
}

// Al guardar perfiles, miembros, permisos o ajustes del proyecto se borra todo lo guardado (esta copia del servidor),
// para que esos cambios se vean al momento
export function olvidarTodo() {
  guardado.clear();
  ultimo.clear();
  recargando.clear();
  vuelta++;
}
