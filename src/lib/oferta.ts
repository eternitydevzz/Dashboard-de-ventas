// Bloque A (Cristian, 11 oct 2026): la «Oferta» de cada lead según su formulario de la Biblioteca de recursos.
// Regla sacada de la vista de ventas de Cristian (vista-ventas.html) y comprobada: coincide en las 1.005 personas.
// Sin base de datos: la usan el guardado de leads, la Biblioteca, la ficha y el CRM.
import type { Respuesta } from "@/lib/tipos";

export type Oferta = "vip_empresas" | "vip" | "empresas" | "grupal" | "membresia";
export const OFERTAS: { v: Oferta; t: string; orden: number }[] = [
  { v: "vip_empresas", t: "VIP + Empresas", orden: 1 },
  { v: "vip", t: "VIP", orden: 2 },
  { v: "empresas", t: "Empresas", orden: 3 },
  { v: "grupal", t: "Grupal", orden: 4 },
  { v: "membresia", t: "Membresía", orden: 5 },
];
export const ETIQUETA_OFERTA = Object.fromEntries(OFERTAS.map((o) => [o.v, o.t])) as Record<Oferta, string>;

// Las 6 preguntas. Llegan con nombres distintos según el origen: el texto del CSV de GHL (el que se guarda), el
// nombre que pone la app a lo que manda la landing («Situación», «Inversión»…) y su campo (`quiz_situacion`…).
export type ClavePregunta = "situacion" | "experiencia" | "objetivo" | "tiempo" | "inversion" | "inicio";
export const PREGUNTAS_BIBLIOTECA: { clave: ClavePregunta; texto: string; alias: string[] }[] = [
  { clave: "situacion", texto: "¿En qué situación estás hoy?", alias: ["situación", "situacion", "quiz_situacion"] },
  { clave: "experiencia", texto: "¿Qué experiencia tienes con IA?", alias: ["experiencia ia", "experiencia con ia", "experiencia con ai", "quiz_experiencia_ia"] },
  { clave: "objetivo", texto: "¿Qué quieres lograr en los próximos 90 días?", alias: ["objetivo 90 días", "objetivo 90 dias", "objetivo a 90 días", "quiz_objetivo_90_dias"] },
  { clave: "tiempo", texto: "¿Cuánto tiempo por semana le puedes dedicar?", alias: ["tiempo semanal", "tiempo por semana", "quiz_tiempo_semanal"] },
  { clave: "inversion", texto: "Si encuentras el programa correcto, ¿estás en condiciones de invertir en tu formación?", alias: ["inversión", "inversion", "puede invertir", "quiz_inversion"] },
  { clave: "inicio", texto: "¿Cuándo quieres empezar?", alias: ["inicio", "cuándo empezar", "cuando empezar", "quiz_inicio"] },
];

const limpio = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¿?¡!.,:;«»"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const POR_NOMBRE = new Map<string, (typeof PREGUNTAS_BIBLIOTECA)[number]>();
for (const p of PREGUNTAS_BIBLIOTECA) for (const n of [p.texto, ...p.alias]) POR_NOMBRE.set(limpio(n), p);

// El nombre único de una pregunta (o el suyo, si no es de la Biblioteca)
export function preguntaCanonica(pregunta: string) {
  return POR_NOMBRE.get(limpio(pregunta))?.texto ?? pregunta;
}
// Respuestas con el nombre único: así una respuesta nueva sustituye a la de la misma pregunta venga de donde venga
export function normalizarRespuestas(rs: Respuesta[]): Respuesta[] {
  const m = new Map<string, Respuesta>();
  for (const r of rs) {
    const pregunta = preguntaCanonica(r.pregunta);
    m.set(pregunta.toLowerCase(), { pregunta, respuesta: r.respuesta });
  }
  return [...m.values()];
}

export type RespuestasBiblioteca = Record<ClavePregunta, string>;
export function respuestasBiblioteca(rs: Respuesta[]): RespuestasBiblioteca {
  const r = { situacion: "", experiencia: "", objetivo: "", tiempo: "", inversion: "", inicio: "" } as RespuestasBiblioteca;
  for (const x of rs) {
    const p = POR_NOMBRE.get(limpio(x.pregunta));
    if (p && x.respuesta) r[p.clave] = x.respuesta.trim();
  }
  return r;
}

// ¿Es un lead de la Biblioteca? Por su etiqueta (CSV: «biblioteca recursos»; landing: «recursos-ia»), su fuente
// («recursos») o porque trae alguna de las 6 preguntas
export function esDeBiblioteca(l: { etiquetas?: string[] | null; fuente?: string | null; respuestas?: Respuesta[] | null }) {
  const tags = (l.etiquetas ?? []).map((t) => t.toLowerCase());
  if (tags.includes("biblioteca recursos") || tags.includes("recursos-ia")) return true;
  // JSON v1 (Cristian, 7 nov 2026): el registro de la Biblioteca manda source «biblioteca» y ya no manda etiquetas.
  // La agenda («agenda-biblioteca») no cuenta: no es el cuestionario de la Biblioteca
  if (["recursos", "biblioteca"].includes((l.fuente ?? "").trim().toLowerCase())) return true;
  return (l.respuestas ?? []).some((x) => POR_NOMBRE.has(limpio(x.pregunta)));
}

const NEGOCIO = ["Tengo un negocio", "Tengo una agencia"];
const EXPERIENCIA_VIP = ["Ya automatizo cosas", "Ya vendí servicios de AI"];
// La regla: VIP = invierte «Sí, ahora» + empieza «Ya mismo» o «Este mes» + negocio o agencia, o ya automatiza o
// ya vendió AI · Empresas = «Tengo un negocio» + «Automatizar mi negocio» · los dos = VIP + Empresas ·
// invierte ya y no encaja = Grupal · el resto = Membresía
export function ofertaDe(r: RespuestasBiblioteca): Oferta {
  const vip = r.inversion === "Sí, ahora" && (r.inicio === "Ya mismo" || r.inicio === "Este mes") && (NEGOCIO.includes(r.situacion) || EXPERIENCIA_VIP.includes(r.experiencia));
  const empresas = r.situacion === "Tengo un negocio" && r.objetivo === "Automatizar mi negocio";
  if (vip && empresas) return "vip_empresas";
  if (vip) return "vip";
  if (empresas) return "empresas";
  if (r.inversion === "Sí, ahora") return "grupal";
  return "membresia";
}

// La oferta que se guarda en el lead (null si no es de la Biblioteca)
export function calcularOferta(l: { etiquetas?: string[] | null; fuente?: string | null; respuestas?: Respuesta[] | null }): Oferta | null {
  return esDeBiblioteca(l) ? ofertaDe(respuestasBiblioteca(l.respuestas ?? [])) : null;
}
