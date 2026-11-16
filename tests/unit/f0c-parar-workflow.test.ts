// S1-1 (fase 0): parar un workflow en real con Entrada dejaría la Entrada sin mandar a GHL («Mandar a GHL» está
// apagado en real). Igual que borrarWorkflow: se bloquea y no escribe.
import { beforeEach, describe, expect, it, vi } from "vitest";

let wf: Record<string, unknown> | null;
let escrito: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, refresh: () => undefined }));
vi.mock("@/lib/memoria", () => ({ olvidarTodo: () => undefined }));
vi.mock("@/lib/auth", () => ({ exigir: async () => ({ proyecto: { id: "p1" } }), puedeAdmin: {}, puedeCrearProyectos: {}, exigirCambiarComisionRol: {} }));
vi.mock("@/lib/datos", () => ({
  db: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: wf, error: null });
      q.update = (cambio: unknown) => ((escrito = cambio), q);
      return q;
    },
  }),
  equipo: async () => [],
  escribir: async (p: unknown) => p,
}));
const { pararWorkflow } = await import("@/app/(panel)/admin/acciones");

beforeEach(() => {
  escrito = null;
});

describe("pararWorkflow", () => {
  it("no para uno en real que manda los leads de su Entrada", async () => {
    wf = { id: "w1", entrada_id: "e1", modo: "real", encendido: true };
    expect(await pararWorkflow("w1")).toMatchObject({ error: expect.stringContaining("Volver a lo de hoy") });
    expect(escrito).toBeNull();
  });
  it("para uno en prueba", async () => {
    wf = { id: "w2", entrada_id: "e1", modo: "prueba", encendido: true };
    expect(await pararWorkflow("w2")).toEqual({ ok: true });
    expect(escrito).toMatchObject({ encendido: false });
  });
  it("para uno de cita en real (no tiene Entrada)", async () => {
    wf = { id: "w3", entrada_id: null, modo: "real", encendido: true };
    expect(await pararWorkflow("w3")).toEqual({ ok: true });
    expect(escrito).toMatchObject({ encendido: false });
  });
});
