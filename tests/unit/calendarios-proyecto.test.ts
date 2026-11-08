// Pantalla de calendarios de GHL del proyecto: la acción valida ids, quita vacíos y repetidos, y solo la usa un admin.
import { beforeEach, describe, expect, it, vi } from "vitest";

let guardado: Record<string, unknown> | null;
let exigirImpl: () => Promise<unknown>;
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/memoria", () => ({ olvidarTodo: () => undefined }));
vi.mock("@/lib/auth", () => ({ exigir: () => exigirImpl(), puedeAdmin: {}, puedeCrearProyectos: {}, exigirCambiarComisionRol: {} }));
vi.mock("@/lib/datos", () => ({
  db: () => ({ from: () => ({ update: (v: Record<string, unknown>) => ({ eq: () => ((guardado = v), { error: null }) }) }) }),
  equipo: async () => [],
  escribir: async (p: unknown) => p,
}));
const { guardarCalendariosProyecto } = await import("@/app/(panel)/admin/acciones");

beforeEach(() => {
  guardado = null;
  exigirImpl = async () => ({ proyecto: { id: "p1" } });
});

describe("guardarCalendariosProyecto", () => {
  it("guarda los ids sin vacíos ni repetidos, recortados", async () => {
    expect(await guardarCalendariosProyecto([" abc123 ", "", "  ", "abc123", "Def_4-5"])).toBeUndefined();
    expect(guardado).toEqual({ ghl_calendarios: ["abc123", "Def_4-5"] });
  });
  it("una lista vacía vacía la columna (vuelve al modo por closer)", async () => {
    await guardarCalendariosProyecto(["", "  "]);
    expect(guardado).toEqual({ ghl_calendarios: [] });
  });
  it("un id malo rechaza todo y no guarda nada", async () => {
    for (const malo of ["con espacio", "a/b", "x".repeat(65), "ñandú", "<script>"]) {
      expect(await guardarCalendariosProyecto(["bueno1", malo])).toMatchObject({ error: expect.stringMatching(/no es válido/) });
    }
    expect(guardado).toBeNull();
  });
  it("lo que no es una lista, rechazado", async () => {
    expect(await guardarCalendariosProyecto("abc" as never)).toMatchObject({ error: expect.any(String) });
    expect(guardado).toBeNull();
  });
  it("si no eres admin, no guarda", async () => {
    exigirImpl = async () => {
      throw new Error("no admin");
    };
    expect(await guardarCalendariosProyecto(["abc"])).toMatchObject({ error: expect.any(String) });
    expect(guardado).toBeNull();
  });
});
