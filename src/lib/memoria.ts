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

// Cristian, 14 nov (noche, «memoria de 5 min» para KPIs → Leads): hasta `fresco` se usa lo guardado; de `fresco` a
// `maximo` se usa lo guardado y se renueva por detrás con `lanzar` (en la app, after() de Next: después de responder);
// pasado `maximo`, se espera a la base. Quien pide nunca espera a una renovación (el 13 nov, una recarga colgada hacía
// esperar a todos): si falla, sigue lo guardado; si se queda colgada más de 1 min, se puede lanzar otra.
// olvidarTodo() también lo borra: un cambio propio se ve al momento.
const renovables = new Map<string, { desde: number; valor: Promise<unknown>; renovando: number; viejo?: boolean }>();

export function renovadoPorDetras<T>(clave: string, fresco: number, maximo: number, cargar: () => Promise<T>, lanzar: (f: () => Promise<unknown>) => void): Promise<T> {
  if (process.env.VITEST) return cargar();
  const ahora = Date.now();
  const hay = renovables.get(clave);
  if (!hay || ahora - hay.desde > maximo) {
    const valor = cargar();
    const nuevo = { desde: ahora, valor, renovando: 0 };
    renovables.set(clave, nuevo);
    valor.catch(() => {
      if (renovables.get(clave) === nuevo) renovables.delete(clave);
    });
    return valor.then((v) => structuredClone(v));
  }
  if ((ahora - hay.desde > fresco || hay.viejo) && (!hay.renovando || ahora - hay.renovando > UN_MINUTO)) {
    hay.renovando = ahora;
    lanzar(async () => {
      try {
        const v = await cargar();
        if (renovables.get(clave) === hay) renovables.set(clave, { desde: Date.now(), valor: Promise.resolve(v), renovando: 0 });
      } catch {
        hay.renovando = 0; // la siguiente visita lo vuelve a intentar
      }
    });
  }
  return (hay.valor as Promise<T>).then((v) => structuredClone(v));
}

// Al guardar perfiles, miembros, permisos o ajustes del proyecto se borra todo lo guardado (esta copia del servidor),
// para que esos cambios se vean al momento
// Cristian, 15 nov: algo cambió (p. ej. una llamada desde la cola) → la siguiente visita sigue respondiendo al momento con
// lo guardado, pero lo renueva por detrás aunque no haya pasado el minuto. No hace esperar a nadie (olvidarTodo sí).
export function marcarViejo(prefijo: string) {
  for (const [clave, e] of renovables) if (clave.startsWith(prefijo)) e.viejo = true;
}

export function olvidarTodo() {
  guardado.clear();
  renovables.clear();
}
