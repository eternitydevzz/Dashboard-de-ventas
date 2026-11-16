// Fase 0 · zona b: X1 (barras con pct() como CSS), X2 (CSV de KPIs → Leads sin neutralizar fórmulas), S2-6 (links de pago sin «Recursos").
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { pct } from "@/lib/formato";
import { csvExcel } from "@/lib/csv-excel";

const update = vi.fn();
vi.mock("@/lib/permisos", async () => {
  const { ErrorUsuario } = await import("@/lib/resultado");
  return { exigirSeccion: vi.fn(async () => { throw new ErrorUsuario("No tienes acceso a esta sección."); }) };
});
vi.mock("@/lib/auth", () => ({ exigir: vi.fn(async () => ({ perfil: { id: "d", rol: "director" }, proyecto: { id: "p1" } })), puedeRecursos: () => true }));
vi.mock("@/lib/datos", () => ({ db: () => ({ from: () => ({ update }) }), escribir: vi.fn() }));
vi.mock("@/lib/memoria", () => ({ olvidarTodo: vi.fn() }));

const leer = (r: string) => readFileSync(new URL(`../../src/${r}`, import.meta.url), "utf8");
const BARRAS = ["app/(panel)/closer/llamadas/cualificacion.tsx", "app/(panel)/finanzas/tab-resumen.tsx", "app/(panel)/ranking/page.tsx", "app/(panel)/equipo/alta.tsx", "components/metricas-agendas-vista.tsx"];

describe("X1 · las barras usan un porcentaje CSS válido", () => {
  it("pct() no es CSS válido (por eso se rompían)", () => {
    expect(pct(45.5)).not.toMatch(/^\d+(\.\d+)?%$/);
  });
  it.each(BARRAS)("%s no mete pct() en un style", (r) => {
    const estilos = leer(r).match(/style=\{[^}]*\}/g) ?? [];
    expect(estilos.length).toBeGreaterThan(0);
    expect(estilos.filter((s) => s.includes("pct("))).toEqual([]);
  });
});

describe("X2 · Exportar CSV de KPIs → Leads neutraliza fórmulas", () => {
  it("usa csvExcel y no Papa.unparse", () => {
    const src = leer("app/(panel)/kpis/leads-acciones.tsx");
    expect(src).not.toMatch(/Papa\.unparse/);
    expect(src).toMatch(/csvExcel\(/);
  });
  it("una fila con =HYPERLINK sale neutralizada", () => {
    expect(csvExcel(["Nombre"], [['=HYPERLINK("http://malo","clic")']])).toContain(`"'=HYPERLINK(""http://malo"",""clic"")"`);
  });
});

describe("S2-6 · links de pago exigen la sección «Recursos»", () => {
  it("sin la sección, las dos acciones fallan y no tocan la base", async () => {
    const { guardarLinksPago, guardarLinkReserva } = await import("@/app/(panel)/recursos/acciones");
    expect(await guardarLinksPago("prod1", [{ nombre: "x", url: "https://pago.example" }])).toEqual({ error: "No tienes acceso a esta sección." });
    expect(await guardarLinkReserva("https://reserva.example")).toEqual({ error: "No tienes acceso a esta sección." });
    expect(update).not.toHaveBeenCalled();
  });
});
