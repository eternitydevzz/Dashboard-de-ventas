// Interpreta lo que manda una landing (o un workflow de GHL), como haría GHL:
// reconoce nombre, email y teléfono; guarda las respuestas del cuestionario con un nombre
// legible; separa el seguimiento (UTM…) y guarda TODO lo demás tal cual en `datos`.
// Sin base de datos: se prueba con los envíos reales de las landings.
import type { Respuesta } from "@/lib/tipos";
import type { LeadEntrada } from "@/lib/csv";

type Json = Record<string, unknown>;

// Campos de seguimiento que se guardan aparte (y se enseñan en la ficha y en métricas)
export const CAMPOS_SEGUIMIENTO = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "fbclid",
  "gclid",
  "ttclid",
  "page_url",
  "referrer",
] as const;

// Lo que GHL añade por su cuenta al reenviar (cabeceras de la petición): no es del lead
const RUIDO = new Set(["headers"]);
// Datos de control del cuestionario: se guardan en `datos`, pero no son una respuesta
const CONTROL_QUIZ = new Set(["quiz_score", "quiz_completed", "quiz_answered"]);
const CLAVES_LEAD = new Set(["tipo", "contact_id", "contactId", "email", "phone", "first_name", "last_name", "name", "full_name", "closer_email"]);

const PALABRAS: Record<string, string> = {
  dias: "días",
  situacion: "situación",
  inversion: "inversión",
  ia: "IA",
  ai: "IA",
  "90": "90",
};

export const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" || typeof v === "boolean" ? String(v) : "");

