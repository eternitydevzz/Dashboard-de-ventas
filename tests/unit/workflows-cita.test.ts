// Plan GHL 2.4 · fase 4d (Cristian, 8 nov 2026): workflows que arrancan cuando se agenda o se cancela una cita.
// Lo puro (disparador y envío sintético) y el motor con la base simulada (patrón de c11-acciones.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aplanarPasos, encajaDisparador, envioSintetico, type Paso } from "@/lib/workflows";
import { armarEnvioGhl } from "@/lib/entrada-ghl";
import { estadoEjecucion } from "@/lib/workflows-vista";

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
      for (const m of ["select", "eq", "neq", "in", "is", "lte", "gte", "order", "limit", "update", "insert", "maybeSingle", "single"]) q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: Resp) => unknown) => Promise.resolve(respuesta[`${tabla}:${tipo()}`] ?? { data: null, error: null }).then(r);
      return q;
    },
  }),
}));
const { dispararWorkflows, avanzarEjecuciones } = await import("@/lib/workflows-motor");

const LEAD = { nombre: "Ana", apellido: "Prueba", email: "ana@x.test", telefono: "+15550100000", seguimiento: { utm_source: "youtube", ip: "1.2.3.4" } };
const AGENDADA = { tipo: "cita" as const, evento: "agendada" as const, canal: "dfy", calendario: "cal-1", fecha: "2026-11-10T15:00:00.000Z" };
const RAMA: Paso[] = [
  { id: "r", tipo: "rama", caminos: [{ condicion: { campo: "canal", operador: "igual", valor: "dfy" }, pasos: [{ id: "m", tipo: "mover_dashboard", pipeline_id: "p-dfy", etapa_id: null }] }], si_no: [{ id: "n", tipo: "mover_dashboard", pipeline_id: "p-otro", etapa_id: null }] },
];
const inserts = (t: string) => consultas.filter((c) => c.tabla === t).flatMap((c) => c.ops.filter(([o]) => o === "insert").map(([, a]) => a[0] as Record<string, unknown>));
const updates = (t: string) => consultas.filter((c) => c.tabla === t).flatMap((c) => c.ops.filter(([o]) => o === "update").map(([, a]) => a[0] as Record<string, unknown>));

beforeEach(() => {
  consultas = [];
  respuesta = {};
});

describe("encajaDisparador: cita agendada / cancelada", () => {
  it("encaja con el mismo evento", () => {
    expect(encajaDisparador({ tipo: "cita", evento: "agendada" }, AGENDADA)).toBe(true);
    expect(encajaDisparador({ tipo: "cita", evento: "cancelada" }, { ...AGENDADA, evento: "cancelada" })).toBe(true);
  });
  it("no encaja con otro evento, con una Entrada ni con basura", () => {
    expect(encajaDisparador({ tipo: "cita", evento: "cancelada" }, AGENDADA)).toBe(false);
    expect(encajaDisparador({ tipo: "entrada", entrada_id: "e1" }, AGENDADA)).toBe(false);
    for (const x of [null, undefined, "cita", {}, { tipo: "cita" }]) expect(encajaDisparador(x, AGENDADA)).toBe(false);
  });
});

describe("envioSintetico: los datos del lead y de la cita como si fuera un envío", () => {
  const envio = envioSintetico(LEAD, AGENDADA);
  it("lleva nombre, apellido, email, teléfono, utm_source y canal, calendario y fecha", () => {
    expect(envio).toEqual({ first_name: "Ana", last_name: "Prueba", email: "ana@x.test", phone: "+15550100000", utm_source: "youtube", canal: "dfy", calendario: "cal-1", fecha: "2026-11-10T15:00:00.000Z" });
  });
  it("sin datos no inventa nada (fuera los vacíos)", () => {
    expect(envioSintetico({ nombre: null, apellido: null, email: null, telefono: "+1555", seguimiento: null }, { ...AGENDADA, canal: null, calendario: null, fecha: null })).toEqual({ phone: "+1555" });
  });
  it("una rama «si el campo canal = dfy» funciona sin código nuevo", () => {
    expect(aplanarPasos(RAMA, [envio]).map((p) => p.id)).toEqual(["m"]);
    expect(aplanarPasos(RAMA, [{ ...envio, canal: "ventas" }]).map((p) => p.id)).toEqual(["n"]);
  });
  it("mandarEnvioGhl tiene email y teléfono (armarEnvioGhl)", () => {
    expect(armarEnvioGhl([envio], { campos: {}, pipelineId: null, etapaId: null, oportunidades: [], etiquetaBase: null, etiquetasExtra: [], campoCompleto: "" }).contacto).toMatchObject({ firstName: "Ana", lastName: "Prueba", email: "ana@x.test", phone: "+15550100000" });
  });
});

