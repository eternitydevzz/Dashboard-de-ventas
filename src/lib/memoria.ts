import "server-only";

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

// Al guardar perfiles, miembros, permisos o ajustes del proyecto se borra todo lo guardado (esta copia del servidor),
// para que esos cambios se vean al momento
export function olvidarTodo() {
  guardado.clear();
}
