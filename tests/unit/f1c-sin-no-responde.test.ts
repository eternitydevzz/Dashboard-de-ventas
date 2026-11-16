// Fase 1 · zona C (N1, Cristian): fuera «No responde» de los estados, botones, reparto, estrellas, MCP y reporte.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ESTADOS_CALLER, BOTONES_RESULTADO, esContacto, etiquetaEstado } from "@/lib/estados-caller";
import { SIN_TRABAJAR } from "@/lib/reparto";
import { ESCALA_CALLER } from "@/lib/estrellas";

describe("f1c · sin «No responde»", () => {
  it("11 columnas y 8 botones, sin no_responde", () => {
    expect(ESTADOS_CALLER.map((e) => e.t)).toEqual(["Leads", "Wsp enviado", "No interesa", "Seguimiento", "Llamar luego", "Link enviado", "Agendado", "Confirma Agenda", "Reagendado", "Descartado", "Cerrados"]);
    expect(BOTONES_RESULTADO).not.toContain("no_responde");
    expect(BOTONES_RESULTADO).toHaveLength(8);
  });
  it("el historial viejo se sigue leyendo «No responde» y no es contacto", () => {
    expect(etiquetaEstado("no_responde")).toBe("No responde");
    expect(esContacto({ tipo: "cambio_etapa", resultado: "no_responde" })).toBe(false);
  });
  it("reparto y estrellas sin «No responde»", () => {
    expect(SIN_TRABAJAR).not.toContain("no_responde");
    expect(ESCALA_CALLER).toHaveLength(5);
    expect(ESCALA_CALLER).not.toContain("No responde");
  });
  it("MCP: ni en la lista de estados ni en la descripción de la herramienta", () => {
    const cambiar = readFileSync("src/lib/mcp/cambiar.ts", "utf8");
    expect(cambiar.match(/export const ESTADOS[^\n]*/)![0]).not.toContain("no_responde");
    const ruta = readFileSync("src/app/api/mcp/route.ts", "utf8");
    expect(ruta).not.toContain("no_responde");
  });
  it("reporte de fin de día: «no responden» cuenta solo las llamadas de GHL «no contesta»", () => {
    const pagina = readFileSync("src/app/(panel)/reportes/page.tsx", "utf8");
    expect(pagina).not.toContain('"no_responde"');
    expect(pagina).not.toContain('resultado === "no_responde"');
  });
});
