import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// D42 (13 nov): estas pestañas y filtros no hacen precarga completa (cada una pintaba la página entera en el servidor)
const ARCHIVOS = [
  "src/components/selector-mercado.tsx",
  "src/app/(panel)/guiones/page.tsx",
  "src/app/(panel)/finanzas/page.tsx",
  "src/app/(panel)/programas/page.tsx",
  "src/app/(panel)/admin/page.tsx",
  "src/app/(panel)/recursos/page.tsx",
  "src/app/(panel)/clientes/page.tsx",
];

describe("D42 · sin precargas completas en pestañas", () => {
  it.each(ARCHIVOS)("%s no usa prefetch={true}", (archivo) => {
    expect(readFileSync(archivo, "utf8")).not.toMatch(/prefetch=\{true\}/);
  });
});
