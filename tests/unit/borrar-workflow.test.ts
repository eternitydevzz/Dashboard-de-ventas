// Rediseño de Workflows (Cristian, 11 nov 2026): la «×» borra el workflow (sus ejecuciones en espera se cancelan:
// caen con él). Uno en real con Entrada no se borra: dejaría su Entrada sin mandar a GHL.
import { beforeEach, describe, expect, it, vi } from "vitest";

let wf: Record<string, unknown> | null;
let borrado: { tabla: string; filtros: [string, unknown][] } | null;
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/memoria", () => ({ olvidarTodo: () => undefined }));
vi.mock("@/lib/auth", () => ({ exigir: async () => ({ proyecto: { id: "p1" } }), puedeAdmin: {}, puedeCrearProyectos: {}, exigirCambiarComisionRol: {} }));
vi.mock("@/lib/datos", () => ({
  db: () => ({
    from: (tabla: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: wf, error: null });
      q.delete = () => {
        const filtros: [string, unknown][] = [];
        const d = { eq: (c: string, v: unknown) => (filtros.push([c, v]), d), then: (r: (x: { error: null }) => unknown) => ((borrado = { tabla, filtros }), r({ error: null })) };
        return d;
      };
      return q;
    },
  }),
  equipo: async () => [],
  escribir: async (p: unknown) => p,
}));
const { borrarWorkflow } = await import("@/app/(panel)/admin/acciones");

beforeEach(() => {
  borrado = null;
});

describe("borrarWorkflow", () => {
  it("borra uno en prueba, solo de este proyecto", async () => {
    wf = { id: "w1", entrada_id: "e1", modo: "prueba", encendido: true };
    expect(await borrarWorkflow("w1")).toEqual({ ok: true });
    expect(borrado).toEqual({ tabla: "workflows", filtros: [["id", "w1"], ["proyecto_id", "p1"]] });
  });
  it("borra uno de cita en real (no tiene Entrada que se quede sin mandar)", async () => {
    wf = { id: "w2", entrada_id: null, modo: "real", encendido: true };
    expect(await borrarWorkflow("w2")).toEqual({ ok: true });
    expect(borrado?.tabla).toBe("workflows");
  });
  it("no borra uno en real que manda los leads de su Entrada", async () => {
    wf = { id: "w3", entrada_id: "e1", modo: "real", encendido: true };
    const r = await borrarWorkflow("w3");
    expect(r).toMatchObject({ error: expect.stringContaining("Volver a lo de hoy") });
    expect(borrado).toBeNull();
  });
  it("no encuentra uno de otro proyecto", async () => {
    wf = null;
    expect(await borrarWorkflow("w9")).toMatchObject({ error: expect.stringContaining("no encontrado") });
    expect(borrado).toBeNull();
  });
});
