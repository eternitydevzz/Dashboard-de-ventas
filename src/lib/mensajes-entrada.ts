import type { Rol } from "@/lib/tipos";

// Bienvenida con mensajes (Cristian, 11 nov 2026; maqueta docs/maqueta-bienvenida.html). Lo puro va aquí (con test);
// las consultas, en mensajes-entrada-datos.ts.

// Las 3 secciones que se precargan al abrir la app, fijas por rol (Cristian, 11 nov: «máximo 3», no las 16 de octubre,
// que saturaban la base). Solo cuentan las que la persona tiene en su menú.
export const PRECARGA_ROL: Record<Rol, string[]> = {
  caller: ["/caller", "/crm", "/mi-funnel"],
  closer: ["/closer/llamadas", "/crm", "/mi-funnel"], // el mismo href que el menú «Agendas» (layout.tsx)
  director: ["/kpis", "/caller", "/closer/llamadas"],
  ceo: ["/kpis", "/crm", "/closer/llamadas"],
};

export type ClaveMensaje =
  | "motivacion" | "grabacion"
  | "ll100" | "ll150" | "ag1" | "ag3" | "ag5" | "venta_agenda"
  | "cag3" | "cag10" | "v1" | "v3" | "v5";

// Textos de siempre (Cristian, 11 nov, en «tú»; los de los hitos que no escribió él son de Claude). Fase 3: se cambian en
// Administración → Popups (proyectos.textos_entrada); lo que no se cambie sale como aquí. {nombre}, {dia}, {leads} y
// {agendas} se rellenan al enseñarlos. `cuando` es el umbral, solo para leerlo en la pestaña.
export type ClaveTexto = ClaveMensaje | "reporte";
export type TextoEntrada = { titulo: string; texto: string };
export const TEXTOS_ENTRADA: Record<ClaveTexto, TextoEntrada & { cuando: string }> = {
  motivacion: { cuando: "Caller · menos de 50 llamadas hoy", titulo: "Buenos días, {nombre}", texto: "Hoy estás un paso más cerca de cumplir tus objetivos. Recuerda: si lo puedes soñar, lo puedes lograr. ¡Dios te bendiga hoy!" },
  grabacion: { cuando: "Caller y closer · siempre", titulo: "Graba tus llamadas", texto: "Recuerda grabar tus llamadas para que podamos estudiarlas en equipo y seguir mejorando día a día." },
  ll100: { cuando: "Caller · 100 llamadas hoy", titulo: "¡100 llamadas hoy!", texto: "Vas a un ritmo increíble, {nombre}. Cada llamada te acerca a la siguiente agenda. ¡Sigue así!" },
  ll150: { cuando: "Caller · 150 llamadas hoy", titulo: "¡150 llamadas hoy!", texto: "Eres un ejemplo para todo el equipo, {nombre}. Gracias por tu esfuerzo de hoy." },
  ag1: { cuando: "Caller · 1.ª agenda de la semana", titulo: "¡Tu primera agenda de la semana!", texto: "Así se empieza. Vamos a por la siguiente." },
  ag3: { cuando: "Caller · 3 agendas en la semana", titulo: "¡3 agendas esta semana!", texto: "Vas por muy buen camino, {nombre}. El equipo lo nota." },
  ag5: { cuando: "Caller · 5 agendas en la semana", titulo: "¡5 agendas esta semana!", texto: "Felicidades por tus 5 agendas de la semana. El equipo está muy contento con tu trabajo." },
  venta_agenda: { cuando: "Caller · venta de un lead que agendó", titulo: "¡Venta cerrada!", texto: "Se acaba de cerrar una venta que agendaste tú. El equipo está muy contento con tu trabajo." },
  cag3: { cuando: "Closer · 3 agendas en la semana", titulo: "¡3 agendas esta semana!", texto: "Prepárate bien, {nombre}: cada llamada es una oportunidad de cerrar." },
  cag10: { cuando: "Closer · 10 agendas en la semana", titulo: "¡10 agendas esta semana!", texto: "Tu agenda está llena, {nombre}. El equipo confía en ti." },
  v1: { cuando: "Closer · venta nueva", titulo: "¡Nueva venta!", texto: "¡Felicidades por tu nueva venta! El equipo está muy contento con tu trabajo." },
  v3: { cuando: "Closer · 3 ventas en el mes", titulo: "¡3 ventas este mes!", texto: "Estás imparable, {nombre}. ¡Enhorabuena!" },
  v5: { cuando: "Closer · 5 ventas en el mes", titulo: "¡5 ventas este mes!", texto: "Eres de los mejores del equipo, {nombre}. ¡Enhorabuena!" },
  reporte: { cuando: "CEO · reporte de ayer, 1 vez al día", titulo: "Ayer, {dia}", texto: "Entraron {leads} leads y se agendaron {agendas} citas." },
};

