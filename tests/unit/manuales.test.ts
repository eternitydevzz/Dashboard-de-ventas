// C9 (plan Callers, 7 nov): sección «Manuales». El .html subido se ve dentro de la app, aislado (sandbox sin
// allow-same-origin): sus scripts corren, pero no pueden leer la sesión ni tocar la app.
import { describe, expect, it } from "vitest";
import { CSP_VISOR, htmlParaVisor, tituloManual } from "@/lib/manuales";
import { DEFECTO } from "@/lib/permisos-constantes";

describe("C9 · visor de manuales", () => {
  it("la política aísla el manual: scripts sí, mismo origen no, y solo se enmarca en la app", () => {
    expect(CSP_VISOR).toContain("sandbox allow-scripts");
    expect(CSP_VISOR).not.toContain("allow-same-origin");
    expect(CSP_VISOR).toContain("frame-ancestors 'self'");
    expect(CSP_VISOR).toContain("connect-src 'none'"); // no puede mandar datos a ningún sitio
  });
  it("mete el arreglo de localStorage lo primero del <head> (el modo oscuro de los manuales lo usa)", () => {
    const h = htmlParaVisor('<!doctype html><html><head><meta charset="utf-8"><title>M</title></head><body>hola</body></html>');
    expect(h.indexOf("localStorage")).toBeGreaterThan(h.indexOf("<head>"));
    expect(h.indexOf("localStorage")).toBeLessThan(h.indexOf("<title>"));
    expect(h).toContain("<body>hola</body>");
  });
  it("sin <head>, el arreglo va al principio", () => {
    expect(htmlParaVisor("<p>hola</p>").startsWith("<script>")).toBe(true);
  });
  it("título: recortado, obligatorio y como mucho 80 caracteres", () => {
    expect(tituloManual("  Manual general  ")).toBe("Manual general");
    expect(() => tituloManual("   ")).toThrow(/título/);
    expect(() => tituloManual("x".repeat(81))).toThrow(/80/);
  });
});

describe("C9 · permisos", () => {
  it("lo ve todo el mundo por defecto", () => {
    for (const rol of ["director", "closer", "caller"] as const) expect(DEFECTO[rol].has("manuales")).toBe(true);
  });
});
