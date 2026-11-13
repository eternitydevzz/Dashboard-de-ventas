import { ErrorUsuario } from "@/lib/error-usuario";
import type { Mercado } from "@/lib/mercado";
import type { Rol } from "@/lib/tipos";

// Fase 3 (Cristian, 13 nov 2026): popups de Administración → Popups, en la ventana de la bienvenida. Lo puro va aquí
// (con test): a quién va cada uno, cuándo vuelve a salir y qué se puede guardar.

export type Frecuencia = "sesion" | "horas" | "semana" | "ahora";
export const FRECUENCIAS: { v: Frecuencia; t: string }[] = [
  { v: "sesion", t: "1 vez por sesión" },
  { v: "horas", t: "1 vez cada X horas" },
  { v: "semana", t: "1 vez a la semana" },
  { v: "ahora", t: "Lanzar ahora (1 vez)" },
];
const ROLES: Rol[] = ["ceo", "director", "closer", "caller"];
const MERCADOS: Mercado[] = ["latam", "es"];

export type DatosPopup = {
  titulo: string;
  texto: string;
  imagen: string | null;
  boton_texto: string | null;
  boton_enlace: string | null;
  roles: Rol[];
  personas: string[];
  mercados: Mercado[];
  frecuencia: Frecuencia;
  cada_horas: number | null;
};
export type Popup = DatosPopup & { id: string; activo: boolean; lanzado_en: string | null; creado_en: string };
// Lo que llega a la ventana (popups y avisos_persona juntos)
export type TarjetaPopup = { id: string; origen: "popup" | "aviso"; frecuencia: Frecuencia | null; titulo: string; texto: string; imagen: string | null; boton: { texto: string; enlace: string } | null };

// A quién: las personas elegidas, y además quien tiene uno de los roles y es de uno de los mercados (ninguno = los 2)
export function vaPara(p: Pick<DatosPopup, "roles" | "personas" | "mercados">, quien: { id: string; rol: Rol; mercado: Mercado }) {
  if (p.personas.includes(quien.id)) return true;
  return p.roles.includes(quien.rol) && (!p.mercados.length || p.mercados.includes(quien.mercado));
}

// Cuándo, según la última vez que la persona lo cerró (`visto`). «Sesión» la decide el navegador (quitarVistosEnSesion).
export function toca(p: Pick<Popup, "activo" | "frecuencia" | "cada_horas" | "lanzado_en">, visto: string | null, ahora: Date, inicioSemana: Date) {
  if (!p.activo) return false;
  const v = visto ? new Date(visto).getTime() : null;
  switch (p.frecuencia) {
    case "sesion":
      return true;
    case "horas":
      return v === null || ahora.getTime() - v >= (p.cada_horas ?? 24) * 3_600_000;
    case "semana":
      return v === null || v < inicioSemana.getTime(); // semana de lunes a domingo en la zona del proyecto
    case "ahora":
      return !!p.lanzado_en && (v === null || v < new Date(p.lanzado_en).getTime());
  }
}

// «1 vez por sesión»: los ya cerrados en esta pestaña no vuelven (sessionStorage, solo en el navegador)
export const CLAVE_SESION = (id: string) => `eternity_popup_${id}`;
export const quitarVistosEnSesion = <T extends { id: string; frecuencia: Frecuencia | null }>(lista: T[], visto: (clave: string) => boolean) =>
  lista.filter((t) => t.frecuencia !== "sesion" || !visto(CLAVE_SESION(t.id)));

const textoCorto = (v: unknown, max: number, que: string, obligatorio: boolean) => {
  const t = typeof v === "string" ? v.trim() : "";
  if (obligatorio && !t) throw new ErrorUsuario(`Pon ${que}.`);
  if (t.length > max) throw new ErrorUsuario(`${que[0].toUpperCase()}${que.slice(1)} es demasiado largo (máximo ${max}).`);
  return t || null;
};
// Imagen: solo https. Botón: https o una sección de la app («/crm»).
function enlace(v: unknown, que: string, interno: boolean) {
  const t = textoCorto(v, 500, que, false);
  if (!t) return null;
  if (interno && t.startsWith("/") && !t.startsWith("//")) return t;
  try {
    if (new URL(t).protocol === "https:") return t;
  } catch {
    // cae al error de abajo
  }
  throw new ErrorUsuario(`${que[0].toUpperCase()}${que.slice(1)} tiene que empezar por https://${interno ? " (o ser una sección, como /crm)" : ""}.`);
}
// Para enlaces que escribe otra parte de la app (avisos_persona): uno raro se quita en vez de enseñarlo
export const enlaceSeguro = (v: unknown) => {
  try {
    return enlace(v, "el enlace", true);
  } catch {
    return null;
  }
};
const lista = <T extends string>(v: unknown, validos: readonly T[]) => (Array.isArray(v) ? [...new Set(v.filter((x): x is T => validos.includes(x as T)))] : []);

export function popupValido(x: unknown): DatosPopup {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const titulo = textoCorto(o.titulo, 120, "el título", true) as string;
  const texto = textoCorto(o.texto, 2000, "el texto", true) as string;
  const boton_enlace = enlace(o.boton_enlace, "el enlace del botón", true);
  const boton_texto = boton_enlace ? textoCorto(o.boton_texto, 40, "el texto del botón", false) ?? "Ver más" : null;
  const roles = lista(o.roles, ROLES);
  const mercados = lista(o.mercados, MERCADOS);
  const personas = Array.isArray(o.personas) ? [...new Set(o.personas.filter((p): p is string => typeof p === "string" && /^[0-9a-f-]{36}$/i.test(p)))] : [];
  if (!roles.length && !personas.length) throw new ErrorUsuario("Elige a quién va: un rol o una persona.");
  const frecuencia = FRECUENCIAS.some((f) => f.v === o.frecuencia) ? (o.frecuencia as Frecuencia) : null;
  if (!frecuencia) throw new ErrorUsuario("Elige cuándo sale.");
  let cada_horas: number | null = null;
  if (frecuencia === "horas") {
    cada_horas = Number(o.cada_horas);
    if (!Number.isInteger(cada_horas) || cada_horas < 1 || cada_horas > 720) throw new ErrorUsuario("Las horas van de 1 a 720.");
  }
  return { titulo, texto, imagen: enlace(o.imagen, "la imagen", false), boton_texto, boton_enlace, roles, personas, mercados, frecuencia, cada_horas };
}
