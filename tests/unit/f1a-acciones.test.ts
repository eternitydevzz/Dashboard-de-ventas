// Fase 1 · zona a (pantalla del caller): acciones del servidor. Base simulada como en c11-acciones.test.ts.
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
      for (const m of ["select", "eq", "neq", "in", "gte", "order", "limit", "update", "insert", "delete", "maybeSingle", "single"]) q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: Resp) => unknown) => Promise.resolve(respuesta[`${tabla}:${tipo()}`] ?? { data: null, error: null }).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => undefined }));
const { getSesion } = await import("@/lib/sesion");
const { registrarLlamada, confirmarAgenda, deshacerResultado, registrarVenta } = await import("@/app/(panel)/leads/acciones");

const de = (t: string, op: string) => consultas.filter((c) => c.tabla === t && c.ops.some(([o]) => o === op));
const updates = (t: string) => de(t, "update").map((c) => c.ops.find(([o]) => o === "update")![1][0] as Record<string, unknown>);
const lead = { id: "l1", caller_id: "u1", closer_id: null, estado_caller: "nuevo", pipeline_id: "pip", etapa_id: "e-ini", estrellas_caller: null, llamar_en: null, datos: { fuente: "web" } };

beforeEach(() => {
  consultas = [];
  vi.mocked(getSesion).mockResolvedValue({ perfil: { id: "u1", rol: "caller" }, proyecto: { id: "p1", zona_horaria: "Europe/Madrid" } } as never);
  respuesta = {
    "leads:select": { data: lead, error: null },
    "etapas:select": { data: [{ id: "e-ini", nombre: "Webinar" }, { id: "e-desc", nombre: "Descartados" }], error: null },
    "actividades:select": { data: [{ id: "a1" }], error: null },
  };
});

describe("N1 · fuera «No responde»", () => {
  it("registrarLlamada ya no lo acepta", async () => {
    expect(await registrarLlamada("l1", "no_responde" as never, "")).toMatchObject({ error: "Resultado no válido." });
  });
});

