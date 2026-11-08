// Tarea A1 (plan GHL): un fallo pasajero de Supabase no deja nada en estado final.
// La base se simula como en arreglos-callers.test.ts: cada consulta devuelve lo que diga `respuesta` (tabla:select|update|insert).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string } | null };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let respuesta: Record<string, Resp>;
let consultas: Consulta[];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const tipo = () => (c.ops.some(([o]) => o === "update") ? "update" : c.ops.some(([o]) => o === "insert") ? "insert" : "select");
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "gte", "lte", "order", "range", "limit", "update", "insert", "maybeSingle", "single", "neq", "or"])
        q[m] = (...args: unknown[]) => {
          c.ops.push([m, args]);
          return q;
        };
      q.then = (r: (v: Resp) => unknown, f?: (e: unknown) => unknown) => Promise.resolve(respuesta[`${tabla}:${tipo()}`] ?? { data: null, error: null }).then(r, f);
      return q;
    },
  }),
}));
vi.mock("@/lib/limite", () => ({ dentroDelLimite: async () => true }));
vi.mock("@/lib/entrada-evento", () => ({ completarLeadDelEvento: async () => false }));
vi.mock("@/lib/leads", async (original) => ({ ...(await original<typeof import("@/lib/leads")>()), guardarLeads: vi.fn(async () => ({})) }));
// En el test de la Entrada se sustituye para saber si se llamó; en los demás, el real
let usarFalso = false;
const crearEjecucionesFalso = vi.fn<(o: unknown) => Promise<number>>(async () => 0);
vi.mock("@/lib/workflows-motor", async (original) => {
  const real = await original<typeof import("@/lib/workflows-motor")>();
  return { ...real, crearEjecuciones: (...a: Parameters<typeof real.crearEjecuciones>) => (usarFalso ? crearEjecucionesFalso(...a) : real.crearEjecuciones(...a)) };
});

const { enviarPendientesGhl } = await import("@/lib/ghl-envios");
const { avanzarEjecuciones, crearEjecuciones } = await import("@/lib/workflows-motor");
const { POST } = await import("@/app/api/webhooks/entrada/[token]/route");

const fallo = { data: null, error: { message: "la base no responde" } };
const escrituras = (tabla: string, op: "update" | "insert") => consultas.filter((c) => c.tabla === tabla && c.ops.some(([o]) => o === op));

beforeEach(() => {
  consultas = [];
  respuesta = {};
  usarFalso = false;
  crearEjecucionesFalso.mockClear();
});

describe("ghl-envios · falla leer las Entradas", () => {
  it("lanza y no marca ningún envío como «error»", async () => {
    respuesta["webhook_eventos:select"] = { data: [{ id: "ev1", entrada_id: "en1", lead_id: "l1", ghl_intentos: 0 }], error: null };
    respuesta["entradas:select"] = fallo;
    await expect(enviarPendientesGhl({ id: "p1", ghl_location_id: "loc1" }, "tok", { avisar: async () => {} })).rejects.toThrow(/la base no responde/);
    expect(escrituras("webhook_eventos", "update")).toHaveLength(0);
  });
});

describe("workflows-motor · falla leer los workflows", () => {
  it("avanzarEjecuciones lanza y no pone la ejecución en «parada»", async () => {
    respuesta["workflow_ejecuciones:select"] = { data: [{ id: "ej1", workflow_id: "w1", pasos: [], lead_id: "l1", entrada_id: null, tramo: 0, intentos: 0, registro: [] }], error: null };
    respuesta["workflows:select"] = fallo;
    await expect(avanzarEjecuciones("p1")).rejects.toThrow(/la base no responde/);
    expect(escrituras("workflow_ejecuciones", "update")).toHaveLength(0);
  });

  it("crearEjecuciones lanza si falla mirar si ya hay una ejecución, y no crea otra", async () => {
    respuesta["workflows:select"] = { data: [{ id: "w1", version: 1, pasos: [] }], error: null };
    respuesta["workflow_ejecuciones:select"] = fallo;
    await expect(crearEjecuciones({ proyectoId: "p1", entradaId: "en1", leadId: "l1", envio: {} })).rejects.toThrow(/la base no responde/);
    expect(escrituras("workflow_ejecuciones", "insert")).toHaveLength(0);
  });
});

describe("Entrada · falla buscar el lead guardado", () => {
  it("responde 500 y no deja el envío sin GHL ni workflow en silencio", async () => {
    usarFalso = true;
    const token = "a".repeat(48);
    respuesta["entradas:select"] = { data: { id: "en1", proyecto_id: "p1", nombre: "Landing", pipeline_id: null, etapa_id: null, reglas: [], activa: true, ghl_activo: true }, error: null };
    respuesta["webhook_eventos:insert"] = { data: { id: "ev1" }, error: null };
    respuesta["proyectos:select"] = { data: { id: "p1" }, error: null };
    respuesta["leads:select"] = fallo;
    const req = new Request(`http://x/api/webhooks/entrada/${token}`, { method: "POST", body: JSON.stringify({ email: "a@b.com", nombre: "Ana" }) });
    const r = await POST(req as never, { params: Promise.resolve({ token }) });
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, error: "No se pudo guardar el envío" });
    expect(crearEjecucionesFalso).not.toHaveBeenCalled();
    // Solo queda apuntado el motivo del fallo; no se marca como procesado
    const updates = escrituras("webhook_eventos", "update").map((c) => c.ops.find(([o]) => o === "update")![1][0]);
    expect(updates).toEqual([{ error: expect.stringMatching(/la base no responde/) }]);
  });
});