// Solo claves conocidas y textos con algo; lo demás se ignora (sale el de siempre)
export function textosCambiados(x: unknown): Partial<Record<ClaveTexto, TextoEntrada>> {
  const out: Partial<Record<ClaveTexto, TextoEntrada>> = {};
  if (!x || typeof x !== "object") return out;
  for (const [k, v] of Object.entries(x)) {
    if (!(k in TEXTOS_ENTRADA) || !v || typeof v !== "object") continue;
    const { titulo, texto } = v as Record<string, unknown>;
    if (typeof titulo === "string" && titulo.trim() && typeof texto === "string" && texto.trim()) out[k as ClaveTexto] = { titulo, texto };
  }
  return out;
}

// El texto que se enseña: el cambiado o el de siempre, con {nombre}… rellenos
export function textoEntrada(clave: ClaveTexto, cambiados: unknown, datos: Record<string, string | number>): TextoEntrada {
  const t = textosCambiados(cambiados)[clave] ?? TEXTOS_ENTRADA[clave];
  const rellenar = (s: string) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in datos ? String(datos[k]) : m));
  return { titulo: rellenar(t.titulo), texto: rellenar(t.texto) };
}

// Felicitaciones: si sale una nueva en el día, la ventana vuelve a abrirse aunque ya se viera ese día
const FELICITACIONES: ClaveMensaje[] = ["ll100", "ll150", "ag1", "ag3", "ag5", "venta_agenda", "cag3", "cag10", "v1", "v3", "v5"];

export type NumerosCaller = { llamadasHoy: number; agendasHoy: number; agendasSemana: number; ventasDeSusAgendasHoy: number };
export type NumerosCloser = { agendasNuevasHoy: number; agendasSemana: number; ventasHoy: number; ventasMes: number };

// Umbrales (Cristian, 11 nov): motivación por debajo de 50 llamadas al día; hitos a las 100 y 150. Agendas del caller
// 1/3/5 en la semana; del closer, 3/10. Ventas del closer 1/3/5 en el mes. Las de agendas y ventas solo salen el día en
// que hay una nueva (si no, la misma felicitación saldría todos los días de la semana o del mes).
export function mensajesCaller(n: NumerosCaller): ClaveMensaje[] {
  const m: ClaveMensaje[] = [];
  if (n.ventasDeSusAgendasHoy > 0) m.push("venta_agenda");
  if (n.llamadasHoy >= 150) m.push("ll150");
  else if (n.llamadasHoy >= 100) m.push("ll100");
  if (n.agendasHoy > 0) {
    if (n.agendasSemana >= 5) m.push("ag5");
    else if (n.agendasSemana >= 3) m.push("ag3");
    else if (n.agendasSemana >= 1) m.push("ag1");
  }
  if (n.llamadasHoy < 50) m.push("motivacion");
  m.push("grabacion");
  return m;
}

export function mensajesCloser(n: NumerosCloser): ClaveMensaje[] {
  const m: ClaveMensaje[] = [];
  if (n.ventasHoy > 0) m.push(n.ventasMes >= 5 ? "v5" : n.ventasMes >= 3 ? "v3" : "v1");
  if (n.agendasNuevasHoy > 0) {
    if (n.agendasSemana >= 10) m.push("cag10");
    else if (n.agendasSemana >= 3) m.push("cag3");
  }
  m.push("grabacion");
  return m;
}

// Cookie «día|clave,clave» con las felicitaciones ya vistas hoy. Se abre si es otro día o hay una felicitación nueva.
export function tocaVentana(cookie: string | undefined, hoy: string, mensajes: ClaveMensaje[]) {
  const [dia, vistas = ""] = (cookie ?? "").split("|");
  const felicitaciones = mensajes.filter((m) => FELICITACIONES.includes(m));
  const nuevaCookie = `${hoy}|${felicitaciones.join(",")}`;
  if (dia !== hoy) return { toca: true, nuevaCookie };
  const yaVistas = new Set(vistas.split(",").filter(Boolean));
  const hayNueva = felicitaciones.some((f) => !yaVistas.has(f));
  return { toca: hayNueva, nuevaCookie: `${hoy}|${[...new Set([...yaVistas, ...felicitaciones])].join(",")}` };
}
