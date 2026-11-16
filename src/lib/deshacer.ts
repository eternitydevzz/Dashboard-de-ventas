// N2 (Cristian, 16 nov): Ctrl+Z / Cmd+Z deshace la última acción apuntada en la app. Fase 1: mover leads (caller y
// CRM); el resto de acciones, en la Fase 1b. Dentro de un campo de texto, Ctrl+Z deshace el texto como siempre.
// Se apunta con el aviso de toasts.tsx (opción «deshacer»), que también enseña el botón «Deshacer».
export type PasoDeshacer = { texto: string; deshacer: () => unknown };

const MAX = 20;
const CADUCA_MS = 15 * 60_000; // revisor 1b: un Ctrl+Z tardío no pisa lo que otra persona cambió después
const pila: PasoDeshacer[] = [];
const hora = new WeakMap<PasoDeshacer, number>();
const vivo = (p: PasoDeshacer) => Date.now() - (hora.get(p) ?? 0) <= CADUCA_MS;

export function apuntarDeshacer(paso: PasoDeshacer) {
  pila.push(paso);
  hora.set(paso, Date.now());
  if (pila.length > MAX) pila.shift();
}

// Saca el paso de la lista (por el botón «Deshacer» o por Ctrl+Z): cada paso se deshace una sola vez
export function sacarDeshacer(paso?: PasoDeshacer) {
  if (!paso) {
    while (pila.length) {
      const p = pila.pop()!;
      if (vivo(p)) return p;
    }
    return undefined;
  }
  const i = pila.lastIndexOf(paso);
  const p = i >= 0 ? pila.splice(i, 1)[0] : undefined;
  return p && vivo(p) ? p : undefined;
}

export function vaciarDeshacer() {
  pila.length = 0;
}

export function esAtajoDeshacer(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">) {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z";
}

export function esCampoDeTexto(el: EventTarget | null) {
  if (!el || typeof el !== "object") return false;
  const e = el as { tagName?: string; isContentEditable?: boolean; type?: string };
  if (e.isContentEditable) return true;
  if (e.tagName === "TEXTAREA" || e.tagName === "SELECT") return true;
  return e.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "range", "color", "file"].includes(e.type ?? "text");
}
