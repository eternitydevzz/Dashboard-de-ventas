// C6 (plan Callers, 7 nov; 7c.2): ficha de cualificación que rellena el caller en el guion. Los 8 campos de la tabla
// que usa el equipo (sin nombre ni teléfono, que ya están en la app) + «Nota». Todo texto libre, nada obligatorio.
// Sin «server-only»: la usan también el guion (navegador) y la ruta del guardado al salir.
export const CAMPOS_FICHA = [
  { k: "lugar", t: "Lugar", largo: false },
  { k: "edad", t: "Edad", largo: false },
  { k: "decision", t: "Decisión", largo: false },
  { k: "motivacion", t: "Motivación", largo: false },
  { k: "situacion", t: "Situación actual", largo: true },
  { k: "dolor", t: "Dolor", largo: true },
  { k: "objecion", t: "Objeción principal", largo: false },
  { k: "resultado", t: "Resultado", largo: false },
  { k: "nota", t: "Nota", largo: true },
] as const;
export type CampoFicha = (typeof CAMPOS_FICHA)[number]["k"];
export type Ficha = Partial<Record<CampoFicha, string>>;
const MAX = 2000;

// Solo los campos conocidos, como texto recortado, sin vacíos y con un largo máximo
export function limpiarFicha(entrada: unknown): Ficha {
  if (!entrada || typeof entrada !== "object") return {};
  const e = entrada as Record<string, unknown>;
  const f: Ficha = {};
  for (const { k } of CAMPOS_FICHA) {
    const v = e[k];
    if (v === null || v === undefined) continue;
    const t = String(v).trim().slice(0, MAX);
    if (t) f[k] = t;
  }
  return f;
}

export function mismaFicha(a: unknown, b: unknown) {
  const x = limpiarFicha(a), y = limpiarFicha(b);
  return CAMPOS_FICHA.every(({ k }) => (x[k] ?? "") === (y[k] ?? ""));
}