describe("A3b-01 · deshacer devuelve el lead exactamente a como estaba", () => {
  it("registrarLlamada devuelve cómo estaba antes y las actividades que creó", async () => {
    const r = await registrarLlamada("l1", "seguimiento", "", 4);
    expect(r).toEqual({ deshacer: { leadId: "l1", despues: "seguimiento", antes: { estado_caller: "nuevo", etapa_id: "e-ini", estrellas_caller: null, llamar_en: null }, actividades: ["a1"] } });
  });

  it("«Descartado» apunta la columna de antes en leads.datos (sin pisar lo que había)", async () => {
    await registrarLlamada("l1", "descartado", "");
    expect(updates("leads")[0]).toMatchObject({ estado_caller: "descartado", datos: { fuente: "web", etapa_antes_descarte: "e-ini" } });
    expect(updates("leads")).toContainEqual({ etapa_id: "e-desc" });
  });

  it("«Mover a → Leads» tras un Descartado vuelve a la columna de antes (aunque el pipeline no tenga «Nuevos»)", async () => {
    respuesta["leads:select"] = { data: { ...lead, estado_caller: "descartado", etapa_id: "e-desc", datos: { etapa_antes_descarte: "e-ini" } }, error: null };
    await registrarLlamada("l1", "nuevo", "");
    expect(updates("leads")).toContainEqual({ etapa_id: "e-ini" });
  });

  it("deshacerResultado restaura estado, columna, estrellas y llamar_en, y borra solo sus actividades", async () => {
    respuesta["leads:select"] = { data: { ...lead, estado_caller: "no_interesa", etapa_id: "e-desc", estrellas_caller: 3 }, error: null };
    const r = await deshacerResultado({ leadId: "l1", despues: "no_interesa", antes: { estado_caller: "nuevo", etapa_id: "e-ini", estrellas_caller: null, llamar_en: null }, actividades: ["a1", "a2"] });
    expect(r).toBeUndefined();
    expect(updates("leads")).toEqual([{ estado_caller: "nuevo", etapa_id: "e-ini", estrellas_caller: null, llamar_en: null }]);
    const borrar = de("actividades", "delete")[0].ops;
    expect(borrar).toEqual(expect.arrayContaining([["in", ["id", ["a1", "a2"]]], ["eq", ["lead_id", "l1"]], ["eq", ["perfil_id", "u1"]], ["eq", ["proyecto_id", "p1"]]]));
  });

  it("si el lead cambió después (otro clic, otra persona), no deshace", async () => {
    respuesta["leads:select"] = { data: { ...lead, estado_caller: "agendado" }, error: null };
    const r = await deshacerResultado({ leadId: "l1", despues: "no_interesa", antes: { estado_caller: "nuevo", etapa_id: "e-ini", estrellas_caller: null, llamar_en: null }, actividades: [] });
    expect(r).toMatchObject({ error: expect.stringMatching(/cambió/) });
    expect(updates("leads")).toHaveLength(0);
  });

  it("no acepta estados, columnas ni estrellas inventados", async () => {
    respuesta["leads:select"] = { data: { ...lead, estado_caller: "seguimiento" }, error: null };
    const base = { leadId: "l1", despues: "seguimiento", antes: { estado_caller: "nuevo", etapa_id: "e-ini", estrellas_caller: null, llamar_en: null }, actividades: [] };
    expect(await deshacerResultado({ ...base, antes: { ...base.antes, estado_caller: "vendido" } })).toMatchObject({ error: expect.any(String) });
    expect(await deshacerResultado({ ...base, antes: { ...base.antes, estrellas_caller: 9 } })).toMatchObject({ error: expect.any(String) });
    expect(await deshacerResultado({ ...base, antes: { ...base.antes, etapa_id: "de-otro-pipeline" } })).toMatchObject({ error: expect.any(String) });
    expect(updates("leads")).toHaveLength(0);
  });

  it("deshacer «Confirma Agenda» devuelve también la cita a como estaba", async () => {
    respuesta["citas:select"] = { data: { id: "c1", estado: "pendiente" }, error: null };
    const r = (await confirmarAgenda("l1")) as { deshacer: { cita: unknown } };
    expect(r.deshacer.cita).toEqual({ id: "c1", estado: "pendiente" });
    consultas = [];
    respuesta["leads:select"] = { data: { ...lead, estado_caller: "confirma_agenda" }, error: null };
    await deshacerResultado({ ...r.deshacer, leadId: "l1", despues: "confirma_agenda", antes: { estado_caller: "agendado", etapa_id: "e-ini", estrellas_caller: null, llamar_en: null }, actividades: [] } as never);
    expect(updates("citas")).toEqual([{ estado: "pendiente" }]);
    // revisor: solo vuelve si la cita sigue «confirmada» (no reabre una cerrada, no-show o cancelada)
    expect(de("citas", "update")[0].ops).toEqual(expect.arrayContaining([["eq", ["estado", "confirmada"]]]));
  });

  it("revisor: borra solo actividades recientes del mismo resultado y tipos de botón", async () => {
    respuesta["leads:select"] = { data: { ...lead, estado_caller: "no_interesa" }, error: null };
    await deshacerResultado({ leadId: "l1", despues: "no_interesa", antes: { estado_caller: "nuevo", etapa_id: "e-ini", estrellas_caller: null, llamar_en: null }, actividades: ["a1"] });
    const ops = de("actividades", "delete")[0].ops;
    expect(ops).toEqual(expect.arrayContaining([["eq", ["resultado", "no_interesa"]], ["in", ["tipo", ["llamada", "whatsapp", "cambio_etapa"]]]]));
    expect(ops.some(([o, a]) => o === "gte" && a[0] === "creado_en")).toBe(true);
  });

  it("revisor: no deja volver a «Agendado» si el lead ya no tiene cita abierta", async () => {
    respuesta["leads:select"] = { data: { ...lead, estado_caller: "seguimiento" }, error: null };
    respuesta["citas:select"] = { data: null, error: null };
    const r = await deshacerResultado({ leadId: "l1", despues: "seguimiento", antes: { estado_caller: "agendado", etapa_id: "e-ini", estrellas_caller: null, llamar_en: null }, actividades: [] });
    expect(r).toMatchObject({ error: expect.stringMatching(/cita/) });
    expect(updates("leads")).toHaveLength(0);
  });
});

describe("N1 · el caller puede registrar cualquier venta", () => {
  it("ya no sale «El caller no registra ventas»", async () => {
    respuesta["productos:select"] = { data: { id: "pr1", nombre: "Grupal" }, error: null };
    const fd = new FormData();
    for (const [k, v] of Object.entries({ producto: "pr1", facturacion: "1000", cash: "1000", tipo_pago: "completo", metodo: "stripe" })) fd.set(k, v);
    expect(await registrarVenta("l1", fd)).toBeUndefined();
  });
});
