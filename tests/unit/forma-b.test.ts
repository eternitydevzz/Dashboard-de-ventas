// Plan GHL, sección 5 (forma B, Cristian 8 nov 2026): una Entrada «Desde un workflow de GHL» no puede mandar a GHL.
// exigirNoGhl en las 4 acciones, con la base y el email simulados (patrón de c11-acciones.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string } | null };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let respuesta: Record<string, Resp>;
let consultas: Consulta[];
let limiteLibre: boolean;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: limiteLibre, error: null }),
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
vi.mock("@/lib/email", () => ({ enviarEmail: vi.fn(async () => ({ enviado: true, motivo: "" })), urlApp: () => "https://app.test" }));
const { getSesion } = await import("@/lib/sesion");
const { enviarEmail } = await import("@/lib/email");
const { guardarGhlEntrada, guardarEntradaCompleta, pasarWorkflowAReal, devolverAHoy } = await import("@/app/(panel)/admin/acciones");

const GHL = { activo: true, campos: {}, oportunidades: [], etiqueta_base: "base", etiquetas_extra: [], espera_seg: 60, campo_completo: "quiz_completed" };
const ENTRADA = { nombre: "Prueba GHL", pipeline_id: null, etapa_id: null, reglas: [] };
const updates = (t: string) => consultas.filter((c) => c.tabla === t && c.ops.some(([o]) => o === "update"));
const entrada = (envia_desde: string | null, ghl_activo = false) => ({ data: { id: "e1", nombre: "Prueba GHL", envia_desde, ghl_activo }, error: null });

beforeEach(() => {
  consultas = [];
  limiteLibre = true;
  vi.mocked(enviarEmail).mockClear();
  vi.mocked(getSesion).mockResolvedValue({ perfil: { id: "u1", rol: "ceo" }, proyecto: { id: "p1" } } as never);
  respuesta = {
    "entradas:select": entrada("ghl"),
    "workflows:select": { data: { id: "w1", entrada_id: "e1", modo: "prueba", encendido: true }, error: null },
    "proyectos:select": { data: { ghl_token: "t", ghl_location_id: "l" }, error: null },
  };
});

describe("exigirNoGhl: una Entrada «Desde un workflow de GHL» no manda a GHL", () => {
  it("encender «Mandar a GHL»: error claro, no se escribe nada y email a info@eternity.llc", async () => {
    expect(await guardarGhlEntrada("e1", GHL)).toEqual({ error: expect.stringMatching(/workflow de GHL/) });
    expect(updates("entradas")).toHaveLength(0);
    expect(enviarEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enviarEmail).mock.calls[0][0]).toMatchObject({ para: ["info@eternity.llc"], asunto: expect.stringContaining("Prueba GHL") });
  });
  it("con el tope de 1 por Entrada y hora ya usado: el error sale igual, pero sin email", async () => {
    limiteLibre = false;
    expect(await guardarGhlEntrada("e1", GHL)).toEqual({ error: expect.stringMatching(/workflow de GHL/) });
    expect(enviarEmail).not.toHaveBeenCalled();
  });
  it("pasar su workflow a real: bloqueado", async () => {
    expect(await pasarWorkflowAReal("w1")).toEqual({ error: expect.stringMatching(/workflow de GHL/) });
    expect(updates("workflows")).toHaveLength(0);
  });
  it("«Volver a lo de hoy» (enciende «Mandar a GHL»): bloqueado y sin tocar la Entrada", async () => {
    respuesta["workflows:select"] = { data: { id: "w1", entrada_id: "e1", modo: "real", encendido: true }, error: null };
    expect(await devolverAHoy("w1")).toEqual({ error: expect.stringMatching(/workflow de GHL/) });
    expect(updates("entradas")).toHaveLength(0);
  });
  it("guardar ajustes que la dejan en «ghl» con «Mandar a GHL» encendido: bloqueado", async () => {
    respuesta["entradas:select"] = entrada("navegador");
    expect(await guardarEntradaCompleta("e1", { entrada: { ...ENTRADA, envia_desde: "ghl" }, ghl: GHL })).toEqual({ error: expect.stringMatching(/workflow de GHL/) });
    expect(updates("entradas")).toHaveLength(0);
  });
  it("sin GHL conectado (ghl = null) pero con «Mandar a GHL» ya encendido en la base: bloqueado", async () => {
    respuesta["entradas:select"] = entrada("navegador", true);
    respuesta["workflows:select"] = { data: [], error: null };
    expect(await guardarEntradaCompleta("e1", { entrada: { ...ENTRADA, envia_desde: "ghl" }, ghl: null })).toEqual({ error: expect.stringMatching(/workflow de GHL/) });
  });
  it("con su workflow ya en real, pasarla a «ghl»: bloqueado", async () => {
    respuesta["entradas:select"] = entrada("servidor");
    respuesta["workflows:select"] = { data: [{ id: "w1" }], error: null };
    expect(await guardarEntradaCompleta("e1", { entrada: { ...ENTRADA, envia_desde: "ghl" }, ghl: { ...GHL, activo: false } })).toEqual({ error: expect.stringMatching(/workflow de GHL/) });
  });
  it("«ghl» con «Mandar a GHL» apagado y sin workflow en real: se guarda", async () => {
    respuesta["entradas:select"] = entrada("navegador");
    respuesta["workflows:select"] = { data: [], error: null };
    expect(await guardarEntradaCompleta("e1", { entrada: { ...ENTRADA, envia_desde: "ghl" }, ghl: { ...GHL, activo: false } })).toEqual({ ok: true });
    expect(updates("entradas")[0].ops.find(([o]) => o === "update")?.[1][0]).toMatchObject({ envia_desde: "ghl", ghl_activo: false });
    expect(enviarEmail).not.toHaveBeenCalled();
  });
  it("una Entrada que no es «ghl» enciende «Mandar a GHL» como siempre", async () => {
    respuesta["entradas:select"] = entrada("navegador");
    respuesta["workflows:select"] = { data: [], error: null };
    expect(await guardarGhlEntrada("e1", GHL)).toBeUndefined();
    expect(updates("entradas")[0].ops.find(([o]) => o === "update")?.[1][0]).toMatchObject({ ghl_activo: true });
    expect(enviarEmail).not.toHaveBeenCalled();
  });
});
