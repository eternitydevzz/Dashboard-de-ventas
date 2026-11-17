// Cristian, 17 nov: la X de cada manual lo borra (CEO y directores). Datos inventados; la base se simula.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Perfil = { id: string; rol: string };
const est = {
  perfil: { id: "dir-1", rol: "director" } as Perfil,
  base: [] as { id: string; proyecto_id: string; archivo_path: string }[],
  borrados: [] as string[],
};
const sesion = () => ({ perfil: est.perfil, proyecto: { id: "p1", zona_horaria: "Europe/Madrid" } });

vi.mock("@/lib/auth", () => ({ getSesion: async () => sesion(), esJefe: (p: Perfil) => p.rol === "ceo" || p.rol === "director" }));
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => sesion() }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => {} }));
vi.mock("@/lib/subidas", () => ({ borrarSubida: async (_b: string, ruta: string) => void est.borrados.push(ruta) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/datos", () => ({
  db: () => ({
    from: () => {
      const filtros: [string, unknown][] = [];
      const c: Record<string, unknown> = {};
      c.delete = () => c;
      c.select = () => c;
      c.eq = (k: string, v: unknown) => (filtros.push([k, v]), c);
      c.then = (r: (x: unknown) => unknown) => {
        const quita = est.base.filter((m) => filtros.every(([k, v]) => (m as Record<string, unknown>)[k] === v));
        est.base = est.base.filter((m) => !quita.includes(m));
        return Promise.resolve({ data: quita.map((m) => ({ archivo_path: m.archivo_path })), error: null }).then(r);
      };
      return c;
    },
  }),
  escribir: async <T,>(p: PromiseLike<T>) => p,
}));

const { borrarManual } = await import("@/app/(panel)/manuales/acciones");

beforeEach(() => {
  est.perfil = { id: "dir-1", rol: "director" };
  est.base = [
    { id: "m1", proyecto_id: "p1", archivo_path: "p1/m1.html" },
    { id: "otro", proyecto_id: "p2", archivo_path: "p2/otro.html" },
  ];
  est.borrados = [];
});

describe("borrarManual", () => {
  it("un director borra el manual de su proyecto y su archivo", async () => {
    expect(await borrarManual("m1")).toBeUndefined();
    expect(est.base.map((m) => m.id)).toEqual(["otro"]);
    expect(est.borrados).toEqual(["p1/m1.html"]);
  });
  it("no borra un manual de otro proyecto", async () => {
    expect(await borrarManual("otro")).toMatchObject({ error: "Manual no encontrado." });
    expect(est.base).toHaveLength(2);
    expect(est.borrados).toEqual([]);
  });
  it("un caller no puede borrar", async () => {
    est.perfil = { id: "c-1", rol: "caller" };
    expect(await borrarManual("m1")).toMatchObject({ error: expect.stringMatching(/CEO y los directores/) });
    expect(est.base).toHaveLength(2);
  });
});
