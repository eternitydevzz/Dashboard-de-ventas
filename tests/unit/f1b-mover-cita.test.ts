// Fase 1b (coordinador): el Deshacer de mover una cita de columna (Agendas) no pisa un movimiento posterior de otra
// persona. Con `siEtapa`, moverCitaColumna solo escribe si la cita sigue en la columna que dejó ese clic.
// La base se simula: cada consulta apunta sus operaciones; datos inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Consulta = { tabla: string; ops: [string, unknown[]][] };
const h = vi.hoisted(() => ({ consultas: [] as { tabla: string; ops: [string, unknown[]][] }[], filas: 1 }));
vi.mock("@/lib/datos", () => ({
  db: () => ({
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      h.consultas.push(c);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "neq", "in", "update", "maybeSingle", "single"]) q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: unknown) => unknown) => {
        const esUpdate = c.ops.some(([o]) => o === "update");
        const data = esUpdate ? Array.from({ length: h.filas }, () => ({ id: "c1" })) : { id: "c1", lead_id: "l1", closer_id: "p1" };
        return Promise.resolve({ data, error: null }).then(r);
      };
      return q;
    },
  }),
  escribir: async (p: PromiseLike<unknown>) => p,
  registrarActividad: vi.fn(async () => undefined),
  porTrozos: vi.fn(),
  trozos: vi.fn(),
}));
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => undefined }));
vi.mock("@/lib/auth", () => ({ getSesion: async () => ({ perfil: { id: "p1", rol: "closer" }, proyecto: { id: "pr1" } }), esJefe: () => false, exigir: vi.fn(), puedeAdmin: () => false }));
vi.mock("@/lib/refrescar", () => ({ refrescarPantalla: () => undefined }));

const { moverCitaColumna } = await import("@/app/(panel)/crm/acciones");
const update = () => h.consultas.find((c) => c.tabla === "citas" && c.ops.some(([o]) => o === "update"))!;

beforeEach(() => {
  h.consultas = [];
  h.filas = 1;
});

describe("moverCitaColumna con siEtapa (Deshacer en Agendas)", () => {
  it("solo escribe si la cita sigue en la columna que dejó el clic", async () => {
    expect(await moverCitaColumna("c1", null, "libre1")).toBeUndefined();
    expect(update().ops).toContainEqual(["eq", ["etapa_closers_id", "libre1"]]);
  });
  it("si el clic la dejó en la columna de su estado (null), comprueba que sigue sin columna libre", async () => {
    await moverCitaColumna("c1", null, null);
    expect(update().ops).toContainEqual(["is", ["etapa_closers_id", null]]);
  });
  it("si otra persona la movió después, da el error y no apunta nada", async () => {
    h.filas = 0;
    expect(await moverCitaColumna("c1", null, "libre1")).toEqual({ error: "Esta cita cambió después: ya no se puede deshacer." });
  });
  it("sin siEtapa, como siempre: no filtra por columna", async () => {
    h.filas = 0;
    expect(await moverCitaColumna("c1", null)).toBeUndefined();
    expect(update().ops.some(([o, a]) => (o === "eq" || o === "is") && a[0] === "etapa_closers_id")).toBe(false);
  });
});
