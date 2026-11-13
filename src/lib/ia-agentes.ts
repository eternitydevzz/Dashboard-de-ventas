// IA (V2-10): los 12 agentes de «Configurar IA», el prompt y el formato de la respuesta. Sin base de datos.
export const MODELO_IA = "claude-sonnet-5-5"; // decisión de Cristian (9 oct 2026)

export const AGENTES = [
  { v: "objeciones", t: "Objeciones", d: "Qué objeciones puso el cliente, cómo las manejó el closer y cómo se podrían haber manejado mejor." },
  { v: "estructura", t: "Estructura de la llamada", d: "Si siguió las fases (apertura, descubrimiento, presentación, cierre) y dónde se perdió tiempo." },
  { v: "psicologia", t: "Psicología del cliente", d: "Cómo decide el cliente, qué le mueve y qué le frena." },
  { v: "cualificacion", t: "Cualificación", d: "Si el cliente encaja: situación, necesidad, urgencia y capacidad de pago." },
  { v: "miedos", t: "Miedos y creencias limitantes", d: "Miedos y creencias que aparecen y cómo afectan a la decisión." },
  { v: "coaching", t: "Puntos de mejora (coaching)", d: "Los 3 cambios concretos que más ayudarían al closer en su próxima llamada, con frases de ejemplo." },
  { v: "timeline_emocional", t: "Timeline emocional", d: "Cómo cambia el ánimo del cliente a lo largo de la llamada, con los momentos clave (minuto aproximado)." },
  { v: "frustraciones", t: "Frustraciones", d: "Qué le frustra hoy al cliente de su situación." },
  { v: "deseos", t: "Deseos", d: "Qué quiere conseguir a corto plazo." },
  { v: "aspiraciones", t: "Aspiraciones", d: "A dónde quiere llegar a largo plazo y por qué le importa." },
  { v: "perfil", t: "Perfil de la persona", d: "Quién es: situación, trabajo, experiencia, estilo de comunicación." },
  { v: "autocompletado", t: "Autocompletado del cierre", d: "Propone cómo cerrar la cita en la app (estado, estrellas y nota) para que el closer solo lo confirme." },
] as const;
export type Agente = (typeof AGENTES)[number]["v"];
export type ConfigAgentes = Partial<Record<Agente, { activo?: boolean; instrucciones?: string | null }>>;

export const activos = (c: ConfigAgentes) => AGENTES.filter((a) => c[a.v]?.activo !== false);

const ESTADOS_CIERRE = ["cerrada", "seguimiento", "perdida", "no_califica", "no_show"] as const;

// Formato JSON que tiene que devolver Claude (salidas estructuradas). Solo con los agentes activos.
export function esquemaAnalisis(c: ConfigAgentes) {
  const ag = activos(c);
  const secciones = ag.filter((a) => a.v !== "autocompletado");
  const props: Record<string, unknown> = {
    resumen: { type: "string", description: "Resumen de la llamada en 3-5 frases." },
    puntuacion: { type: "integer", description: "Nota de la llamada del closer, de 0 a 100." },
    resultado: { type: "string", enum: ["cerrado", "no_cerrado", "seguimiento"], description: "Cómo terminó la llamada." },
    secciones: {
      type: "object",
      properties: Object.fromEntries(secciones.map((a) => [a.v, { type: "string", description: a.d }])),
      required: secciones.map((a) => a.v),
      additionalProperties: false,
    },
  };
  const required = ["resumen", "puntuacion", "resultado", "secciones"];
  if (ag.some((a) => a.v === "autocompletado")) {
    props.autocompletado = {
      type: "object",
      properties: {
        estado: { type: "string", enum: [...ESTADOS_CIERRE] },
        estrellas: { type: "integer", description: "1 no califica · 2 poco encaje · 3 encaja sin dinero ahora · 4 paga con plazo · 5 encaja y puede pagar ya" },
        nota: { type: "string", description: "Nota breve para la ficha del lead." },
      },
      required: ["estado", "estrellas", "nota"],
      additionalProperties: false,
    };
    required.push("autocompletado");
  }
  return { type: "object", properties: props, required, additionalProperties: false };
}

export function promptSistema(o: { negocio: string; contexto: string | null; agentes: ConfigAgentes }) {
  const lineas = activos(o.agentes).map((a) => `- ${a.v} (${a.t}): ${o.agentes[a.v]?.instrucciones?.trim() || a.d}`);
  return [
    `Eres un analista de ventas experto que revisa llamadas de venta de «${o.negocio}». Escribes en español de España, claro y directo, sin relleno.`,
    o.contexto?.trim() ? `Contexto del negocio (lo da el CEO):\n${o.contexto.trim()}` : "",
    "Analiza la transcripción y devuelve el JSON pedido. En cada sección, usa viñetas cortas en Markdown y cita frases reales de la llamada cuando ayuden. Si algo no aparece en la llamada, dilo en una frase en vez de inventarlo.",
    `Secciones:\n${lineas.join("\n")}`,
    "La puntuación (0-100) mide lo bien que lo hizo el closer, no si el cliente compró.",
  ].filter(Boolean).join("\n\n");
}

type Linea = { speaker?: { display_name?: string }; text?: string; timestamp?: string };
export function textoLlamada(o: { titulo: string | null; lead: string | null; producto: string | null; fecha: string | null; resumenFathom: string | null; transcripcion: Linea[] | null }) {
  const t = (o.transcripcion ?? []).map((l) => `[${l.timestamp ?? ""}] ${l.speaker?.display_name ?? "?"}: ${l.text ?? ""}`).join("\n");
  return [
    `Llamada: ${o.titulo ?? "sin título"}${o.fecha ? ` · ${o.fecha}` : ""}`,
    o.lead ? `Cliente: ${o.lead}` : "",
    o.producto ? `Programa que se le ofrece: ${o.producto}` : "",
    o.resumenFathom ? `Resumen de Fathom:\n${o.resumenFathom}` : "",
    `Transcripción:\n${t || "(sin transcripción)"}`,
  ].filter(Boolean).join("\n\n");
}

// Lo que devuelve Claude, revisado antes de guardarlo (aunque venga con el formato fijado, no se confía a ciegas)
export function limpiarAnalisis(x: unknown, c: ConfigAgentes) {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const s = (v: unknown, max = 8000) => (typeof v === "string" ? v.slice(0, max) : "");
  const sec = (o.secciones && typeof o.secciones === "object" ? o.secciones : {}) as Record<string, unknown>;
  const auto = o.autocompletado && typeof o.autocompletado === "object" ? (o.autocompletado as Record<string, unknown>) : null;
  const resultado = ["cerrado", "no_cerrado", "seguimiento"].includes(String(o.resultado)) ? (String(o.resultado) as "cerrado" | "no_cerrado" | "seguimiento") : null;
  return {
    resumen: s(o.resumen, 4000),
    puntuacion: Math.max(0, Math.min(100, Math.round(Number(o.puntuacion) || 0))),
    resultado,
    secciones: Object.fromEntries(activos(c).filter((a) => a.v !== "autocompletado").map((a) => [a.v, s(sec[a.v])])),
    autocompletado:
      auto && (ESTADOS_CIERRE as readonly string[]).includes(String(auto.estado))
        ? { estado: String(auto.estado), estrellas: Math.max(1, Math.min(5, Math.round(Number(auto.estrellas) || 3))), nota: s(auto.nota, 1000) }
        : null,
  };
}
