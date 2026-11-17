// Fase 1b · zona a: lo que el servidor devuelve o hace para poder deshacer (nota, volver a nuevo, repartir).
// Base simulada como en f1a-acciones.test.ts. Datos inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string } | null };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let respuesta: Record<string, Resp>;
let consultas: Consulta[];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => ({ error: null }),
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const tipo = () => (["update", "insert", "delete"].find((o) => c.ops.some(([x]) => x === o)) ?? "select");
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "is", "not", "gte", "order", "limit", "range", "update", "insert", "delete", "maybeSingle", "single"]) q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: Resp) => unknown) => Promise.resolve(respuesta[`${tabla}:${tipo()}`] ?? { data: null, error: null }).then(r);
      return q;
    },
  }),
}));
const sesion = { perfil: { id: "u1", rol: "director" }, proyecto: { id: "p1", zona_horaria: "Europe/Madrid" } };
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => sesion }));
vi.mock("@/lib/datos", async (original) => ({
  ...(await original<typeof import("@/lib/datos")>()),
  equipo: async () => [{ id: "c1", rol: "caller", nombre: "Caller 1" }],
}));
const { getSesion } = await import("@/lib/sesion");
const { anadirNota, borrarNotaReciente, deshacerEtapaLead } = await import("@/app/(panel)/leads/acciones");
const { repartirLeads } = await import("@/app/(panel)/crm/reparto");

const de = (t: string, op: string) => consultas.filter((c) => c.tabla === t && c.ops.some(([o]) => o === op));
const lead = { id: "l1", caller_id: "u1", closer_id: null, estado_caller: "seguimiento", pipeline_id: "pip", etapa_id: "e-ini", estrellas_caller: 3, llamar_en: null, datos: null };

beforeEach(() => {
  consultas = [];
  vi.mocked(getSesion).mockResolvedValue(sesion as never);
  respuesta = {
    "leads:select": { data: lead, error: null },
    "etapas:select": { data: [{ id: "e-ini", nombre: "Webinar" }, { id: "e-nue", nombre: "Nuevos" }], error: null },
    "actividades:select": { data: [{ id: "n1" }], error: null },
  };
});

describe("4 · nota: devuelve su id y se puede borrar (solo la mía, reciente, del proyecto)", () => {
  it("anadirNota devuelve el id de la nota creada (sin coger una vieja)", async () => {
    respuesta["actividades:select"] = { data: { id: "n1" }, error: null }; // maybeSingle
    const r = await anadirNota("l1", "  hola  ");
    expect(r).toEqual({ id: "n1" });
    const busca = de("actividades", "select").find((c) => c.ops.some(([o]) => o === "gte"))!.ops;
    expect(busca).toEqual(expect.arrayContaining([["eq", ["lead_id", "l1"]], ["eq", ["perfil_id", "u1"]], ["eq", ["tipo", "nota"]], ["eq", ["nota", "hola"]]]));
  });

  it("borrarNotaReciente borra con todos los filtros del servidor", async () => {
    respuesta["actividades:delete"] = { data: [{ id: "n1" }], error: null };
    expect(await borrarNotaReciente("n1")).toBeUndefined();
    const borrar = de("actividades", "delete")[0].ops;
    expect(borrar).toEqual(expect.arrayContaining([["eq", ["id", "n1"]], ["eq", ["tipo", "nota"]], ["eq", ["perfil_id", "u1"]], ["eq", ["proyecto_id", "p1"]]]));
    const desde = borrar.find(([o, a]) => o === "gte" && a[0] === "creado_en")![1][1] as string;
    expect(Date.now() - Date.parse(desde)).toBeGreaterThan(14 * 60_000);
    expect(Date.now() - Date.parse(desde)).toBeLessThan(16 * 60_000);
  });

  it("si no borró nada (vieja, de otro, otro tipo), lo dice", async () => {
    respuesta["actividades:delete"] = { data: [], error: null };
    expect(await borrarNotaReciente("n1")).toMatchObject({ error: expect.stringMatching(/ya no se puede deshacer/i) });
    expect(await borrarNotaReciente("" as never)).toMatchObject({ error: expect.any(String) });
  });
});

describe("3 · repartir devuelve a quién tenía cada lead antes", () => {
  it("agrupa por caller de antes («» = sin caller) y solo los que cambian", async () => {
    respuesta["leads:select"] = {
      data: [
        { id: "l1", caller_id: "viejo", pais: null, creado_en: "2026-11-15T10:00:00Z" },
        { id: "l2", caller_id: null, pais: null, creado_en: "2026-11-14T10:00:00Z" },
        { id: "l3", caller_id: "c1", pais: null, creado_en: "2026-11-13T10:00:00Z" },
      ],
      error: null,
    };
    const r = await repartirLeads({ origen: "seleccion", leadIds: ["l1", "l2", "l3"], callers: ["c1"], modo: "equitativo", n: 3 });
    expect(r).toEqual({ repartidos: 3, antes: { viejo: ["l1"], "": ["l2"] } });
  });
});

describe("deshacerEtapaLead · vuelve a la columna de antes sin dejar historial", () => {
  const etapas = { data: [{ id: "e-ini", nombre: "Form completo", pipeline_id: "pip" }, { id: "e-nueva", nombre: "Biblioteca", pipeline_id: "pip2" }], error: null };
  it("mueve solo si sigue en la columna puesta y borra la línea «Movido a …» de ese clic", async () => {
    respuesta["leads:select"] = { data: { ...lead, etapa_id: "e-nueva" }, error: null };
    respuesta["etapas:select"] = etapas;
    respuesta["leads:update"] = { data: [{ id: "l1" }], error: null };
    respuesta["actividades:select"] = { data: { id: "a9" }, error: null };
    expect(await deshacerEtapaLead("l1", "e-ini", "e-nueva")).toBeUndefined();
    const up = de("leads", "update")[0].ops;
    expect(up).toContainEqual(["update", [{ etapa_id: "e-ini", pipeline_id: "pip" }]]);
    expect(up).toContainEqual(["eq", ["etapa_id", "e-nueva"]]);
    const busca = consultas.find((c) => c.tabla === "actividades" && !c.ops.some(([o]) => o === "delete"))!.ops;
    expect(busca).toEqual(expect.arrayContaining([["eq", ["perfil_id", "u1"]], ["eq", ["proyecto_id", "p1"]], ["eq", ["tipo", "cambio_etapa"]], ["eq", ["nota", "Movido a «Biblioteca»"]]]));
    expect(busca.some(([o, a]) => o === "gte" && a[0] === "creado_en")).toBe(true);
    expect(de("actividades", "delete")[0].ops).toContainEqual(["eq", ["id", "a9"]]);
  });
  it("si el lead cambió después, no toca nada", async () => {
    respuesta["leads:select"] = { data: { ...lead, etapa_id: "otra" }, error: null };
    expect(await deshacerEtapaLead("l1", "e-ini", "e-nueva")).toMatchObject({ error: expect.stringMatching(/cambió/) });
    expect(de("leads", "update")).toHaveLength(0);
    expect(de("actividades", "delete")).toHaveLength(0);
  });
});
