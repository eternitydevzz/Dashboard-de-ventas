// C9: la limpieza de subidas huérfanas (más de 1 día sin usar) no puede borrar un manual en uso.
import { describe, expect, it, vi } from "vitest";

const borrados: string[][] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        list: async () => ({ data: [{ name: "a.html", created_at: "2026-11-01T00:00:00Z" }, { name: "b.html", created_at: "2026-11-01T00:00:00Z" }], error: null }),
        remove: async (r: string[]) => (borrados.push(r), { error: null }),
      }),
    },
    from: (tabla: string) => {
      const q = { select: () => q, eq: () => q, not: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve({ data: tabla === "manuales" ? [{ archivo_path: "p1/a.html" }] : [], error: null }).then(r) };
      return q;
    },
  }),
}));
const { limpiarSubidasHuerfanas } = await import("@/lib/subidas");

describe("C9 · limpieza de subidas", () => {
  it("borra el .html que no usa ningún manual y deja el que sí", async () => {
    const n = await limpiarSubidasHuerfanas("manuales", "p1", new Date("2026-11-07T00:00:00Z").getTime());
    expect(n).toBe(1);
    expect(borrados).toEqual([["p1/b.html"]]);
  });
});
