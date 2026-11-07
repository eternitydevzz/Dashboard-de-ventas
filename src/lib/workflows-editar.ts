// Workflows 4c (boceto del editor aprobado por Cristian el 7 nov 2026): editar el árbol de pasos y validarlo antes de
// guardar. Sin base de datos: se usa en el navegador (editor) y en el servidor (guardar). Tests: tests/unit/workflows-editar.test.ts
import { ErrorUsuario } from "@/lib/error-usuario";
import type { Paso } from "@/lib/workflows";

// Ruta a una lista de pasos o a un paso: índices y, para entrar en una rama, "c", n.º de camino (o "s" = «si no»)
// [1, "c", 0, 2] = el paso 2 del camino 0 de la rama que está en la posición 1
export type Ruta = (number | "c" | "s")[];
type Rama = Extract<Paso, { tipo: "rama" }>;

// La lista que contiene la ruta (sin el último índice) y cómo reemplazarla
function enLista(pasos: Paso[], ruta: Ruta, cambio: (lista: Paso[]) => Paso[]): Paso[] {
  if (!ruta.length) return cambio(pasos);
  const [i, que, ...resto] = ruta;
  if (typeof i !== "number") throw new Error("Ruta no válida");
  const p = pasos[i];
  if (!p || p.tipo !== "rama") throw new Error("Ruta no válida");
  let r: Rama;
  if (que === "s") r = { ...p, si_no: enLista(p.si_no, resto, cambio) };
  else if (que === "c") {
    const [n, ...dentro] = resto;
    if (typeof n !== "number" || !p.caminos[n]) throw new Error("Ruta no válida");
    r = { ...p, caminos: p.caminos.map((c, k) => (k === n ? { ...c, pasos: enLista(c.pasos, dentro, cambio) } : c)) };
  } else throw new Error("Ruta no válida");
  return pasos.map((x, k) => (k === i ? r : x));
}

export function verPaso(pasos: Paso[], ruta: Ruta): Paso | null {
  let lista = pasos;
  let k = 0;
  while (k < ruta.length) {
    const i = ruta[k];
    if (typeof i !== "number") return null;
    const p = lista[i];
    if (!p) return null;
    if (k === ruta.length - 1) return p;
    if (p.tipo !== "rama") return null;
    if (ruta[k + 1] === "s") {
      lista = p.si_no;
      k += 2;
    } else if (ruta[k + 1] === "c") {
      const n = ruta[k + 2];
      if (typeof n !== "number" || !p.caminos[n]) return null;
      lista = p.caminos[n].pasos;
      k += 3;
    } else return null;
  }
  return null;
}

// `lista` = ruta de la lista (p. ej. [] o [1, "c", 0]); `en` = posición donde entra
export const insertarPaso = (pasos: Paso[], lista: Ruta, en: number, paso: Paso) => enLista(pasos, lista, (l) => [...l.slice(0, en), paso, ...l.slice(en)]);
export const cambiarPaso = (pasos: Paso[], ruta: Ruta, paso: Paso) => enLista(pasos, ruta.slice(0, -1), (l) => l.map((x, k) => (k === ruta.at(-1) ? paso : x)));
export const quitarPaso = (pasos: Paso[], ruta: Ruta) => enLista(pasos, ruta.slice(0, -1), (l) => l.filter((_, k) => k !== ruta.at(-1)));

