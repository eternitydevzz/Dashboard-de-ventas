// Cristian, 14 nov (noche): «vuelve a poner las animaciones y arregla los fallos». Las de la maqueta se quedan igual;
// solo se arreglan los 2 fallos grabados en producción al pasar de CRM a KPIs.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { retrasoFila, retrasoPanel } from "@/components/animaciones/valores";

const leer = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), "utf8");
const efectos = leer("src/components/animaciones/efectos.ts");
const animaciones = leer("src/components/animaciones/animaciones.tsx");

describe("las animaciones de la maqueta siguen igual", () => {
  it("cascada, desenfoque, filas y conteo como antes", () => {
    expect(retrasoPanel(10)).toBe(600);
    expect(retrasoFila(0, 0)).toBe(200);
    expect(efectos).toMatch(/filter: "blur\(10px\)"/);
    expect(efectos).toMatch(/tbody tr/);
    expect(animaciones).toMatch(/const conteo = !primeraCarga/);
  });
});

describe("sin los fallos", () => {
  it("fotograma vacío: una copia del esqueleto se funde encima mientras entra la sección", () => {
    expect(animaciones).toMatch(/const copiaEsqueleto = conEsqueleto \? copiaDe\(raiz\) : null/);
    expect(animaciones).toMatch(/if \(copiaEsqueleto\) velo\(copiaEsqueleto\);\s*entrar\(0\)/);
    expect(efectos).toMatch(/export function velo[\s\S]*?opacity: 1 \}, \{ opacity: 0 \}[\s\S]*?duration: 300/);
  });
  it("mezcla: con esqueleto, la salida de la sección anterior va 3 veces más rápida", () => {
    expect(animaciones).toMatch(/if \(conEsqueleto\) fantasma\?\.getAnimations\(\)\.forEach\(\(a\) => \(a\.playbackRate = 3\)\)/);
    expect(animaciones).toMatch(/fantasma = salida\(raiz\)/);
  });
});
