// Tarea A3 (plan GHL 4.5): cuando GHL responde 429 («espera»), el envío y el workflow esperan a la lectura siguiente sin
// gastar intento, sin rojo ni email, y no se llama a GHL para los demás. Si ya lleva más de 30 min, cuenta como fallo.
// La base se simula como en fallos-supabase.test.ts: cada consulta devuelve lo que diga `respuesta` (tabla:select|update|insert).
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

const { GhlEsperar, contactoGhl, contactosNuevosGhl, anadirEtiquetasGhl } = await import("@/lib/ghl");
const { enviarPendientesGhl } = await import("@/lib/ghl-envios");
const { avanzarEjecuciones } = await import("@/lib/workflows-motor");

const ahora = new Date("2026-11-08T12:00:00Z");
const haceMin = (m: number) => new Date(ahora.getTime() - m * 60_000).toISOString();
const fetch429 = vi.fn(async () => new Response("{}", { status: 429 }));
const fetchImpl = fetch429 as unknown as typeof fetch;
const updates = (tabla: string) => consultas.filter((c) => c.tabla === tabla).flatMap((c) => c.ops.filter(([o]) => o === "update").map(([, a]) => a[0] as Record<string, unknown>));

beforeEach(() => {
  consultas = [];
  respuesta = {};
  fetch429.mockClear();
});

describe("ghl.ts · el 429 tiene su propio error", () => {
  it("lectura, lista de contactos y escritura lanzan GhlEsperar", async () => {
    await expect(contactoGhl({ token: "t", contactId: "c1", fetchImpl })).rejects.toBeInstanceOf(GhlEsperar);
    await expect(contactosNuevosGhl({ token: "t", locationId: "loc", desde: ahora, limite: 10, fetchImpl })).rejects.toBeInstanceOf(GhlEsperar);
    await expect(anadirEtiquetasGhl({ token: "t", contactId: "c1", etiquetas: ["x"], fetchImpl })).rejects.toBeInstanceOf(GhlEsperar);
  });
});

describe("ghl-envios · GHL responde 429", () => {
  // 2 leads esperando, de la misma Entrada; la Entrada espera 60 s antes de mandar
  const preparar = (recibidoHaceMin: number) => {
    const fila = (id: string, lead: string) => ({ id, entrada_id: "en1", lead_id: lead, ghl_intentos: 2, recibido_en: haceMin(recibidoHaceMin), payload: { email: `${lead}@x.com` } });
    respuesta["webhook_eventos:select"] = { data: [fila("ev1", "l1"), fila("ev2", "l2")], error: null };
    respuesta["entradas:select"] = { data: [{ id: "en1", nombre: "Landing", ghl_activo: true, ghl_campos: {}, ghl_espera_seg: 60, ghl_oportunidades: [], ghl_etiquetas_extra: [] }], error: null };
  };
  const avisar = vi.fn(async () => {});
  beforeEach(() => avisar.mockClear());

  it("el lead sigue esperando +60 s sin sumar intento, sin email, y no se llama a GHL para el 2.º lead", async () => {
    preparar(5);
    const r = await enviarPendientesGhl({ id: "p1", ghl_location_id: "loc" }, "tok", { fetchImpl, ahora, avisar });
    expect(fetch429).toHaveBeenCalledTimes(1);
    expect(updates("webhook_eventos")).toEqual([{ ghl_enviar_en: new Date(ahora.getTime() + 60_000).toISOString() }]);
    expect(avisar).not.toHaveBeenCalled();
    expect(r).toEqual({ enviados: 0, reintentos: 0, errores: [] });
  });

  it("si ya lleva más de 30 min desde que debía salir, el 429 cuenta como fallo normal", async () => {
    preparar(32); // debía salir hace 31 min
    const r = await enviarPendientesGhl({ id: "p1", ghl_location_id: "loc" }, "tok", { fetchImpl, ahora, avisar });
    expect(updates("webhook_eventos")[0]).toMatchObject({ ghl_intentos: 3, ghl_error: expect.stringMatching(/GHL pide esperar/) });
    expect(r.errores.length).toBeGreaterThan(0);
  });
});

describe("workflows-motor · GHL responde 429", () => {
  const preparar = (creadaHaceMin: number) => {
    const ej = (id: string, lead: string) => ({ id, workflow_id: "w1", pasos: [{ id: "c", tipo: "contacto_ghl", campos: {} }], lead_id: lead, entrada_id: "en1", tramo: 0, intentos: 4, registro: [], creado_en: haceMin(creadaHaceMin) });
    respuesta["workflow_ejecuciones:select"] = { data: [ej("ej1", "l1"), ej("ej2", "l2")], error: null };
    respuesta["workflows:select"] = { data: [{ id: "w1", nombre: "WF", encendido: true, modo: "real" }], error: null };
    respuesta["webhook_eventos:select"] = { data: [{ payload: { email: "l@x.com" } }], error: null };
  };
  const avisar = vi.fn(async () => {});
  beforeEach(() => avisar.mockClear());

  it("la ejecución espera +60 s sin sumar intento ni email, y no se llama a GHL para la 2.ª", async () => {
    preparar(5);
    const r = await avanzarEjecuciones("p1", { ahora, ghl: { locationId: "loc", token: "tok", fetchImpl, avisar } });
    expect(fetch429).toHaveBeenCalledTimes(1);
    const u = updates("workflow_ejecuciones");
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ siguiente_en: new Date(ahora.getTime() + 60_000).toISOString() });
    expect(u[0]).not.toHaveProperty("intentos");
    expect(u[0]).not.toHaveProperty("estado");
    expect(avisar).not.toHaveBeenCalled();
    expect(r.errores).toEqual([]);
  });

  it("si ya lleva más de 30 min, el 429 cuenta como fallo normal (5.º intento: rojo y email)", async () => {
    preparar(31);
    await avanzarEjecuciones("p1", { ahora, ghl: { locationId: "loc", token: "tok", fetchImpl, avisar } });
    expect(updates("workflow_ejecuciones")[0]).toMatchObject({ estado: "error", intentos: 5 });
    expect(avisar).toHaveBeenCalled();
  });
});
