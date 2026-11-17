// 17 nov (Cristian): en el móvil el guion gana alto (barra de resultados fina, una fila con scroll) y
// «Copiar número» avisa si falla la copia. Lee el código, como f1a-cola.test.ts (los tests van sin DOM).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const g = readFileSync("src/components/guion-llamada.tsx", "utf8");
const pie = g.slice(g.indexOf("<footer"), g.indexOf("</footer>"));

describe("Guion en el móvil", () => {
  it("los resultados van en una sola fila con scroll horizontal por debajo de sm y en rejilla desde sm", () => {
    expect(pie).toMatch(/className="flex gap-1\.5 overflow-x-auto[^"]*sm:grid sm:grid-cols-\[repeat\(auto-fill,minmax\(150px,1fr\)\)\]/);
  });
  it("ningún botón de resultado es alto en el móvil (sin min-h-[52px] ni columna)", () => {
    expect(pie).not.toContain("min-h-[52px]");
    expect(pie).not.toMatch(/(^|\s)flex-col/);
  });
});

describe("Copiar número", () => {
  it("si el portapapeles falla, avisa con el número para copiarlo a mano", () => {
    expect(g).toMatch(/catch \{\s*toast\(`No se pudo copiar el número\. Cópialo a mano: \$\{telefono\}`, "error"\)/);
  });
});
