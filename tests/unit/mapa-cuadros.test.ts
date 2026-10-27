// Cristian, 27 oct: los cuadros del mapa no se pisan y Venezuela lleva el suyo encima de Venezuela.
// Puntos y tamaños sacados del mapa real (world-atlas 110m, 800 × 400) con los leads de Maestria del 27 oct.
import { describe, expect, it } from "vitest";
import { colocarCuadros, type PuntoCuadro } from "@/lib/mapa-cuadros";

const p = (id: string, x: number, y: number, ancho: number): PuntoCuadro => ({ id, x, y, ancho, alto: 40 });
// Por orden de leads: España, Argentina, Colombia, México, Venezuela, EE. UU., Chile, Perú, Brasil
const PUNTOS = [p("ES", 393, 125, 48), p("AR", 263, 321, 65), p("CO", 235.8, 219.8, 60), p("MX", 176, 168, 48), p("VE", 251.6, 211.4, 65), p("US", 194, 127, 54), p("CL", 251, 326, 42), p("BR", 282, 258, 45), p("PE", 233.5, 253.9, 42)];

describe("colocarCuadros", () => {
  it("Venezuela, encima de su punto; Colombia, a su izquierda (ya no bajan sobre Brasil)", () => {
    const s = colocarCuadros(PUNTOS, 8);
    expect(s.VE).toBe("arriba");
    expect(s.CO).toBe("izquierda");
  });

  it("los fijos van donde se dijo (Chile arriba, Argentina abajo) y los demás no cambian", () => {
    const s = colocarCuadros(PUNTOS, 8, { CL: "arriba", AR: "abajo", PE: "izquierdaBaja" });
    expect(s.CL).toBe("arriba");
    expect(s.AR).toBe("abajo");
    expect(s.PE).toBe("izquierdaBaja");
    expect(s.VE).toBe("arriba");
    expect(s.CO).toBe("izquierda");
  });

  it("un país sin vecinos va encima", () => {
    expect(colocarCuadros([p("ES", 393, 125, 48)], 8)).toEqual({ ES: "arriba" });
  });

  it("todos tienen sitio", () => {
    expect(Object.keys(colocarCuadros(PUNTOS, 8)).sort()).toEqual(PUNTOS.map((x) => x.id).sort());
  });
});
