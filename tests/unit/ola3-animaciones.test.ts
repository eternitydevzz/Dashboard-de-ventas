// Cristian, 14 nov (noche): «cuando pasa de CRM a KPI… unas animaciones raras que hacen que se vea mal» → «sí, arréglalas».
// Grabado en producción fotograma a fotograma: copia del CRM desenfocándose encima (0,2 s), pantalla casi vacía al quitarse
// el esqueleto (todo empezaba invisible), cifras que subían solas y 1,2 s de cascada con desenfoque fila a fila.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DURACION_PANEL, modoEntrada, retrasoPanel } from "@/components/animaciones/valores";

const leer = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), "utf8");
const efectos = leer("src/components/animaciones/efectos.ts");
const animaciones = leer("src/components/animaciones/animaciones.tsx");

describe("al cambiar de sección", () => {
  it("cascada solo al abrir la app; al navegar o tras el esqueleto, un fundido corto de todo a la vez", () => {
    expect(modoEntrada(true, false)).toBe("cascada");
    expect(modoEntrada(false, false)).toBe("fundido");
    expect(modoEntrada(false, true)).toBe("fundido");
    expect(modoEntrada(true, true)).toBe("fundido");
  });
  it("el fundido no empieza invisible (sin pantalla vacía) y dura 0,15 s", () => {
    expect(efectos).toMatch(/export function fundido[\s\S]*?opacity: 0\.5[\s\S]*?duration: 150/);
  });
  it("la salida es un fundido de 0,12 s sin desenfoque", () => {
    const salida = efectos.slice(efectos.indexOf("export function salida"), efectos.indexOf("// ---------- 5"));
    expect(salida).not.toMatch(/blur/);
    expect(salida).toMatch(/duration: 120/);
  });
  it("las cifras no suben solas al cambiar de sección", () => {
    expect(animaciones).not.toMatch(/conteo: true|conteo = !primeraCarga/);
  });
});

describe("la cascada al abrir la app, más corta y sin filas desenfocadas", () => {
  it("como mucho 0,4 s en total", () => {
    expect(retrasoPanel(99) + DURACION_PANEL).toBeLessThanOrEqual(400);
  });
  it("las filas no se animan una a una", () => {
    expect(efectos).not.toMatch(/tbody tr/);
  });
});

describe("menú: la precarga al pasar el ratón", () => {
  it("el enlace se vuelve a montar al activar la precarga (si solo cambia el prop, Next no precarga)", () => {
    expect(leer("src/components/barra-lateral.tsx")).toMatch(/key=\{conPrecarga\(it\.href\) \? "precarga" : "normal"\}/);
  });
});
