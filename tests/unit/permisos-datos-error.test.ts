// X4 (fases 5-6): la pantalla de Permisos leía deRol y dePersona sin mirar el error: un fallo de la base salía como
// «todo por defecto» y quien guardaba encima pisaba los permisos de verdad. Ahora el error sale.
import { describe, expect, it, vi } from "vitest";

let fallaTabla = "";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/datos", () => ({
  db: () => ({
    from: (tabla: string) => ({ select: () => ({ eq: async () => (tabla === fallaTabla ? { data: null, error: { message: "caída" } } : { data: [], error: null }) }) }),
  }),
}));
vi.mock("@/lib/permisos", async (o) => ({ ...(await o<object>()), seccionesPermitidas: async () => new Set<string>() }));
const { cargarDatosPermisos } = await import("@/lib/permisos-datos");
const perfil = { id: "u1", rol: "ceo" } as never;

describe("cargarDatosPermisos", () => {
  it("sin errores, carga", async () => {
    fallaTabla = "";
    expect((await cargarDatosPermisos(perfil, "p1")).deRol).toEqual({});
  });
  it.each(["permisos_seccion", "permisos_persona"])("si falla %s, lanza el error (no lo da por vacío)", async (t) => {
    fallaTabla = t;
    await expect(cargarDatosPermisos(perfil, "p1")).rejects.toThrow(/caída/);
  });
});
