import { ErrorUsuario } from "@/lib/resultado";

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
