import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// Fase 9 (Cristian, 14 nov 2026: «pantalla de carga y, al terminar, todo ya cargado, sin romper la app»).
const leer = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), "utf8");
const PANEL = "src/app/(panel)";

// Cuenta cada db().from(tabla); cualquier cadena (.select().eq()…) devuelve 0 filas
const tablas: string[] = [];
const cadena: object = new Proxy(() => {}, {
  get: (_t, p) => (p === "then" ? (ok: (r: unknown) => void) => ok({ data: [], error: null }) : () => cadena),
});
vi.mock("@/lib/datos", async (original) => ({
  ...(await original<typeof import("@/lib/datos")>()),
  db: () => ({ from: (t: string) => (tablas.push(t), cadena) }),
  equipo: async () => [],
  conBajas: async () => [],
}));
vi.mock("@/lib/metricas", () => ({ ASISTIDAS: [], cargarBase: async () => ({ actividades: [], citas: [], ventas: [] }) }));
vi.mock("@/lib/biblioteca-datos", () => ({ recalcularOfertas: async () => undefined }));
vi.mock("next/server", () => ({ after: () => undefined }));

describe("Fase 9 · velocidad", () => {
  it("(panel)/loading.tsx ya sale al cambiar de sección; sin copias en las carpetas de cada sección", () => {
    // Comprobado en node_modules/next/dist/client/components/layout-router.js: el loading de (panel) envuelve a cada
    // sección hija con su propia clave, así que sale al ir de /crm a /kpis. Un loading.tsx dentro de una sección
    // taparía la pantalla entera en cada filtro o pestaña (la clave de la página lleva la query: __PAGE__?{…}) y
    // volvería a montar «Leads» y «UTMs», que pedirían sus datos otra vez a la base.
    expect(existsSync(new URL(`../../${PANEL}/loading.tsx`, import.meta.url))).toBe(true);
    for (const s of ["kpis", "crm", "caller", "closer", "ventas", "equipo", "finanzas", "reportes", "ranking", "mi-funnel", "manuales", "admin"])
      expect(existsSync(new URL(`../../${PANEL}/${s}/loading.tsx`, import.meta.url)), s).toBe(false);
  });

  it("KPIs → Leads ya no usa «al instante» (no mejoró nada medible, 13 nov)", () => {
    expect(leer("src/lib/leads-kpis.ts")).not.toContain("alInstante");
    expect(leer("src/lib/memoria.ts")).not.toContain("alInstante");
  });

  it("KPIs → Leads pide a la base lo mismo que antes: 4 lecturas (leads, tarjetas, pipelines, etapas)", async () => {
    const { cargarLeadsKpis } = await import("@/lib/leads-kpis");
    await cargarLeadsKpis({ id: "p1" } as Parameters<typeof cargarLeadsKpis>[0]);
    expect(tablas.sort()).toEqual(["etapas", "leads", "pipelines", "tarjetas_extra"]);
  });
});
