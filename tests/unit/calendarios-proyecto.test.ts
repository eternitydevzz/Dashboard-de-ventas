// Pantalla de calendarios de GHL del proyecto: la acción valida ids, quita vacíos y repetidos, y solo la usa un admin.
import { beforeEach, describe, expect, it, vi } from "vitest";

let guardado: Record<string, unknown> | null;
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, refresh: () => undefined }));
vi.mock("@/lib/memoria", () => ({ olvidarTodo: () => undefined }));
vi.mock("@/lib/datos", () => ({
  db: () => ({ from: () => ({ update: (v: Record<string, unknown>) => ({ eq: () => ((guardado = v), { error: null }) }) }) }),
  equipo: async () => [],
  escribir: async (p: unknown) => p,
}));
const { guardarCalendariosProyecto } = await import("@/app/(panel)/admin/acciones");
// exigir y puedeAdmin son los de verdad: solo se simula la sesión (setup.ts), como en 6s-seguridad.test.ts
const { getSesion } = await import("@/lib/sesion");
const como = (perfil: object) => vi.mocked(getSesion).mockResolvedValue({ perfil, proyecto: { id: "p1" } } as never);

beforeEach(() => {
  guardado = null;
  como({ id: "dir", rol: "director", admin_activo: true });
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
  it("si no eres admin (director sin Administración o closer), no guarda", async () => {
    for (const perfil of [{ id: "dir2", rol: "director", admin_activo: false }, { id: "c", rol: "closer", admin_activo: false }]) {
      como(perfil);
      expect(await guardarCalendariosProyecto(["abc"])).toEqual({ error: "No tienes permiso para esto." });
    }
    expect(guardado).toBeNull();
  });
});
