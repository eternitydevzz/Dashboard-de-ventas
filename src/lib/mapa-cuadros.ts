// Cristian, 27 oct 2026: dónde va el cuadro con la cifra de cada país en el mapa de KPIs → «Leads», para que no se
// pisen (antes, el de Venezuela bajaba sobre Colombia y Brasil y parecía que Venezuela estaba ahí). Cada cuadro, por
// orden de leads, va al primer sitio libre: encima de su punto, a la izquierda, a la derecha o debajo. Libre = sin
// tapar el punto de otro país ni otro cuadro ya puesto (entre cuadros, un roce de pocas unidades no cuenta). Si no hay ninguno
// libre, el que menos tapa. Todo en unidades del dibujo del mapa (800 × 400).

// «izquierdaBaja»: a la izquierda y un poco más abajo que su punto (solo como sitio fijo; Perú, para no tapar Colombia)
export type Sitio = "arriba" | "izquierda" | "derecha" | "abajo" | "izquierdaBaja";
export type PuntoCuadro = { id: string; x: number; y: number; ancho: number; alto: number };

const ORDEN: Sitio[] = ["arriba", "izquierda", "derecha", "abajo"];
const ROCE = 60; // unidades² de solape que se aceptan como «libre»
const PUNTO = 5; // medio lado del cuadrado que ocupa cada punto

type Caja = [number, number, number, number]; // x, y, ancho, alto

function caja(p: PuntoCuadro, s: Sitio, hueco: number): Caja {
  if (s === "arriba") return [p.x - p.ancho / 2, p.y - hueco - p.alto, p.ancho, p.alto];
  if (s === "izquierda") return [p.x - hueco - p.ancho, p.y - p.alto / 2, p.ancho, p.alto];
  if (s === "izquierdaBaja") return [p.x - hueco - p.ancho, p.y - p.alto * 0.15, p.ancho, p.alto];
  if (s === "derecha") return [p.x + hueco, p.y - p.alto / 2, p.ancho, p.alto];
  return [p.x - p.ancho / 2, p.y + hueco, p.ancho, p.alto];
}

function solape(a: Caja, b: Caja) {
  return Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
}
// Entre cuadros, un roce pequeño no cuenta; tapar un punto, aunque sea un poco, sí
const entreCuadros = (a: Caja, b: Caja) => (solape(a, b) < ROCE ? 0 : solape(a, b));

// `fijos`: países cuyo sitio eligió Cristian a mano (no se buscan)
export function colocarCuadros(puntos: PuntoCuadro[], hueco: number, fijos: Partial<Record<string, Sitio>> = {}): Record<string, Sitio> {
  const puestas: Caja[] = [];
  const r: Record<string, Sitio> = {};
  for (const p of puntos) {
    let mejor: { s: Sitio; c: Caja; coste: number } | null = null;
    for (const s of fijos[p.id] ? [fijos[p.id]!] : ORDEN) {
      const c = caja(p, s, hueco);
      const coste =
        puestas.reduce((t, b) => t + entreCuadros(c, b), 0) +
        puntos.filter((o) => o !== p).reduce((t, o) => t + solape(c, [o.x - PUNTO, o.y - PUNTO, PUNTO * 2, PUNTO * 2]) * 20, 0);
      if (!mejor || coste < mejor.coste) mejor = { s, c, coste };
      if (coste === 0) break;
    }
    puestas.push(mejor!.c);
    r[p.id] = mejor!.s;
  }
  return r;
}
