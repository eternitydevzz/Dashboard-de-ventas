// Plan GHL A3 (Cristian, 8 nov 2026): workflows que arrancan cuando se pone una etiqueta. Solo disparan ponerEtiqueta
// (ghl-sync) y mandarEnvioGhl (ghl-envios, dispara quien llama); solo si la etiqueta es nueva en el lead (en
// minúsculas); una etiqueta puesta por un workflow de etiqueta no dispara (evita el bucle W1 pone B, W2 pone A…).
// Base y GHL simulados (patrón de workflows-cita.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encajaDisparador, envioSintetico, type Paso } from "@/lib/workflows";

type Resp = { data: unknown; error: { message: string } | null };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let respuesta: Record<string, Resp>;
let consultas: Consulta[];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: true, error: null }),
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const tipo = () => (c.ops.some(([o]) => o === "update") ? "update" : c.ops.some(([o]) => o === "insert") ? "insert" : "select");
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "is", "not", "lt", "lte", "gte", "order", "limit", "update", "insert", "maybeSingle", "single"]) q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: Resp) => unknown) => Promise.resolve(respuesta[`${tabla}:${tipo()}`] ?? { data: null, error: null }).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/ghl", async (original) => ({
  ...(await original<typeof import("@/lib/ghl")>()),
  crearOActualizarContactoGhl: async () => ({ id: "c1", etiquetas: [] }),
  anadirEtiquetasGhl: async () => undefined,
}));
const { ponerEtiqueta } = await import("@/lib/ghl-sync");
const { avanzarEjecuciones } = await import("@/lib/workflows-motor");
const { enviarPendientesGhl } = await import("@/lib/ghl-envios");

const LEAD = { nombre: "Ana", apellido: "Prueba", email: "ana@x.test", telefono: "+15550100000", seguimiento: null, proyecto_id: "p1", ghl_contact_id: "c1" };
const PONE_B: Paso[] = [{ id: "e", tipo: "etiquetas_ghl", base: null, fijas: ["b"], campo_completo: "" }];
const inserts = (t: string) => consultas.filter((c) => c.tabla === t).flatMap((c) => c.ops.filter(([o]) => o === "insert").map(([, a]) => a[0] as Record<string, unknown>));
const updates = (t: string) => consultas.filter((c) => c.tabla === t).flatMap((c) => c.ops.filter(([o]) => o === "update").map(([, a]) => a[0] as Record<string, unknown>));

beforeEach(() => {
  consultas = [];
  respuesta = { "workflow_ejecuciones:select": { data: [], error: null } };
});

describe("encajaDisparador: se pone una etiqueta", () => {
  const PONE = { tipo: "etiqueta" as const, etiqueta: "Agenda-DFY" };
  it("encaja con la misma etiqueta, sin mirar mayúsculas", () => {
    expect(encajaDisparador({ tipo: "etiqueta", etiqueta: "agenda-dfy" }, PONE)).toBe(true);
  });
  it("no encaja con otra etiqueta, con una cita ni con basura", () => {
    expect(encajaDisparador({ tipo: "etiqueta", etiqueta: "agenda" }, PONE)).toBe(false);
    expect(encajaDisparador({ tipo: "cita", evento: "agendada" }, PONE)).toBe(false);
    for (const x of [null, "etiqueta", {}, { tipo: "etiqueta" }, { tipo: "etiqueta", etiqueta: 3 }]) expect(encajaDisparador(x, PONE)).toBe(false);
  });
  it("el envío sintético lleva la etiqueta (para las ramas «si el campo etiqueta…»)", () => {
    expect(envioSintetico(LEAD, PONE)).toEqual({ first_name: "Ana", last_name: "Prueba", email: "ana@x.test", phone: "+15550100000", etiqueta: "Agenda-DFY" });
  });
});

describe("ponerEtiqueta dispara los workflows de etiqueta", () => {
  beforeEach(() => {
    respuesta["workflows:select"] = { data: [{ id: "w-a", version: 1, pasos: PONE_B, disparador: { tipo: "etiqueta", etiqueta: "agenda-dfy" } }], error: null };
  });
  it("etiqueta nueva → 1 ejecución", async () => {
    respuesta["leads:select"] = { data: { ...LEAD, etiquetas: ["agenda"] }, error: null };
    await ponerEtiqueta("l1", "agenda-dfy");
    expect(updates("leads")).toEqual([{ etiquetas: ["agenda", "agenda-dfy"] }]);
    const ins = inserts("workflow_ejecuciones");
    expect(ins).toHaveLength(1);
    expect(ins[0]).toMatchObject({ workflow_id: "w-a", proyecto_id: "p1", lead_id: "l1", entrada_id: null });
    expect(ins[0].registro).toEqual([expect.objectContaining({ tipo: "disparo", etiqueta: "agenda-dfy" }), expect.objectContaining({ tipo: "inicio" })]);
  });
  it("la que ya tenía, también con otra mayúscula → 0 (y no se repite en el lead)", async () => {
    respuesta["leads:select"] = { data: { ...LEAD, etiquetas: ["Agenda-DFY"] }, error: null };
    await ponerEtiqueta("l1", "agenda-dfy");
    expect(updates("leads")).toEqual([]);
    expect(inserts("workflow_ejecuciones")).toHaveLength(0);
  });
  it("un fallo de los workflows no rompe a quien pone la etiqueta", async () => {
    respuesta["leads:select"] = { data: { ...LEAD, etiquetas: [] }, error: null };
    respuesta["workflows:select"] = { data: null, error: { message: "base caída" } };
    await expect(ponerEtiqueta("l1", "agenda-dfy")).resolves.toBeUndefined();
  });
});

