// Una Entrada nueva nace la última: orden = mayor orden del proyecto + 1 (0 si no hay ninguna).
import { beforeEach, describe, expect, it, vi } from "vitest";

let mayor: { orden: number } | null;
let insertado: Record<string, unknown> | null;
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/memoria", () => ({ olvidarTodo: () => undefined }));
vi.mock("@/lib/auth", () => ({ exigir: async () => ({ proyecto: { id: "p1" } }), puedeAdmin: {}, puedeCrearProyectos: {}, exigirCambiarComisionRol: {} }));
vi.mock("@/lib/datos", () => ({
  db: () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: mayor, error: null });
    q.insert = async (v: Record<string, unknown>) => ((insertado = v), { error: null });
    return { from: () => q };
  },
  equipo: async () => [],
  escribir: async (p: unknown) => p,
}));
const { crearEntrada } = await import("@/app/(panel)/admin/acciones");

const fd = () => {
  const f = new FormData();
  f.set("nombre", "Landing nueva");
  return f;
};
beforeEach(() => {
  insertado = null;
});

describe("crearEntrada · orden", () => {
  it("va detrás de la última", async () => {
    mayor = { orden: 4 };
    await crearEntrada(null, fd());
    expect(insertado).toMatchObject({ nombre: "Landing nueva", orden: 5 });
  });
  it("sin Entradas, orden 0", async () => {
    mayor = null;
    await crearEntrada(null, fd());
    expect(insertado).toMatchObject({ orden: 0 });
  });
});
