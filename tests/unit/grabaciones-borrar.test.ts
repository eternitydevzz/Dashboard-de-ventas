// N9 (Cristian, 13 nov): borrar una grabación (fila + audio). Base y Storage simulados, datos inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string } | null };
let fila: Resp;
let quitarAudio: Resp;
let borrarFila: Resp;
let ops: string[];
let rol: string;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      let borra = false;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "maybeSingle"]) q[m] = () => q;
      q.delete = () => ((borra = true), q);
      q.then = (r: (v: Resp) => unknown) => {
        if (borra) ops.push(`borra ${tabla}`);
        return Promise.resolve(borra ? borrarFila : fila).then(r);
      };
      return q;
    },
    storage: { from: (bucket: string) => ({ remove: async (rutas: string[]) => (ops.push(`quita ${bucket}:${rutas.join(",")}`), quitarAudio) }) },
  }),
}));
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => ({ perfil: { id: "u1", rol }, proyecto: { id: "p1" } }) }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => undefined }));
const { borrarGrabacion } = await import("@/app/(panel)/grabaciones/acciones");

beforeEach(() => {
  ops = [];
  rol = "ceo";
  fila = { data: { id: "g1", archivo_path: "p1/abc.webm" }, error: null };
  quitarAudio = { data: [{ name: "abc.webm" }], error: null };
  borrarFila = { data: null, error: null };
});

describe("N9 · borrar grabación", () => {
  it("un caller o un closer no puede: no se toca nada", async () => {
    for (const r of ["caller", "closer"]) {
      rol = r;
      expect(await borrarGrabacion("g1")).toEqual({ error: expect.stringMatching(/CEO y los directores/) });
    }
    expect(ops).toEqual([]);
  });
  it("CEO o director: quita el audio de «grabaciones» y después la fila", async () => {
    expect(await borrarGrabacion("g1")).toBeUndefined();
    rol = "director";
    expect(await borrarGrabacion("g1")).toBeUndefined();
    expect(ops).toEqual(["quita grabaciones:p1/abc.webm", "borra grabaciones_caller", "quita grabaciones:p1/abc.webm", "borra grabaciones_caller"]);
  });
  it("si falla el audio, la fila se queda y se avisa", async () => {
    quitarAudio = { data: null, error: { message: "storage caído" } };
    expect(await borrarGrabacion("g1")).toEqual({ error: expect.stringMatching(/audio/) });
    expect(ops).toEqual(["quita grabaciones:p1/abc.webm"]);
  });
  it("una grabación que no es de este proyecto (o ya borrada) no borra nada", async () => {
    fila = { data: null, error: null };
    expect(await borrarGrabacion("g1")).toEqual({ error: expect.stringMatching(/no encontrada/i) });
    expect(ops).toEqual([]);
  });
  it("si falla borrar la fila, no dice «borrada»", async () => {
    borrarFila = { data: null, error: { message: "fallo" } };
    expect(await borrarGrabacion("g1")).toEqual({ error: expect.any(String) });
  });
});