describe("dispararWorkflows: crea la ejecución de los workflows que encajan", () => {
  beforeEach(() => {
    respuesta["leads:select"] = { data: LEAD, error: null };
    respuesta["workflows:select"] = {
      data: [
        { id: "w-ag", version: 2, pasos: RAMA, disparador: { tipo: "cita", evento: "agendada" } },
        { id: "w-ca", version: 1, pasos: RAMA, disparador: { tipo: "cita", evento: "cancelada" } },
      ],
      error: null,
    };
    respuesta["workflow_ejecuciones:select"] = { data: [], error: null };
  });
  it("solo la del evento, sin Entrada y con el envío sintético guardado en su registro", async () => {
    expect(await dispararWorkflows("p1", "l1", AGENDADA)).toBe(1);
    const ins = inserts("workflow_ejecuciones");
    expect(ins).toHaveLength(1);
    expect(ins[0]).toMatchObject({ workflow_id: "w-ag", version: 2, proyecto_id: "p1", lead_id: "l1", entrada_id: null });
    expect(ins[0].registro).toEqual([expect.objectContaining({ tipo: "disparo", evento: "agendada", envio: envioSintetico(LEAD, AGENDADA) })]);
    // Solo workflows encendidos del proyecto con disparador de cita
    const q = consultas.find((c) => c.tabla === "workflows")!.ops;
    expect(q).toEqual(expect.arrayContaining([["eq", ["proyecto_id", "p1"]], ["eq", ["encendido", true]], ["eq", ["disparador->>tipo", "cita"]]]));
  });
  it("sin duplicados: si ese lead ya tiene una esperando de ese workflow, no se crea otra", async () => {
    respuesta["workflow_ejecuciones:select"] = { data: [{ id: "ya" }], error: null };
    expect(await dispararWorkflows("p1", "l1", AGENDADA)).toBe(0);
    expect(inserts("workflow_ejecuciones")).toHaveLength(0);
  });
  it("lead que no existe: nada", async () => {
    respuesta["leads:select"] = { data: null, error: null };
    expect(await dispararWorkflows("p1", "l1", AGENDADA)).toBe(0);
    expect(inserts("workflow_ejecuciones")).toHaveLength(0);
  });
});

describe("modo prueba sin Entrada", () => {
  it("apunta lo que haría y termina ok SIN comparar (no busca Entrada ni envíos)", async () => {
    const envio = envioSintetico(LEAD, AGENDADA);
    respuesta["workflow_ejecuciones:select"] = { data: [{ id: "x1", workflow_id: "w-ag", pasos: RAMA, lead_id: "l1", entrada_id: null, tramo: 0, intentos: 0, registro: [{ tipo: "disparo", evento: "agendada", envio }] }], error: null };
    respuesta["workflows:select"] = { data: [{ id: "w-ag", nombre: "Agenda", encendido: true, modo: "prueba" }], error: null };
    const r = await avanzarEjecuciones("p1", { ahora: new Date("2026-11-10T12:00:00Z") });
    expect(r).toEqual({ hechas: 1, ok: 1, errores: [] });
    const [u] = updates("workflow_ejecuciones");
    expect(u).toMatchObject({ estado: "ok", error: null });
    expect(u).not.toHaveProperty("coincide");
    expect(u.registro).toEqual([expect.objectContaining({ tipo: "disparo" }), expect.objectContaining({ tipo: "tramo", modo: "prueba", pasos: ["m (mover_dashboard)"] })]);
    expect(consultas.some((c) => c.tabla === "entradas" || c.tabla === "webhook_eventos")).toBe(false);
    // El aviso de bucle de C1 cuenta registro @> [{modo:"real"}] (algún elemento con modo real): esta no
    expect((u.registro as Record<string, unknown>[]).some((x) => x.modo === "real")).toBe(false);
    // y en pantalla no sale como «Enviado a GHL»
    expect(estadoEjecucion({ estado: "ok", coincide: null, registro: u.registro })).toEqual({ texto: "Prueba: no se envía", tono: "neutro" });
  });
});
