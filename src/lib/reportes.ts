// Preguntas del reporte de fin de día según el rol.
export type Pregunta = { clave: string; texto: string; tipo: "numero" | "texto"; ayuda?: string; destacada?: boolean };

export const PREGUNTAS: Record<"caller" | "closer", Pregunta[]> = {
  caller: [
    { clave: "llamadas", texto: "¿Cuántas llamadas?", tipo: "numero" },
    // N1 (Cristian, 16 nov): fuera «¿Cuántas no responden?» con el botón «No responde» (se sigue con Wsp e «No interesa»)
    { clave: "agendas", texto: "¿Cuántas agendas?", tipo: "numero", destacada: true },
    { clave: "whatsapps", texto: "¿Cuántos mensajes de WhatsApp?", tipo: "numero" },
    { clave: "seguimientos", texto: "¿Cuántos seguimientos?", tipo: "numero" },
    { clave: "inconvenientes", texto: "¿Inconvenientes?", tipo: "texto", ayuda: "Herramientas, leads, información… Si no hubo nada, escribe «Ninguno»." },
    { clave: "mejoras", texto: "¿Mejoras?", tipo: "texto", ayuda: "Qué puedes hacer distinto mañana." },
    { clave: "otros", texto: "¿Otros detalles?", tipo: "texto" },
  ],
  // Mismas preguntas que el formulario actual (Forms team/reporteventas.html)
  closer: [
    { clave: "llamadas_realizadas", texto: "Llamadas realizadas", tipo: "numero" },
    { clave: "llamadas_agendadas", texto: "Llamadas agendadas", tipo: "numero" },
    { clave: "no_responden", texto: "No responden", tipo: "numero" },
    { clave: "no_show", texto: "No show", tipo: "numero" },
    { clave: "ventas", texto: "Ventas cerradas", tipo: "numero", destacada: true, ayuda: "El número que cuenta. Si hoy fue cero, escribe 0." },
    { clave: "puntos_mejora", texto: "¿Puntos de mejora?", tipo: "texto", ayuda: "Ej: «Cerrar mejor la objeción de precio»." },
    { clave: "inconvenientes", texto: "¿Inconvenientes?", tipo: "texto", ayuda: "Si no hubo nada, escribe «Ninguno»." },
  ],
};

// ---------- Preguntas editables (bloque 7 de 1.0, Cristian 10 y 11 oct 2026) ----------
// Las cambian el CEO y los directores con Administración. Del closer, las 3 de las tasas se pueden renombrar pero no
// quitar (y siguen siendo números); del caller, ninguna es fija. Cada reporte guarda las preguntas que tenía.
export const FIJAS: Record<"caller" | "closer", string[]> = { caller: [], closer: ["llamadas_realizadas", "llamadas_agendadas", "ventas"] };
const CLAVE = /^[a-z0-9_]{1,40}$/;

export function preguntasValidas(rol: "caller" | "closer", lista: unknown): { ok: Pregunta[] } | { error: string } {
  if (!Array.isArray(lista) || !lista.length) return { error: "Pon al menos una pregunta." };
  if (lista.length > 30) return { error: "Como mucho 30 preguntas." };
  const out: Pregunta[] = [];
  for (const x of lista) {
    const p = x as Partial<Pregunta>;
    const texto = typeof p.texto === "string" ? p.texto.trim() : "";
    const ayuda = typeof p.ayuda === "string" ? p.ayuda.trim() : "";
    if (typeof p.clave !== "string" || !CLAVE.test(p.clave)) return { error: "Alguna pregunta no es válida." };
    if (!texto || texto.length > 200) return { error: "Cada pregunta necesita un texto (máximo 200 letras)." };
    if (ayuda.length > 300) return { error: "La ayuda de una pregunta es demasiado larga (máximo 300 letras)." };
    if (p.tipo !== "numero" && p.tipo !== "texto") return { error: `Elige si «${texto}» es un número o un texto.` };
    if (out.some((q) => q.clave === p.clave)) return { error: "Hay dos preguntas iguales." };
    out.push({ clave: p.clave, texto, tipo: p.tipo, ...(ayuda ? { ayuda } : {}), ...(p.destacada ? { destacada: true } : {}) });
  }
  for (const f of FIJAS[rol]) {
    const q = out.find((x) => x.clave === f);
    const original = PREGUNTAS[rol].find((x) => x.clave === f)?.texto ?? f;
    if (!q) return { error: `«${original}» no se puede quitar: se usa para las tasas del closer.` };
    if (q.tipo !== "numero") return { error: `«${q.texto}» tiene que ser un número: se usa para las tasas del closer.` };
  }
  return { ok: out };
}

// Las preguntas de ahora para un rol: las del proyecto o, si no hay (o están mal), las de siempre
export function preguntasDe(guardadas: unknown, rol: "caller" | "closer"): Pregunta[] {
  const g = (guardadas && typeof guardadas === "object" ? guardadas : {}) as Record<string, unknown>;
  if (!g[rol]) return PREGUNTAS[rol];
  const r = preguntasValidas(rol, g[rol]);
  return "ok" in r ? r.ok : PREGUNTAS[rol];
}
