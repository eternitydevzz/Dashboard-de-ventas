// Plan GHL, fase 1 (Cristian, 6 nov 2026): lo que el dashboard manda a GHL por un lead de una Entrada, como hacía
// el workflow con «Inbound Webhook»: contacto, campos (con su id de GHL), UTM, etiqueta final y oportunidad.
// Se juntan TODOS los envíos del lead a esa Entrada (registro, cuestionario, uno que llega tarde…) en uno solo.
// Etiqueta: `<base>-completo` si algún envío trae el campo de «completo» a true (por defecto `quiz_completed`,
// lo que manda la Biblioteca en el cuestionario); si no, `<base>-incompleto`. Nunca vuelve de completo a incompleto.
// Plan GHL, B (Cristian, 7 nov 2026): una Entrada puede crear oportunidad en VARIOS pipelines de GHL (la agenda de la
// Biblioteca: «0. Agendas Biblioteca» y «0. Agendas General») y poner etiquetas fijas (las viejas, por si algún workflow
// o lista de GHL las usa: `agenda biblioteca`, `biblioteca recursos`). Las fijas se añaden siempre y nunca se quitan.
// Sin base de datos ni internet: se prueba en tests/unit/entrada-ghl.test.ts.
import { interpretar, leerCampo, str } from "@/lib/entrada";

type Json = Record<string, unknown>;

export type ConfigGhl = {
  campos: Record<string, string>; // { campo del envío (admite «quiz.situacion»): id del campo de GHL }
  pipelineId: string | null; // el pipeline de siempre: solo si la lista `oportunidades` está vacía
  etapaId: string | null;
  oportunidades?: { pipeline_id: string; etapa_id: string | null }[]; // sin columna = la primera de GHL, sin mover la que ya hay
  etiquetaBase: string | null;
  etiquetasExtra?: string[];
  campoCompleto: string;
};
export type OportunidadEnvio = { pipelineId: string; etapaId: string | null; nombre: string };

export type ContactoUpsert = { firstName?: string; lastName?: string; email?: string; phone?: string; source?: string };
export type EnvioGhl = {
  contacto: ContactoUpsert; // sin `tags`: en el upsert de GHL ese campo BORRA todas las etiquetas del contacto
  customFields: { id: string; field_value: string }[];
  completo: boolean;
  etiqueta: string | null; // la final (`<base>-completo` / `-incompleto`)
  etiquetas: string[]; // todas las que se ponen: la final y las fijas, en minúsculas y sin repetir
  quitar: string | null; // la contraria (solo `-incompleto`, cuando ya está completo)
  oportunidades: OportunidadEnvio[];
};

const esObjeto = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const vacio = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim());

// En orden de llegada: lo nuevo completa lo anterior; un vacío no borra; los objetos (p. ej. `quiz`) se juntan
export function juntarEnvios(envios: Json[]): Json {
  const unir = (a: Json, b: Json): Json => {
    const r: Json = { ...a };
    for (const [k, v] of Object.entries(b)) {
      if (vacio(v)) continue;
      r[k] = esObjeto(v) && esObjeto(r[k]) ? unir(r[k] as Json, v) : v;
    }
    return r;
  };
  return envios.reduce<Json>((acc, e) => unir(acc, e ?? {}), {});
}

export function estaCompleto(envios: Json[], campo: string): boolean {
  if (!campo.trim()) return false;
  return envios.some((e) => str(leerCampo(e ?? {}, campo.trim())).toLowerCase() === "true");
}

// Texto para GHL: listas separadas por comas, números y sí/no como texto
function valorGhl(v: unknown): string {
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(", ");
  return str(v);
}

export function armarEnvioGhl(envios: Json[], config: ConfigGhl): EnvioGhl {
  const junto = juntarEnvios(envios);
  const { lead, fuente } = interpretar(junto);

  const contacto: ContactoUpsert = {};
  if (lead.nombre) contacto.firstName = lead.nombre;
  if (lead.apellido) contacto.lastName = lead.apellido;
  if (lead.email) contacto.email = lead.email;
  if (lead.telefono) contacto.phone = lead.telefono;
  if (fuente) contacto.source = fuente;

  const customFields: EnvioGhl["customFields"] = [];
  for (const [campo, id] of Object.entries(config.campos ?? {})) {
    if (!campo.trim() || !str(id)) continue;
    const valor = valorGhl(leerCampo(junto, campo.trim()));
    if (valor) customFields.push({ id: str(id), field_value: valor });
  }

  const completo = estaCompleto(envios, config.campoCompleto);
  // En minúsculas, como las guarda GHL (visto en la prueba real del 6 nov): así es la misma en GHL y en el dashboard
  const base = (config.etiquetaBase ?? "").trim().toLowerCase();
  const nombre = [lead.nombre, lead.apellido].filter(Boolean).join(" ") || lead.email || lead.telefono || "Lead";

  const etiqueta = base ? `${base}-${completo ? "completo" : "incompleto"}` : null;
  const etiquetas = [...new Set([etiqueta, ...(config.etiquetasExtra ?? [])].map((t) => str(t).trim().toLowerCase()).filter(Boolean))];

  // La lista manda; vacía = el pipeline de siempre (compatible con las Entradas de antes). Un pipeline, una vez.
  const lista = (config.oportunidades ?? []).filter((o) => str(o?.pipeline_id).trim());
  const destinos = lista.length ? lista.map((o) => ({ pipelineId: str(o.pipeline_id).trim(), etapaId: str(o.etapa_id).trim() || null })) : config.pipelineId ? [{ pipelineId: config.pipelineId, etapaId: config.etapaId || null }] : [];
  const vistos = new Set<string>();
  const oportunidades = destinos.filter((o) => !vistos.has(o.pipelineId) && !!vistos.add(o.pipelineId)).map((o) => ({ ...o, nombre }));

  return { contacto, customFields, completo, etiqueta, etiquetas, quitar: base && completo ? `${base}-incompleto` : null, oportunidades };
}

// Las etiquetas del lead en el dashboard, iguales que en GHL (Cristian, 6 nov): se añade la final y se quita la contraria
export function etiquetasApp(actuales: string[] | null, e: Pick<EnvioGhl, "etiqueta" | "quitar"> & { etiquetas?: string[] }): string[] {
  const poner = e.etiquetas ?? (e.etiqueta ? [e.etiqueta] : []);
  const fuera = new Set([e.quitar, ...poner].filter(Boolean).map((x) => x!.toLowerCase()));
  const r = (actuales ?? []).filter((t) => !fuera.has(t.toLowerCase()));
  return [...r, ...poner];
}
