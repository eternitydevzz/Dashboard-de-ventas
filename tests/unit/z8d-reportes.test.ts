// Fase 8, zona D (17 nov): al abrir el reporte, si el de hoy ya está enviado, se avisa de que el nuevo lo sustituye.
// Datos inventados («caller-1»); la base se simula.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Lectura = { tabla: string; ops: [string, unknown[]][] };
const lecturas: Lectura[] = [];
const est = { cuantosHoy: 1 };
const cadena = (l: Lectura): object =>
  new Proxy(() => {}, {
    get: (_t, p) => (p === "then" ? (ok: (r: unknown) => void) => ok({ data: [], error: null, count: l.tabla === "reportes" ? est.cuantosHoy : 0 }) : (...a: unknown[]) => (l.ops.push([String(p), a]), cadena(l))),
  });

vi.mock("@/lib/datos", async (orig) => ({
  ...(await orig<object>()),
  db: () => ({ from: (tabla: string) => { const l = { tabla, ops: [] }; lecturas.push(l); return cadena(l); } }),
  equipo: async () => [],
  conBajas: async () => [],
  todas: async () => [],
}));
vi.mock("@/lib/permisos", async (orig) => ({
  ...(await orig<object>()),
  exigirPagina: async () => ({ perfil: { id: "caller-1", rol: "caller" }, proyecto: { id: "p1", zona_horaria: "Europe/Madrid", preguntas_reporte: null } }),
}));
const { default: ReportesPage } = await import("@/app/(panel)/reportes/page");
const { VentanaReporte } = await import("@/app/(panel)/reportes/formulario");
const { hoyEnZona } = await import("@/lib/formato");

function buscar(n: unknown, nombre: string): { props: Record<string, unknown> } | null {
  if (!n || typeof n !== "object") return null;
  if (Array.isArray(n)) return n.map((x) => buscar(x, nombre)).find(Boolean) ?? null;
  const e = n as { type?: { name?: string }; props?: Record<string, unknown> };
  if (e.type?.name === nombre) return e as { props: Record<string, unknown> };
  return Object.values(e.props ?? {}).map((x) => buscar(x, nombre)).find(Boolean) ?? null;
}
const abrir = async () => buscar(await ReportesPage({ searchParams: Promise.resolve({}) } as never), "NuevoReporte")!.props;

describe("Reporte de hoy ya enviado", () => {
  it("la página mira si hay uno de hoy de esta persona en este proyecto", async () => {
    lecturas.length = 0;
    est.cuantosHoy = 1;
    expect((await abrir()).yaEnviadoHoy).toBe(true);
    const hoy = lecturas.find((l) => l.tabla === "reportes" && l.ops.some(([op, a]) => op === "eq" && a[0] === "fecha"))!;
    expect(hoy.ops).toEqual(expect.arrayContaining([["eq", ["proyecto_id", "p1"]], ["eq", ["perfil_id", "caller-1"]], ["eq", ["fecha", hoyEnZona("Europe/Madrid")]]]));
  });
  it("sin reporte de hoy, no hay aviso", async () => {
    est.cuantosHoy = 0;
    expect((await abrir()).yaEnviadoHoy).toBe(false);
  });
  it("la ventana enseña el aviso solo si ya lo envió", () => {
    const pinta = (yaEnviadoHoy: boolean) =>
      renderToStaticMarkup(createElement(VentanaReporte, { rol: "caller", hoy: "2026-11-17", sugeridos: {}, preguntas: [], yaEnviadoHoy, onCerrar: () => {} }));
    expect(pinta(true)).toContain("Ya enviaste el de hoy. Si lo envías otra vez, sustituye al anterior.");
    expect(pinta(false)).not.toContain("Ya enviaste el de hoy");
  });
});
