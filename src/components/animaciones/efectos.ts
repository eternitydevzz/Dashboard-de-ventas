// Animaciones de la maqueta aprobada (cristalEntrada, cristalFoto, cristalIndicadores, cristalContar, onda y arrastre),
// hechas desde fuera con la API de animación del navegador. Todas con fill "backwards" o sin fill: al acabar no queda
// ningún estilo puesto, y nunca bloquean el clic.
import { DESLIZA, SUAVE, panelConDesenfoque, retrasoFila, retrasoPanel, textoConteo } from "./valores";

export const quieto = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const PANEL = ".tarjeta";
const FILAS = "tbody tr, li, div[role=button]";
const BARRAS = '[role=tablist], nav[aria-label^="Secciones"]';
const NUMEROS = ".font-semibold.tabular-nums:is(.text-xl,.text-2xl,.text-3xl)";

// ---------- 1, 2 y 6: entrada en cascada, título y números/gráficas/anillos/barras ----------
export function entrada(raiz: HTMLElement, { base = 0, titulo = false, barra = null as Element | null } = {}) {
  if (quieto()) return;
  if (titulo)
    raiz.querySelector("h1")?.animate(
      [{ clipPath: "inset(0 0 100% 0)", transform: "translateY(70%)" }, { clipPath: "inset(-10% 0 -20% 0)", transform: "none" }],
      { duration: 420, delay: base, easing: SUAVE, fill: "backwards" },
    );
  // con una pestaña cambiada, solo entra lo que va debajo de su barra; la cabecera se queda quieta
  const tras = (x: Element) => !barra || (!barra.contains(x) && !x.contains(barra) && !!(barra.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING));
  const alto = innerHeight;
  const paneles = [...raiz.querySelectorAll(PANEL)].filter((x) => !x.parentElement?.closest(PANEL) && tras(x));
  paneles.forEach((x, n) => {
    x.animate(
      panelConDesenfoque(n)
        ? [{ opacity: 0, transform: "translateY(12px)", filter: "blur(10px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }]
        : [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
      { duration: 450, delay: retrasoPanel(n, base), easing: SUAVE, fill: "backwards" },
    );
    // shortcut: solo las filas a la vista (un tablero con cientos de tarjetas desenfocadas va a tirones), sin tope si hiciera falta
    [...x.querySelectorAll(FILAS)]
      .filter((f) => f.getBoundingClientRect().top < alto)
      .forEach((f, j) =>
        f.animate([{ opacity: 0, transform: "translateY(8px)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], {
          duration: 320, delay: retrasoFila(n, j, base), easing: SUAVE, fill: "backwards",
        }),
      );
  });
  const dentro = (sel: string) => paneles.flatMap((p) => [...p.querySelectorAll(sel)]);
  dentro(NUMEROS).forEach((el) => contar(el as HTMLElement));
  // gráficas de línea: se descubren de izquierda a derecha
  dentro('svg:has(path[fill="none"])').forEach((g) =>
    g.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 500, delay: base + 250, easing: "ease-out", fill: "backwards" }),
  );
  // anillos: el trazo se llena
  dentro('svg circle[stroke-dasharray][transform^="rotate(-90"]').forEach((c) => {
    const d = c.getAttribute("stroke-dasharray") || "";
    const total = d.split(" ").reduce((s, v) => s + (Number(v) || 0), 0) || 999;
    c.animate([{ strokeDasharray: `0 ${total}` }, { strokeDasharray: d }], { duration: 500, delay: base + 300, easing: SUAVE, fill: "backwards" });
  });
  // barras de progreso: crecen desde la izquierda
  dentro('.overflow-hidden.rounded-full > [style*="width"], [role=progressbar] > [style*="width"]').forEach((b) =>
    b.animate([{ transform: "scaleX(0)", transformOrigin: "left" }, { transform: "none", transformOrigin: "left" }], {
      duration: 500, delay: base + 300, easing: SUAVE, fill: "backwards",
    }),
  );
}

// El número sube desde el 80 % en 0,5 s. Toca el mismo nodo de texto que pinta React y se para si React lo cambia
export function contar(el: HTMLElement) {
  const nodo = el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE ? el.firstChild : null;
  const fin = nodo?.nodeValue;
  if (!nodo || !fin || !/\d/.test(fin)) return;
  let escrito = fin;
  const t0 = performance.now();
  const paso = (t: number) => {
    if (!nodo.isConnected || nodo.nodeValue !== escrito) return;
    const p = Math.min(1, (t - t0) / 500);
    nodo.nodeValue = escrito = textoConteo(fin, p);
    if (p < 1) requestAnimationFrame(paso);
  };
  nodo.nodeValue = escrito = textoConteo(fin, 0);
  requestAnimationFrame(paso);
}

// ---------- 3: salida ----------
// Una copia de la pantalla que se va, encima y sin recibir clics, se desenfoca en 0,2 s mientras entra la nueva
export function salida(raiz: HTMLElement) {
  if (quieto() || !raiz.isConnected || !raiz.firstElementChild) return false;
  const r = raiz.getBoundingClientRect();
  const g = raiz.cloneNode(true) as HTMLElement;
  g.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id"));
  g.setAttribute("aria-hidden", "true");
  g.inert = true;
  g.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;margin:0;pointer-events:none;z-index:1`;
  document.body.appendChild(g);
  g.animate([{ opacity: 1, filter: "blur(0)" }, { opacity: 0, filter: "blur(10px)" }], { duration: 200, easing: "ease-in", fill: "forwards" });
  setTimeout(() => g.remove(), 220);
  return true;
}

// ---------- 5: pestañas ----------
// Activa de una barra: la marcada como seleccionada o la pintada en azul (las de Agendas)
const activa = (b: Element) => b.querySelector('[aria-selected="true"], [aria-current="page"]') ?? b.querySelector(":scope > .bg-primario, :scope > * > .bg-primario");
// Cada barra se reconoce por sus textos (son los mismos en todas las vistas; la página puede pintarla de nuevo)
export type FotoPestanas = Map<string, { izq: number; arriba: number; ancho: number; alto: number }>;

// Dónde está la activa de cada barra, medido desde su barra (la barra no se mueve al cambiar de pestaña)
export function fotoPestanas(raiz: HTMLElement): FotoPestanas {
  const foto: FotoPestanas = new Map();
  raiz.querySelectorAll(BARRAS).forEach((b) => {
    const a = activa(b)?.getBoundingClientRect();
    const r = b.getBoundingClientRect();
    if (a) foto.set(b.textContent ?? "", { izq: a.left - r.left, arriba: a.top - r.top, ancho: a.width, alto: a.height });
  });
  return foto;
}

// La raya o la píldora viaja hasta la pestaña nueva; devuelve la barra que cambió (para que solo entre lo de debajo)
export function deslizarPestanas(raiz: HTMLElement, antes: FotoPestanas): Element | null {
  let cambiada: Element | null = null;
  raiz.querySelectorAll(BARRAS).forEach((b) => {
    const e = activa(b) as HTMLElement | null;
    const f = antes.get(b.textContent ?? "");
    if (!e || !f) return;
    const r = b.getBoundingClientRect();
    const nb = e.getBoundingClientRect();
    const na = { left: r.left + f.izq, top: r.top + f.arriba, width: f.ancho, height: f.alto };
    if (Math.abs(na.left - nb.left) < 1 && Math.abs(na.top - nb.top) < 1) return;
    cambiada ??= b;
    if (quieto()) return;
    const dx = na.left - nb.left;
    const dy = na.top - nb.top;
    // KPIs: la línea azul de debajo viaja ella misma
    const raya = e.querySelector<HTMLElement>(":scope > span.absolute");
    if (raya)
      return void raya.animate(
        [{ transform: `translate(${dx}px,${dy}px) scaleX(${na.width / nb.width})`, transformOrigin: "left" }, { transform: "none", transformOrigin: "left" }],
        { duration: 300, easing: DESLIZA },
      );
    viajar(e, dx, dy, [na.width, nb.width], [na.height, nb.height], 300);
  });
  return cambiada;
}

// Una copia del fondo de la opción activa viaja por debajo de su texto desde donde estaba la anterior
function viajar(e: HTMLElement, dx: number, dy: number, anchos: number[], altos: number[], duracion: number) {
  const ind = document.createElement("span");
  ind.className = "anim-resalte";
  ind.style.cssText = estiloFinal(e);
  e.classList.add("anim-desliza");
  e.prepend(ind);
  let hecho = false;
  const fin = () => {
    if (hecho) return;
    hecho = true;
    ind.remove();
    // sin transición al quitar la clase: el fondo de verdad aparece de golpe donde acaba la copia
    const t = e.style.transition;
    e.style.transition = "none";
    e.classList.remove("anim-desliza");
    void getComputedStyle(e).backgroundColor;
    e.style.transition = t;
  };
  ind.animate(
    [{ transform: `translate(${dx}px,${dy}px)`, width: `${anchos[0]}px`, height: `${altos[0]}px` }, { transform: "none", width: `${anchos[1]}px`, height: `${altos[1]}px` }],
    { duration: duracion, easing: DESLIZA },
  ).onfinish = fin;
  setTimeout(fin, duracion + 200);
}

// ---------- 7: onda al hacer clic en botones ----------
export function onda(e: PointerEvent) {
  if (quieto() || !(e.target as Element | null)?.closest?.("button, [role=button], .btn, .btn-primario, .btn-secundario, .btn-peligro")) return;
  const o = document.createElement("span");
  o.className = "anim-onda";
  o.style.left = `${e.clientX}px`;
  o.style.top = `${e.clientY}px`;
  document.body.appendChild(o);
  o.animate([{ transform: "translate(-50%,-50%) scale(.3)", opacity: 0.8 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 0 }], { duration: 400, easing: "ease-out", fill: "forwards" });
  setTimeout(() => o.remove(), 450);
}

// ---------- 8: arrastre de tarjetas (el de la app, nativo del navegador) ----------
const TARJETA = "div[role=button][data-id]";
let cogida: { id: string; dx: number; dy: number } | null = null;

// Al cogerla: la imagen que sigue al ratón es la tarjeta levantada (escala 1,04 y giro de -2°)
export function alCoger(e: DragEvent) {
  cogida = null; // arrastrar una columna u otra cosa no deja una tarjeta vieja apuntada
  const c = (e.target as Element | null)?.closest?.(TARJETA) as HTMLElement | null | undefined;
  if (!c || quieto() || !e.dataTransfer) return;
  const r = c.getBoundingClientRect();
  cogida = { id: c.dataset.id!, dx: e.clientX - r.left, dy: e.clientY - r.top };
  const pad = 16; // margen para que el giro no corte las esquinas
  const caja = document.createElement("div");
  caja.style.cssText = `position:fixed;left:-10000px;top:0;padding:${pad}px;width:${r.width + pad * 2}px;pointer-events:none`;
  const copia = c.cloneNode(true) as HTMLElement;
  copia.removeAttribute("data-id");
  copia.style.cssText = "transform:scale(1.04) rotate(-2deg);box-shadow:0 18px 40px rgb(0 0 0/.35)";
  caja.appendChild(copia);
  document.body.appendChild(caja);
  e.dataTransfer.setDragImage(caja, cogida.dx + pad, cogida.dy + pad);
  setTimeout(() => caja.remove(), 0);
}

// Al soltar: se mira dónde estaba cada tarjeta y, en cuanto la app repinta, cada una viaja desde allí
export function alSoltar(e: DragEvent) {
  const s = cogida;
  cogida = null;
  if (!s || quieto()) return;
  const antes = new Map<string, DOMRect>();
  document.querySelectorAll<HTMLElement>(TARJETA).forEach((c) => antes.set(c.dataset.id!, c.getBoundingClientRect()));
  const soltada = { x: e.clientX - s.dx, y: e.clientY - s.dy };
  const obs = new MutationObserver(() => {
    obs.disconnect();
    requestAnimationFrame(() => recolocar(antes, s.id, soltada));
  });
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 1500);
}

function recolocar(antes: Map<string, DOMRect>, id: string, soltada: { x: number; y: number }) {
  const vistas = new Set<string>();
  document.querySelectorAll<HTMLElement>(TARJETA).forEach((c) => {
    const k = c.dataset.id!;
    if (vistas.has(k)) return; // mismo lead en dos tarjetas: solo la primera
    vistas.add(k);
    const b = c.getBoundingClientRect();
    if (k === id)
      return void c.animate(
        [{ transform: `translate(${soltada.x - b.left}px,${soltada.y - b.top}px) scale(1.04) rotate(-2deg)`, zIndex: 5 }, { transform: "none", zIndex: 5 }],
        { duration: 360, easing: "cubic-bezier(.2,.9,.3,1.2)" },
      );
    const a = antes.get(k);
    if (!a) return;
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 340, easing: DESLIZA });
  });
}

// Fondo, esquinas y sombra ya terminados (sin esperar a la transición del propio elemento)
function estiloFinal(el: HTMLElement) {
  const t = el.style.transition;
  el.style.transition = "none";
  const cs = getComputedStyle(el);
  const s = `background:${cs.backgroundColor};border-radius:${cs.borderTopLeftRadius};box-shadow:${cs.boxShadow}`;
  el.style.transition = t;
  return s;
}

// ---------- 4: resalte del menú lateral ----------
// Una copia del resalte (mismo fondo y sombra del enlace activo) viaja desde la opción vieja a la nueva
export function deslizarResalte(nuevo: HTMLElement, viejo: HTMLElement | null) {
  if (!viejo || quieto() || nuevo === viejo) return;
  const a = viejo.getBoundingClientRect();
  const b = nuevo.getBoundingClientRect();
  if (Math.abs(a.top - b.top) >= 1) viajar(nuevo, a.left - b.left, a.top - b.top, [a.width, b.width], [a.height, b.height], 320);
}
