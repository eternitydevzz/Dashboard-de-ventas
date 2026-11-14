// Ola 2 (Cristian, 14 nov: velocidad): los enlaces de filtros, periodo, mercado y Análisis no se precargan.
// Cada enlace visible precargaba hasta (panel)/loading.tsx y eso ejecutaba el layout (lecturas a la base).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ARCHIVOS = ["src/components/barra-periodo.tsx", "src/components/filtros.tsx", "src/components/selector-mercado.tsx", "src/app/(panel)/closer/analisis/page.tsx"];

describe("enlaces sin precarga", () => {
  it.each(ARCHIVOS)("%s: todos los <Link> llevan prefetch={false}", (r) => {
    const s = readFileSync(new URL(`../../${r}`, import.meta.url), "utf8");
    const enlaces = s.match(/<Link[\s\n][^>]*>/g) ?? [];
    expect(enlaces.length).toBeGreaterThan(0);
    expect(enlaces.filter((l) => !l.includes("prefetch={false}"))).toEqual([]);
  });
});
