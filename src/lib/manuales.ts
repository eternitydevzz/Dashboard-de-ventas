import { ErrorUsuario } from "@/lib/resultado";
import { MERCADOS, mercadoDe, type Mercado } from "@/lib/mercado";

export { CSP_VISOR } from "@/lib/csp"; // vive en csp.ts para que proxy.ts la use sin cargar nada más

// En el aislamiento, tocar localStorage da error y el script del manual se corta (lo usa para el modo oscuro).
// Este arreglo, lo primero del <head>, pone uno en memoria: funciona igual y no guarda nada.
const ARREGLO_ALMACEN =
  '<script>(function(){var m={},s={getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}};try{window.localStorage.getItem("x")}catch(e){try{Object.defineProperty(window,"localStorage",{value:s,configurable:true})}catch(_){}}})();</script>';

export function htmlParaVisor(html: string) {
  const head = /<head[^>]*>/i.exec(html);
  if (!head) return ARREGLO_ALMACEN + html;
  const fin = head.index + head[0].length;
  return html.slice(0, fin) + ARREGLO_ALMACEN + html.slice(fin);
}

export function tituloManual(t: unknown) {
  const s = String(t ?? "").trim();
  if (!s) throw new ErrorUsuario("Pon un título al manual.");
  if (s.length > 80) throw new ErrorUsuario("El título puede tener como mucho 80 caracteres.");
  return s;
}

// Cristian, 14 nov: cada manual lo ven los mercados marcados en su ajuste ⚙ (España, Latam o los 2). España ya no cae
// en los de Latam (contenidoMercado().filas sí lo hace; lo siguen usando Recursos y Programas).
type ConMercados = { mercados?: string[] | null; mercado?: string | null };
export const mercadosDe =(m: ConMercados): Mercado[] => (m.mercados?.length ? m.mercados.map(mercadoDe) : [mercadoDe(m.mercado)]); // sin la columna nueva, la vieja
export const veManual = (m: ConMercados, mercado: Mercado | null) => mercadosDe(m).includes(mercadoDe(mercado));
export const manualesDeMercado = <T extends ConMercados>(filas: T[], mercado: Mercado | null) => filas.filter((f) => veManual(f, mercado));

export function mercadosValidos(v: unknown): Mercado[] {
  const lista = Array.isArray(v) ? v : [];
  const r = MERCADOS.map((m) => m.v).filter((m) => lista.includes(m));
  if (!r.length) throw new ErrorUsuario("Marca al menos un mercado.");
  return r;
}

// Cristian, 14 nov: un solo orden para todos, pero cada mercado reordena solo los que ve. Esos ocupan los mismos
// sitios que ya tenían entre todos; los demás no se mueven.
export function ordenCompleto(todos: string[], nuevos: string[]): string[] {
  const mueve = new Set(nuevos);
  if (mueve.size !== nuevos.length || !nuevos.every((id) => todos.includes(id))) throw new ErrorUsuario("Los manuales han cambiado. Recarga la página.");
  let k = 0;
  return todos.map((id) => (mueve.has(id) ? nuevos[k++] : id));
}

// «Quién lo ha visto»: cada persona de esos mercados, con la última vez que lo abrió (null = sin ver)
export function quienLoHaVisto(mercados: Mercado[], personas: { id: string; nombre: string }[], mercadoDePersona: Record<string, Mercado>, vistos: { perfil_id: string; visto_en: string }[]) {
  const cuando = new Map(vistos.map((v) => [v.perfil_id, v.visto_en]));
  return personas.filter((p) => mercados.includes(mercadoDe(mercadoDePersona[p.id]))).map((p) => ({ id: p.id, nombre: p.nombre, visto_en: cuando.get(p.id) ?? null }));
}
