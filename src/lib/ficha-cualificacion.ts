// C6 (plan Callers, 7 nov; 7c.2): ficha de cualificación que rellena el caller en el guion (sin nombre ni teléfono,
// que ya están en la app). Todo texto libre, nada obligatorio.
// Fase E (Jose, 18 nov): el formulario lleva los 11 campos de la plantilla del WhatsApp de la cita, en su orden.
// Sin «server-only»: la usan también el guion (navegador) y la ruta del guardado al salir.
export const CAMPOS_FICHA = [
  { k: "contexto", t: "Contexto del lead", largo: true },
  { k: "experiencia", t: "Experiencia", largo: true },
  { k: "motivacion", t: "Motivación", largo: false },
  { k: "importe", t: "Importe informado", largo: false },
  { k: "respuesta", t: "Respuesta", largo: true },
  { k: "edad", t: "Edad", largo: false },
  { k: "situacion", t: "Situación actual", largo: true },
  { k: "decision", t: "Decisión", largo: false },
  { k: "lugar", t: "Lugar", largo: false },
  { k: "conclusion", t: "Conclusión", largo: true },
  { k: "tiempo", t: "Tiempo disponible", largo: false },
] as const;
// Fase E: los que salieron del formulario. Lo que ya tengan los leads no se borra nunca (ver conAntiguosDe)
export const CAMPOS_ANTIGUOS = [
  { k: "dolor", t: "Dolor", largo: true },
  { k: "objecion", t: "Objeción principal", largo: true },
  { k: "resultado", t: "Resultado", largo: true },
  { k: "nota", t: "Nota", largo: true },
] as const;
const TODOS = [...CAMPOS_FICHA, ...CAMPOS_ANTIGUOS];
export type CampoFicha = (typeof TODOS)[number]["k"];
export type Ficha = Partial<Record<CampoFicha, string>>;
const MAX = 2000;

// Solo los campos conocidos (los 15), como texto recortado, sin vacíos y con un largo máximo
export function limpiarFicha(entrada: unknown): Ficha {
  if (!entrada || typeof entrada !== "object") return {};
  const e = entrada as Record<string, unknown>;
  const f: Ficha = {};
  for (const { k } of TODOS) {
    const v = e[k];
    if (v === null || v === undefined) continue;
    const t = String(v).trim().slice(0, MAX);
    if (t) f[k] = t;
  }
  return f;
}

export function mismaFicha(a: unknown, b: unknown) {
  const x = limpiarFicha(a), y = limpiarFicha(b);
  return TODOS.every(({ k }) => (x[k] ?? "") === (y[k] ?? ""));
}

// Fase E: lo que se guarda = los 11 del formulario que llegan + los antiguos tal cual estaban en la base
// (los antiguos que mande el navegador se ignoran: así no se borran ni se cambian)
export function conAntiguosDe(nueva: unknown, guardada: unknown): Ficha {
  const n = limpiarFicha(nueva), g = limpiarFicha(guardada);
  const f: Ficha = {};
  for (const { k } of CAMPOS_FICHA) if (n[k]) f[k] = n[k];
  for (const { k } of CAMPOS_ANTIGUOS) if (g[k]) f[k] = g[k];
  return f;
}

// Al leer bien la ficha: la copia sin guardar de este navegador (o la de la base) y, encima, lo que se escribió
// mientras la lectura fallaba (esos campos se vieron vacíos, así que no borran nada de la base)
export function fichaAlLeer(base: Ficha, copia: Ficha | null, escritoSinLeer: Ficha): Ficha {
  return { ...(copia ?? base), ...limpiarFicha(escritoSinLeer) };
}
