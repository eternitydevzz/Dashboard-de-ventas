// Fase 8, zona D (17 nov): arreglos pequeños del panel. Datos inventados.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/(panel)/perfil/acciones", () => ({ guardarHorario: async () => {} }));
vi.mock("@/app/(panel)/leads/acciones", () => ({ zonasDeAgendar: async () => ({}) }));
const { EmbudoVidrio } = await import("@/components/embudo-vidrio");
const { CampanaAvisos } = await import("@/components/campana-avisos");
const { clicCierra } = await import("@/components/modal");
const { EditorHorario } = await import("@/components/editor-horario");

describe("embudo de vidrio", () => {
  it("«se pierden» nunca sale negativo (un paso puede tener más que el anterior)", () => {
    const html = renderToStaticMarkup(createElement(EmbudoVidrio, { pasos: [{ t: "Leads", n: 10 }, { t: "Ventas", n: 12 }] }));
    expect(html).toContain("se pierden 0");
    expect(html).not.toMatch(/se pierden (-|−)/);
  });
});

describe("campana de avisos", () => {
  it("cuenta avisos, no suma sus cuentas", () => {
    const avisos = [
      { tipo: "envio_rojo" as const, cuantos: 30, texto: "A" },
      { tipo: "calendario" as const, cuantos: 7, texto: "B" },
    ];
    const html = renderToStaticMarkup(createElement(CampanaAvisos, { avisos }));
    expect(html).toMatch(/>2<\/span>/);
    expect(html).not.toContain(">37<");
  });
});

describe("ventana (Modal)", () => {
  it("el fondo cierra solo si el clic empezó y acabó en él", () => {
    expect(clicCierra(true, true, 1)).toBe(true);
    expect(clicCierra(true, true, 2)).toBe(false); // el 2.º clic de un doble clic no cierra (S4-11)
    expect(clicCierra(false, true, 1)).toBe(false); // arrastrar desde dentro hacia fuera
    expect(clicCierra(true, false, 1)).toBe(false);
  });
});

describe("editor de horario", () => {
  it("la zona del proyecto se llama como en el resto de la app («España», no «Madrid»)", () => {
    const html = renderToStaticMarkup(createElement(EditorHorario, { inicial: { semana: {}, fechas: {} }, zona: "Europe/Madrid" }));
    expect(html).toContain("España");
    expect(html).not.toContain(">Madrid<");
  });
});