// «quiz_objetivo_90_dias» → «Objetivo 90 días»
export function nombreLegible(clave: string) {
  const palabras = clave.replace(/^quiz[_.]/, "").split(/[_.\s]+/).filter(Boolean).map((p) => PALABRAS[p.toLowerCase()] ?? p.toLowerCase());
  const texto = palabras.join(" ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Lee un campo por su nombre o por ruta con puntos («quiz.inversion»)
export function leerCampo(o: Json, ruta: string): unknown {
  if (ruta in o) return o[ruta];
  let v: unknown = o;
  for (const p of ruta.split(".")) v = v && typeof v === "object" ? (v as Json)[p] : undefined;
  return v;
}

function primero(o: Json, claves: string[]) {
  for (const c of claves) {
    const s = str(leerCampo(o, c));
    if (s) return s;
  }
  return "";
}

type Interpretado = {
  lead: LeadEntrada;
  fuente: string | null;
  evento: string | null;
  seguimiento: Record<string, string>;
  quiz_score: number | null;
  datos: Json;
};

export function interpretar(cuerpo: Json): Interpretado {
  const datos: Json = {};
  for (const [k, v] of Object.entries(cuerpo)) if (!RUIDO.has(k)) datos[k] = v;

  // Nombre: first_name / last_name; si solo viene el nombre completo, se parte en dos
  const completo = primero(cuerpo, ["name", "full_name", "contact.name"]);
  let nombre = primero(cuerpo, ["first_name", "firstName", "contact.first_name"]);
  let apellido = primero(cuerpo, ["last_name", "lastName", "contact.last_name"]);
  if (!nombre && completo) [nombre, apellido] = [completo.split(/\s+/)[0], completo.split(/\s+/).slice(1).join(" ")];
  else if (nombre && !apellido && completo.toLowerCase().startsWith(nombre.toLowerCase() + " ")) apellido = completo.slice(nombre.length).trim();

  const tagsBruto = cuerpo.tags ?? cuerpo.contact_tags;
  const etiquetas = Array.isArray(tagsBruto) ? tagsBruto.map(str).filter(Boolean) : str(tagsBruto).split(",").map((t) => t.trim()).filter(Boolean);

  // Respuestas: quiz_* (o el objeto «quiz»), customData de GHL y campos con «¿?»
  const respuestas = new Map<string, Respuesta>();
  const anadir = (clave: string, valor: unknown, pregunta = nombreLegible(clave)) => {
    const s = str(valor);
    const id = clave.replace(/^quiz[_.]/, "").toLowerCase();
    if (s && !respuestas.has(id)) respuestas.set(id, { pregunta, respuesta: s });
  };
  for (const [k, v] of Object.entries(cuerpo)) if (/^quiz_/.test(k) && !CONTROL_QUIZ.has(k)) anadir(k, v);
  if (cuerpo.quiz && typeof cuerpo.quiz === "object") for (const [k, v] of Object.entries(cuerpo.quiz as Json)) anadir(k, v);
  const custom = (cuerpo.customData ?? cuerpo.custom_data) as Json | undefined;
  if (custom && typeof custom === "object") for (const [k, v] of Object.entries(custom)) if (!CLAVES_LEAD.has(k) && k !== "pipeline") anadir(k, v, k);
  for (const [k, v] of Object.entries(cuerpo)) if (/[?¿]/.test(k)) anadir(k, v, k);

  const seguimiento: Record<string, string> = {};
  for (const c of CAMPOS_SEGUIMIENTO) {
    const s = str(leerCampo(cuerpo, c));
    if (s) seguimiento[c] = s;
  }
  const score = Number(str(cuerpo.quiz_score));
  const fecha = primero(cuerpo, ["date_created", "dateAdded", "created_at"]);

  return {
    lead: {
      ghl_contact_id: primero(cuerpo, ["contact_id", "contactId", "contact.id"]) || null,
      nombre,
      apellido,
      email: primero(cuerpo, ["email", "contact.email"]).toLowerCase() || null,
      telefono: primero(cuerpo, ["phone", "contact.phone"]) || null,
      etiquetas,
      respuestas: [...respuestas.values()],
      creado_en: fecha && !isNaN(new Date(fecha).getTime()) ? new Date(fecha).toISOString() : null,
    },
    fuente: primero(cuerpo, ["source", "customData.source"]) || null,
    evento: primero(cuerpo, ["event", "customData.event"]) || null,
    seguimiento,
    quiz_score: str(cuerpo.quiz_score) && Number.isFinite(score) ? score : null,
    datos,
  };
}

// ---------- Reglas tipo GHL ----------
export type Regla = {
  campo: string;
  operador: "igual" | "contiene" | "existe" | "no_existe";
  valor?: string;
  pipeline_id?: string | null;
  etapa_id?: string | null;
  etiqueta?: string | null;
};
export const OPERADORES: { v: Regla["operador"]; t: string }[] = [
  { v: "igual", t: "es igual a" },
  { v: "contiene", t: "contiene" },
  { v: "existe", t: "viene relleno" },
  { v: "no_existe", t: "viene vacío o no viene" },
];

export function cumple(cuerpo: Json, r: Regla) {
  const v = str(leerCampo(cuerpo, r.campo)).toLowerCase();
  const esperado = (r.valor ?? "").trim().toLowerCase();
  if (r.operador === "existe") return v !== "";
  if (r.operador === "no_existe") return v === "";
  if (r.operador === "contiene") return esperado !== "" && v.includes(esperado);
  return v === esperado;
}

// Se aplican todas las reglas que se cumplen, en orden: la última que pone pipeline manda
// (como las ramas de un workflow de GHL) y las etiquetas se suman.
export function aplicarReglas(cuerpo: Json, reglas: Regla[], porDefecto: { pipeline_id: string | null; etapa_id: string | null }) {
  let pipeline_id = porDefecto.pipeline_id;
  let etapa_id = porDefecto.etapa_id;
  const etiquetas: string[] = [];
  for (const r of reglas) {
    if (!cumple(cuerpo, r)) continue;
    if (r.pipeline_id) {
      pipeline_id = r.pipeline_id;
      etapa_id = r.etapa_id ?? null;
    } else if (r.etapa_id) etapa_id = r.etapa_id;
    if (r.etiqueta?.trim() && !etiquetas.includes(r.etiqueta.trim())) etiquetas.push(r.etiqueta.trim());
  }
  return { pipeline_id, etapa_id, etiquetas };
}

export function reglasValidas(x: unknown): Regla[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((r): r is Regla => !!r && typeof r === "object" && typeof (r as Regla).campo === "string" && OPERADORES.some((o) => o.v === (r as Regla).operador))
    .map((r) => ({
      campo: r.campo.trim(),
      operador: r.operador,
      valor: typeof r.valor === "string" ? r.valor : "",
      pipeline_id: r.pipeline_id || null,
      etapa_id: r.etapa_id || null,
      etiqueta: r.etiqueta?.trim() || null,
    }))
    .filter((r) => r.campo);
}
