// Fases 5-6 zona C (Cristian, 17 nov 2026): S1-12 / X5 · «Analizar pendientes» mira TODAS las grabaciones
// conciliadas (Supabase corta en 1.000 filas) y, si la base falla, avisa en vez de decir «0 en cola».
import { describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({ falla: false }));
// 1.500 grabaciones conciliadas: las 1.000 primeras ya tienen análisis; las 500 últimas, no
const gs = Array.from({ length: 1500 }, (_, i) => ({ id: `g${i}`, analisis_llamadas: i < 1000 ? [{ id: `a${i}` }] : [] }));
vi.mock("@/lib/datos", async (original) => {
  const real = await original<typeof import("@/lib/datos")>();
  const consulta = () => {
    let desde = 0, hasta = 999; // sin .range(), como mucho 1.000 (supabase/config.toml)
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "order"]) q[m] = () => q;
    q.range = (a: number, b: number) => ((desde = a), (hasta = Math.min(b, a + 999)), q);
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(base.falla ? { data: null, error: { message: "base caída" } } : { data: gs.slice(desde, hasta + 1), error: null }).then(ok);
    return q;
  };
  return { ...real, db: () => ({ from: () => consulta() }) };
});
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => undefined }));
vi.mock("@/lib/auth", () => ({ getSesion: async () => ({ perfil: { id: "j1", rol: "ceo" }, proyecto: { id: "p1" } }), esJefe: () => true }));
vi.mock("next/server", () => ({ after: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/ia", () => ({ hayClaveIa: () => true, encolarAnalisis: vi.fn(async () => undefined), pedirJson: vi.fn(), peticion: vi.fn(), procesarPendientes: vi.fn(async () => 0) }));
vi.mock("@/lib/cualificacion-datos", () => ({ datosEstudio: vi.fn() }));
vi.mock("@/app/(panel)/closer/acciones", () => ({ cambiarEstadoCita: vi.fn() }));

const { analizarPendientesAhora } = await import("@/app/(panel)/closer/analisis/acciones");

describe("S1-12 · Analizar pendientes", () => {
  it("con más de 1.000 grabaciones, pone en cola las que no tienen análisis", async () => {
    expect(await analizarPendientesAhora()).toEqual({ nuevas: 500 });
  });

  it("si la base falla, no dice «0 en cola»", async () => {
    base.falla = true;
    try {
      const r = await analizarPendientesAhora();
      expect(r).toHaveProperty("error");
    } finally {
      base.falla = false;
    }
  });
});