describe("mandarEnvioGhl: dispara quien llama", () => {
  const ejecucion = (workflow_id: string) => ({ id: "x1", workflow_id, pasos: PONE_B, lead_id: "l1", entrada_id: null, tramo: 0, intentos: 0, registro: [{ tipo: "disparo", envio: { email: "ana@x.test" } }], creado_en: "2026-11-08T11:00:00Z" });
  const ahora = new Date("2026-11-08T12:00:00Z");
  const ghl = { locationId: "loc", token: "tok" };

  it("un workflow de cita en real que pone una etiqueta nueva → 1 ejecución del de etiqueta", async () => {
    respuesta["leads:select"] = { data: { ...LEAD, etiquetas: ["a"] }, error: null };
    // 1.ª consulta a ejecuciones: las que tocan; después, «¿ya tiene una esperando?» → no
    let lecturas = 0;
    Object.defineProperty(respuesta, "workflow_ejecuciones:select", { get: () => ({ data: lecturas++ === 0 ? [ejecucion("w-cita")] : [], error: null }) });
    let llamada = 0;
    // 1.ª consulta a workflows: los de la ejecución; 2.ª: los que arrancan con «b»
    const wfCita = [{ id: "w-cita", nombre: "Cita", encendido: true, modo: "real", disparador: { tipo: "cita", evento: "agendada" } }];
    const wfB = [{ id: "w-b", version: 1, pasos: PONE_B, disparador: { tipo: "etiqueta", etiqueta: "B" } }];
    Object.defineProperty(respuesta, "workflows:select", { get: () => ({ data: llamada++ === 0 ? wfCita : wfB, error: null }) });
    const r = await avanzarEjecuciones("p1", { ahora, ghl });
    expect(r.errores).toEqual([]);
    expect(inserts("workflow_ejecuciones")).toEqual([expect.objectContaining({ workflow_id: "w-b", lead_id: "l1" })]);
  });

  it("la puesta por un workflow de etiqueta → 0 (no hay bucle)", async () => {
    respuesta["workflow_ejecuciones:select"] = { data: [ejecucion("w-a")], error: null };
    respuesta["leads:select"] = { data: { ...LEAD, etiquetas: ["a"] }, error: null };
    respuesta["workflows:select"] = { data: [{ id: "w-a", nombre: "A", encendido: true, modo: "real", disparador: { tipo: "etiqueta", etiqueta: "a" } }], error: null };
    const r = await avanzarEjecuciones("p1", { ahora, ghl });
    expect(r).toEqual({ hechas: 1, ok: 1, errores: [] });
    expect(updates("leads")).toEqual([{ etiquetas: ["a", "b"] }]); // GHL y el lead sí la reciben
    expect(inserts("workflow_ejecuciones")).toHaveLength(0);
    expect(consultas.filter((c) => c.tabla === "workflows")).toHaveLength(1); // ni se buscan workflows de etiqueta
  });

  it("el envío de una Entrada devuelve sus etiquetas nuevas, para que dispare la lectura (/api/ghl/leer)", async () => {
    respuesta["webhook_eventos:select"] = { data: [{ id: "ev1", entrada_id: "en1", lead_id: "l1", ghl_intentos: 0, recibido_en: "2026-11-08T11:00:00Z", payload: { email: "ana@x.test" } }], error: null };
    respuesta["entradas:select"] = { data: [{ id: "en1", nombre: "Landing", ghl_activo: true, ghl_campos: {}, ghl_etiqueta_base: null, ghl_etiquetas_extra: ["Nueva", "vieja"], ghl_oportunidades: [], ghl_espera_seg: 60 }], error: null };
    respuesta["leads:select"] = { data: { ...LEAD, etiquetas: ["VIEJA"] }, error: null };
    const r = await enviarPendientesGhl({ id: "p1", ghl_location_id: "loc" }, "tok", { ahora });
    expect(r.errores).toEqual([]);
    expect(r.nuevas).toEqual([{ leadId: "l1", etiquetas: ["nueva"] }]);
  });
});
