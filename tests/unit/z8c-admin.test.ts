// Fase 8, zona C (S1-23): guardarWorkflow no pisa la versión de otro admin, guardarCalendarioCloser valida los ids de GHL
// y devolverAHoy lee los envíos de todos los leads de una vez. Base simulada como en workflows-cita-acciones.test.ts.
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
      const tipo = () => (c.ops.some(([o]) => o === "update") ? "update" : "select");
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "or", "order", "range", "limit", "update", "maybeSingle", "single"]) q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: Resp) => unknown) => Promise.resolve(respuesta[`${tabla}:${tipo()}`] ?? { data: null, error: null }).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/memoria", () => ({ olvidarTodo: () => undefined, enMemoria: <T,>(_k: string, _ms: number, f: () => T) => f(), UN_MINUTO: 60_000 }));
const { getSesion } = await import("@/lib/sesion");
vi.mocked(getSesion).mockResolvedValue({ perfil: { id: "dir", rol: "director", admin_activo: true }, proyecto: { id: "p1" } } as never);
const { guardarWorkflow, guardarCalendarioCloser, devolverAHoy } = await import("@/app/(panel)/admin/acciones");

const updates = (tabla: string) => consultas.filter((c) => c.tabla === tabla && c.ops.some(([o]) => o === "update"));

beforeEach(() => {
  consultas = [];
  respuesta = {};
});

describe("guardarWorkflow", () => {
  const pasos = [{ id: "e1", tipo: "esperar", segundos: 60 }];
  it("solo guarda si la versión sigue siendo la que leyó", async () => {
    respuesta["workflows:select"] = { data: { id: "w1", pasos: [], version: 3, modo: "prueba" }, error: null };
    respuesta["workflows:update"] = { data: [{ id: "w1" }], error: null };
    expect(await guardarWorkflow("w1", pasos)).toEqual({ ok: true, version: 4 });
    expect(updates("workflows")[0].ops).toContainEqual(["eq", ["version", 3]]);
  });
  it("si otro admin lo guardó antes, avisa y no dice «guardado»", async () => {
    respuesta["workflows:select"] = { data: { id: "w1", pasos: [], version: 3, modo: "prueba" }, error: null };
    respuesta["workflows:update"] = { data: [], error: null };
    expect(await guardarWorkflow("w1", pasos)).toEqual({ error: expect.stringMatching(/Otra persona/) });
  });
});

describe("guardarCalendarioCloser", () => {
  beforeEach(() => {
    respuesta["miembros_proyecto:select"] = { data: { perfil_id: "c1" }, error: null };
  });
  it("ids con caracteres raros: error y no guarda", async () => {
    expect(await guardarCalendarioCloser("c1", "cal; drop", "")).toEqual({ error: expect.stringMatching(/calendario/) });
    expect(await guardarCalendarioCloser("c1", "", "u/1")).toEqual({ error: expect.stringMatching(/usuario/) });
    expect(updates("miembros_proyecto")).toHaveLength(0);
  });
  it("ids buenos se guardan sin espacios; vacíos, como null", async () => {
    await guardarCalendarioCloser("c1", " cal-A_1 ", "");
    expect(updates("miembros_proyecto")[0].ops).toContainEqual(["update", [{ ghl_calendar_id: "cal-A_1", ghl_user_id: null }]]);
  });
});

describe("devolverAHoy con Entrada", () => {
  it("una sola lectura de envíos y un solo update con el último de cada lead", async () => {
    respuesta["workflows:select"] = { data: { id: "w1", entrada_id: "en1", modo: "real", encendido: true }, error: null };
    respuesta["entradas:select"] = { data: { nombre: "Web", envia_desde: "web", ghl_activo: false }, error: null };
    respuesta["workflow_ejecuciones:select"] = { data: [{ lead_id: "a" }, { lead_id: "b" }, { lead_id: "a" }], error: null };
    // ordenados del más nuevo al más viejo
    respuesta["webhook_eventos:select"] = { data: [{ id: "e3", lead_id: "a" }, { id: "e2", lead_id: "b" }, { id: "e1", lead_id: "a" }], error: null };
    expect(await devolverAHoy("w1")).toEqual({ ok: true });
    const lecturas = consultas.filter((c) => c.tabla === "webhook_eventos" && !c.ops.some(([o]) => o === "update"));
    expect(lecturas).toHaveLength(1);
    expect(lecturas[0].ops).toContainEqual(["in", ["lead_id", ["a", "b"]]]);
    const u = updates("webhook_eventos");
    expect(u).toHaveLength(1);
    expect(u[0].ops).toContainEqual(["in", ["id", ["e3", "e2"]]]);
  });
  it("si la lectura de envíos falla, da error y no marca nada (antes callaba y no reenviaba)", async () => {
    respuesta["workflows:select"] = { data: { id: "w1", entrada_id: "en1", modo: "real", encendido: true }, error: null };
    respuesta["entradas:select"] = { data: { nombre: "Web", envia_desde: "web", ghl_activo: false }, error: null };
    respuesta["workflow_ejecuciones:select"] = { data: [{ lead_id: "a" }], error: null };
    respuesta["webhook_eventos:select"] = { data: null, error: { message: "URI too long" } };
    expect(await devolverAHoy("w1")).toEqual({ error: expect.any(String) });
    expect(updates("webhook_eventos")).toHaveLength(0);
  });
  it("sin nada esperando no lee ni escribe envíos", async () => {
    respuesta["workflows:select"] = { data: { id: "w1", entrada_id: "en1", modo: "real", encendido: true }, error: null };
    respuesta["entradas:select"] = { data: { nombre: "Web", envia_desde: "web", ghl_activo: false }, error: null };
    respuesta["workflow_ejecuciones:select"] = { data: [], error: null };
    expect(await devolverAHoy("w1")).toEqual({ ok: true });
    expect(consultas.some((c) => c.tabla === "webhook_eventos")).toBe(false);
  });
});
