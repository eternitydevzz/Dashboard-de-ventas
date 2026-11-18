// Fase C · C-3 (decisión de Cristian): se quita la sección Reportes (pantalla y botón del menú). Los reportes ya
// rellenados se quedan en la base, y lib/reportes.ts sigue (lo usan las preguntas de Administración, D3 = no).
// Datos inventados («caller-c3», «p-c3»); la base se simula.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SECCIONES_TODAS } from "@/lib/permisos-constantes";

const PERMITIDAS = new Set(["reportes", "manuales"]);
// El rol caller tiene cerrado todo menos «reportes» y «manuales»; la persona no tiene filas propias
const filas = (tabla: string) =>
  tabla === "permisos_seccion" ? SECCIONES_TODAS.map((s) => ({ seccion: s.v, permitido: PERMITIDAS.has(s.v) })) : [];
const cadena = (tabla: string): object =>
  new Proxy(() => {}, {
    get: (_t, p) => (p === "then" ? (ok: (r: unknown) => void) => ok({ data: filas(tabla), error: null }) : () => cadena(tabla)),
  });
vi.mock("@/lib/datos", () => ({ db: () => ({ from: (tabla: string) => cadena(tabla) }) }));
const { rutaInicio } = await import("@/lib/permisos");

const leer = (ruta: string) => readFileSync(ruta, "utf8");

describe("C-3 · sin la sección Reportes", () => {
  it("la pantalla ya no existe", () => {
    expect(existsSync("src/app/(panel)/reportes/page.tsx")).toBe(false);
  });
  it("el menú no lleva a /reportes", () => {
    expect(leer("src/app/(panel)/layout.tsx")).not.toContain("/reportes");
  });
  it("el inicio nunca es /reportes: un caller con solo «reportes» y «manuales» entra en /manuales", async () => {
    const perfil = { id: "caller-c3", rol: "caller", tambien_closer: false } as never;
    expect(await rutaInicio(perfil, "p-c3")).toBe("/manuales");
  });
  it("lib/reportes.ts se queda (preguntas del reporte en Administración)", () => {
    expect(existsSync("src/lib/reportes.ts")).toBe(true);
  });
  it("el onboarding ya no promete el reporte de fin de día", () => {
    expect(leer("src/app/onboarding/page.tsx")).not.toContain("reporte de fin de día");
  });
});

// Pendiente de la Fase C (docs/PENDIENTES-JOSE.md, sección 7): sin la pantalla Reportes, esto ya no tenía llamadas
describe("C-3 · sin código muerto de avisos y reportes", () => {
  it("lib/avisos.ts (enviarAviso) ya no existe", () => {
    expect(existsSync("src/lib/avisos.ts")).toBe(false);
  });
  it("lib/reportes.ts ya no exporta rolDeReporte ni tasasCloser", async () => {
    const reportes: Record<string, unknown> = await import("@/lib/reportes");
    expect(reportes).not.toHaveProperty("rolDeReporte");
    expect(reportes).not.toHaveProperty("tasasCloser");
  });
  it("el menú ya no tiene el icono de Reportes", () => {
    expect(leer("src/components/barra-lateral.tsx")).not.toMatch(/reportes:\s*ClipboardList/);
  });
});
