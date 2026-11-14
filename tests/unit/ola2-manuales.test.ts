// Ola 2, carril G (Cristian, 14 nov): pestañas «Manuales | Guiones» y ordenar los manuales arrastrando (solo CEO y
// directores, un orden para todos). Datos inventados («m1», «dir-1»); la base se simula.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Perfil = { id: string; rol: string };
type Update = { fila: Record<string, unknown>; filtros: [string, unknown][] };
const est = {
  perfil: { id: "dir-1", rol: "director" } as Perfil,
  // manuales de la base, ya en su orden; «otro-1» es de otro proyecto
  base: [
    { id: "m1", proyecto_id: "p1" },
    { id: "m2", proyecto_id: "p1" },
    { id: "m3", proyecto_id: "p1" },
    { id: "otro-1", proyecto_id: "p2" },
  ],
  updates: [] as Update[],
};
const sesion = () => ({ perfil: est.perfil, proyecto: { id: "p1", zona_horaria: "Europe/Madrid" } });

vi.mock("@/lib/auth", () => ({ getSesion: async () => sesion(), esJefe: (p: Perfil) => p.rol === "ceo" || p.rol === "director" }));
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => sesion() }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => {} }));
vi.mock("@/lib/subidas", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/datos", () => ({
  db: () => ({
    from: () => {
      const filtros: [string, unknown][] = [];
      let fila: Record<string, unknown> | null = null;
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.order = () => c;
      c.eq = (k: string, v: unknown) => (filtros.push([k, v]), c);
      c.update = (f: Record<string, unknown>) => ((fila = f), c);
      c.then = (r: (x: unknown) => unknown) => {
        if (fila) {
          est.updates.push({ fila, filtros });
          return Promise.resolve({ data: null, error: null }).then(r);
        }
        const data = est.base.filter((m) => filtros.every(([k, v]) => (m as Record<string, unknown>)[k] === v)).map((m) => ({ id: m.id }));
        return Promise.resolve({ data, error: null }).then(r);
      };
      return c;
    },
  }),
  escribir: async <T,>(p: PromiseLike<T>) => p,
}));

const { ordenarManuales } = await import("@/app/(panel)/manuales/acciones");
const { PestanasManuales } = await import("@/app/(panel)/manuales/pestanas");
const { ordenCompleto } = await import("@/lib/manuales");

beforeEach(() => {
  est.perfil = { id: "dir-1", rol: "director" };
  est.updates = [];
});

describe("pestañas «Manuales | Guiones»", () => {
  const pinta = (manuales: boolean, guiones: boolean) => renderToStaticMarkup(createElement(PestanasManuales, { activa: "manuales", manuales, guiones }));
  it("con permiso para las 2, salen las 2 y la abierta va marcada", () => {
    const h = pinta(true, true);
    expect(h).toContain('href="/manuales"');
    expect(h).toContain('href="/guiones"');
    expect(h).toMatch(/aria-selected="true"[^>]*>Manuales/);
  });
  it("sin permiso de Guiones no sale esa pestaña (y con una sola, no hay barra)", () => {
    expect(pinta(true, false)).not.toContain("/guiones");
    expect(pinta(false, true)).not.toContain("/manuales");
  });
});

describe("orden de los manuales", () => {
  it("los que ve un mercado ocupan sus mismos sitios entre todos; el resto no se mueve", () => {
    expect(ordenCompleto(["a", "b", "c", "d"], ["d", "b"])).toEqual(["a", "d", "c", "b"]);
    expect(ordenCompleto(["a", "b", "c"], ["c", "a", "b"])).toEqual(["c", "a", "b"]);
    expect(() => ordenCompleto(["a", "b"], ["a", "a"])).toThrow(/han cambiado/);
    expect(() => ordenCompleto(["a", "b"], ["x"])).toThrow(/han cambiado/);
  });
  it("un jefe reordena y se guarda orden 0, 1, 2 en la secuencia nueva, solo en su proyecto", async () => {
    expect(await ordenarManuales(["m3", "m1", "m2"])).toBeUndefined();
    expect(est.updates.map((u) => [u.filtros.find(([k]) => k === "id")?.[1], u.fila.orden])).toEqual([["m3", 0], ["m1", 1], ["m2", 2]]);
    for (const u of est.updates) {
      expect(Object.keys(u.fila)).toEqual(["orden"]); // solo cambia el orden
      expect(u.filtros).toContainEqual(["proyecto_id", "p1"]);
    }
  });
  it("un no jefe no puede reordenar (la acción da error y no se guarda nada)", async () => {
    est.perfil = { id: "caller-1", rol: "caller" };
    expect(await ordenarManuales(["m3", "m1", "m2"])).toMatchObject({ error: expect.stringMatching(/CEO y los directores/) });
    expect(est.updates).toEqual([]);
  });
  it("un manual de otro proyecto no se toca (error y nada guardado)", async () => {
    expect(await ordenarManuales(["otro-1", "m1"])).toMatchObject({ error: expect.stringMatching(/han cambiado/) });
    expect(est.updates).toEqual([]);
  });
});
