// Fase 4d, B3 (plan GHL 2.4): crear y manejar desde Administración → Workflows un workflow de cita (sin Entrada).
// La base se simula como en c11-acciones.test.ts: cada consulta devuelve lo que diga `respuesta` (tabla:select|update|insert).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string } | null };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let respuesta: Record<string, Resp>;
let consultas: Consulta[];
let exigirImpl: () => Promise<unknown>;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const tipo = () => (c.ops.some(([o]) => o === "update") ? "update" : c.ops.some(([o]) => o === "insert") ? "insert" : "select");
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "order", "limit", "update", "insert", "maybeSingle", "single"]) q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: Resp) => unknown) => Promise.resolve(respuesta[`${tabla}:${tipo()}`] ?? { data: null, error: null }).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/memoria", () => ({ olvidarTodo: () => undefined, enMemoria: <T,>(_k: string, _ms: number, f: () => T) => f(), UN_MINUTO: 60_000 }));
vi.mock("@/lib/auth", () => ({ exigir: () => exigirImpl(), puedeAdmin: {}, puedeCrearProyectos: {}, exigirCambiarComisionRol: {} }));
const { crearWorkflowDeCita, encenderWorkflow, pararWorkflow, pasarWorkflowAReal, devolverAHoy } = await import("@/app/(panel)/admin/acciones");

const escrituras = (tabla: string, op: "update" | "insert") => consultas.filter((c) => c.tabla === tabla).flatMap((c) => c.ops.filter(([o]) => o === op).map(([, a]) => a[0] as Record<string, unknown>));
const deCita = { id: "w1", entrada_id: null, modo: "prueba", encendido: true };

beforeEach(() => {
  consultas = [];
  respuesta = {};
  exigirImpl = async () => ({ proyecto: { id: "p1" } });
});

describe("crearWorkflowDeCita", () => {
  it("«agendada» y «cancelada»: nace sin Entrada, en prueba, APAGADO, sin pasos y con su nombre", async () => {
    expect(await crearWorkflowDeCita("agendada")).toEqual({ ok: true });
    expect(await crearWorkflowDeCita("cancelada")).toEqual({ ok: true });
    expect(escrituras("workflows", "insert")).toEqual([
      { proyecto_id: "p1", nombre: "Cita agendada", disparador: { tipo: "cita", evento: "agendada" }, entrada_id: null, pasos: [], modo: "prueba", encendido: false },
      { proyecto_id: "p1", nombre: "Cita cancelada", disparador: { tipo: "cita", evento: "cancelada" }, entrada_id: null, pasos: [], modo: "prueba", encendido: false },
    ]);
  });
  it("otro evento: error y no crea nada", async () => {
    for (const malo of ["borrada", "", null, { evento: "agendada" }]) expect(await crearWorkflowDeCita(malo as never)).toMatchObject({ error: expect.any(String) });
    expect(escrituras("workflows", "insert")).toHaveLength(0);
  });
  it("si no eres admin, no crea nada", async () => {
    exigirImpl = async () => {
      throw new Error("no admin");
    };
    expect(await crearWorkflowDeCita("agendada")).toMatchObject({ error: expect.any(String) });
    expect(escrituras("workflows", "insert")).toHaveLength(0);
  });
});

describe("un workflow de cita (sin Entrada) se maneja igual", () => {
  it("se enciende y se para", async () => {
    respuesta["workflows:select"] = { data: { ...deCita, encendido: false }, error: null };
    expect(await encenderWorkflow("w1")).toEqual({ ok: true });
    respuesta["workflows:select"] = { data: deCita, error: null };
    expect(await pararWorkflow("w1")).toEqual({ ok: true });
    expect(escrituras("workflows", "update").map((u) => u.encendido)).toEqual([true, false]);
  });
  it("pasa a real sin tocar ninguna Entrada ni sus envíos", async () => {
    respuesta["workflows:select"] = { data: deCita, error: null };
    respuesta["proyectos:select"] = { data: { ghl_token: "x", ghl_location_id: "loc" }, error: null };
    expect(await pasarWorkflowAReal("w1")).toEqual({ ok: true });
    expect(escrituras("workflows", "update")).toEqual([expect.objectContaining({ modo: "real" })]);
    // Ni la comprobación de C1 (exigirNoGhl) ni el apagado de «Mandar a GHL»: no hay Entrada
    expect(consultas.some((c) => c.tabla === "entradas")).toBe(false);
    expect(escrituras("webhook_eventos", "update")).toHaveLength(0);
  });
  it("en real, «Prueba» lo vuelve a prueba sin tocar ninguna Entrada (y no lo apaga)", async () => {
    respuesta["workflows:select"] = { data: { ...deCita, modo: "real" }, error: null };
    expect(await devolverAHoy("w1")).toEqual({ ok: true });
    expect(escrituras("workflows", "update")).toEqual([{ modo: "prueba", actualizado_en: expect.any(String) }]);
    expect(consultas.some((c) => c.tabla === "entradas" || c.tabla === "webhook_eventos" || c.tabla === "workflow_ejecuciones")).toBe(false);
  });
  it("si ya está en prueba, «Volver» da error y nada cambia", async () => {
    respuesta["workflows:select"] = { data: deCita, error: null };
    expect(await devolverAHoy("w1")).toEqual({ error: "Este workflow no está en real." });
    expect(consultas.some((c) => c.ops.some(([o]) => o === "update"))).toBe(false);
  });
  it("un workflow de otro proyecto (o que no existe) sigue dando «Workflow no encontrado.»", async () => {
    expect(await encenderWorkflow("w9")).toEqual({ error: "Workflow no encontrado." });
  });
});