const nuevoId = (tipo: string) => `${tipo.split("_")[0]}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
export function pasoNuevo(tipo: Paso["tipo"]): Paso {
  const id = nuevoId(tipo);
  switch (tipo) {
    case "esperar":
      return { id, tipo, segundos: 300 };
    case "contacto_ghl":
      return { id, tipo, campos: {} };
    case "etiquetas_ghl":
      return { id, tipo, base: null, fijas: [], campo_completo: "quiz_completed" };
    case "oportunidad_ghl":
      return { id, tipo, pipeline_id: "", etapa_id: null };
    case "quitar_etiqueta_ghl":
      return { id, tipo, etiqueta: "" };
    case "mover_dashboard":
      return { id, tipo, pipeline_id: "", etapa_id: null };
    case "rama":
      return { id, tipo, caminos: [{ condicion: { campo: "utm_source", operador: "igual", valor: "" }, pasos: [] }], si_no: [] };
  }
}

// ---------- Validar antes de guardar ----------
export const MAX_PASOS = 60;
export const MAX_NIVELES = 3;
const OPERADORES = ["igual", "contiene", "existe", "no_existe"] as const;
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const idExterno = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v.trim()) ? v.trim() : null);

export function pasosValidos(x: unknown): Paso[] {
  if (!Array.isArray(x)) throw new ErrorUsuario("Los pasos tienen que ser una lista.");
  const ids = new Set<string>();
  let total = 0;
  const lista = (l: unknown[], nivel: number): Paso[] =>
    l.map((bruto) => {
      total++;
      if (total > MAX_PASOS) throw new ErrorUsuario(`Como mucho ${MAX_PASOS} pasos por workflow.`);
      const p = (bruto ?? {}) as Record<string, unknown>;
      const id = texto(p.id, 64);
      if (!id) throw new ErrorUsuario("Un paso no tiene id.");
      if (ids.has(id)) throw new ErrorUsuario("Hay pasos con el id repetido.");
      ids.add(id);
      switch (p.tipo) {
        case "esperar": {
          const s = Math.round(Number(p.segundos));
          if (!Number.isFinite(s) || s < 0 || s > 7 * 86400) throw new ErrorUsuario("Esperar: de 0 segundos a 7 días.");
          return { id, tipo: "esperar", segundos: s };
        }
        case "contacto_ghl": {
          const campos: Record<string, string> = {};
          for (const [k, v] of Object.entries((p.campos ?? {}) as Record<string, unknown>)) {
            const c = texto(k, 120);
            const g = idExterno(v);
            if (c && g) campos[c] = g;
          }
          return { id, tipo: "contacto_ghl", campos };
        }
        case "etiquetas_ghl": {
          const fijas = [...new Set((Array.isArray(p.fijas) ? p.fijas : []).map((t) => texto(t, 80).toLowerCase()).filter(Boolean))];
          if (fijas.some((t) => t.includes(","))) throw new ErrorUsuario("Las etiquetas no llevan comas.");
          return { id, tipo: "etiquetas_ghl", base: texto(p.base, 80) || null, fijas, campo_completo: texto(p.campo_completo, 120) };
        }
        case "oportunidad_ghl":
        case "mover_dashboard": {
          const pipeline = idExterno(p.pipeline_id);
          if (!pipeline) throw new ErrorUsuario("Elige el pipeline de cada oportunidad y de cada «Mover».");
          const etapa = p.etapa_id ? idExterno(p.etapa_id) : null;
          if (p.etapa_id && !etapa) throw new ErrorUsuario("Una columna no es válida.");
          return { id, tipo: p.tipo, pipeline_id: pipeline, etapa_id: etapa };
        }
        case "quitar_etiqueta_ghl": {
          const t = texto(p.etiqueta, 80).toLowerCase();
          if (!t) throw new ErrorUsuario("Pon la etiqueta que hay que quitar.");
          return { id, tipo: "quitar_etiqueta_ghl", etiqueta: t };
        }
        case "rama": {
          if (nivel >= MAX_NIVELES) throw new ErrorUsuario(`Como mucho ${MAX_NIVELES} niveles de ramas.`);
          const caminos = Array.isArray(p.caminos) ? p.caminos : [];
          if (!caminos.length || caminos.length > 10) throw new ErrorUsuario("Una rama lleva de 1 a 10 caminos (más «si no»).");
          return {
            id,
            tipo: "rama",
            caminos: caminos.map((c: { condicion?: Record<string, unknown>; pasos?: unknown }) => {
              const campo = texto(c?.condicion?.campo, 120);
              if (!campo) throw new ErrorUsuario("Cada camino de una rama tiene que mirar un campo.");
              const op = OPERADORES.find((o) => o === c?.condicion?.operador);
              if (!op) throw new ErrorUsuario("Una condición de rama no es válida.");
              const valor = texto(c?.condicion?.valor, 200);
              if ((op === "igual" || op === "contiene") && !valor) throw new ErrorUsuario("Pon el valor de cada camino («es…» o «contiene…»).");
              return { condicion: op === "existe" || op === "no_existe" ? { campo, operador: op } : { campo, operador: op, valor }, pasos: lista(Array.isArray(c?.pasos) ? c.pasos : [], nivel + 1) };
            }),
            si_no: lista(Array.isArray(p.si_no) ? p.si_no : [], nivel + 1),
          };
        }
        default:
          throw new ErrorUsuario("Hay un paso de un tipo que no existe.");
      }
    });
  return lista(x, 0);
}

// ¿Mismo contenido? Sin que importe el orden de las claves de los objetos (Postgres jsonb las reordena al guardar);
// el orden de las listas (los pasos) sí importa.
const canonico = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonico) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonico((v as Record<string, unknown>)[k])])) : v;
export const mismoContenido = (a: unknown, b: unknown) => JSON.stringify(canonico(a)) === JSON.stringify(canonico(b));
