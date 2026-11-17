// Fase 4, zona b: mandar a GHL y otras lecturas. Errores de la base que antes se perdían en silencio.
// La base se simula como en ghl-429.test.ts; `respuesta[tabla:tipo]` puede ser una lista (una respuesta por consulta, en orden).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string; code?: string } | null };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let respuesta: Record<string, Resp | Resp[]>;
let consultas: Consulta[];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const tipo = () => (["update", "insert", "upsert"].find((t) => c.ops.some(([o]) => o === t)) ?? "select");
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "not", "gte", "lte", "order", "range", "limit", "update", "insert", "upsert", "maybeSingle", "single", "neq", "or"])
        q[m] = (...args: unknown[]) => {
          c.ops.push([m, args]);
          return q;
        };
      q.then = (r: (v: Resp) => unknown, f?: (e: unknown) => unknown) => {
        const v = respuesta[`${tabla}:${tipo()}`];
        return Promise.resolve((Array.isArray(v) ? v.shift() : v) ?? { data: null, error: null }).then(r, f);
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/ghl", async (orig) => ({ ...(await orig<object>()), crearOActualizarContactoGhl: vi.fn(async () => ({ id: "c1", etiquetas: [] })) }));
vi.mock("@/lib/entrada-ghl", async (orig) => ({ ...(await orig<object>()), armarEnvioGhl: () => ({ contacto: { email: "a@x.com" }, customFields: [], etiquetas: [], oportunidades: [] }) }));
vi.mock("@/lib/cifrado", () => ({ descifrar: (x: string) => x }));
vi.mock("@/lib/ghl-llamadas", async (orig) => ({ ...(await orig<object>()), llamadasGhl: vi.fn(async () => [{ id: "m1", contactId: "c1", userId: "u1", meta: { callDuration: 90 } }]) }));
vi.mock("@/lib/fathom", async (orig) => ({ ...(await orig<object>()), reunionesFathom: vi.fn(async () => [{ recording_id: 7, title: "Reunión" }]) }));
vi.mock("@/lib/limite", () => ({ dentroDelLimite: async () => true }));
vi.mock("@/lib/ghl-sync", () => ({ ponerEtiqueta: vi.fn(async () => {}) }));
vi.mock("@/lib/aviso-closer", () => ({ avisarCloserAgenda: vi.fn(async () => {}) }));
vi.mock("@/lib/leads", async (orig) => ({ ...(await orig<object>()), pipelineCitaGhl: async () => null, moverAAgendadosOrganico: vi.fn(async () => {}), datosAgendaGhl: async () => ({}) }));

const ops = (tabla: string, tipo: string) => consultas.filter((c) => c.tabla === tabla && c.ops.some(([o]) => o === tipo));

beforeEach(() => {
  consultas = [];
  respuesta = {};
});

describe("S3-5 · ghl-envios marca «ok» solo los envíos que se leyeron y mandaron", () => {
  it("el update a «ok» va con .in('id', leídos), no con todos los «esperando» del lead", async () => {
    const { enviarPendientesGhl } = await import("@/lib/ghl-envios");
    const ev = { id: "ev1", entrada_id: "en1", lead_id: "l1", ghl_intentos: 0, recibido_en: "2026-11-08T11:00:00Z", payload: { email: "a@x.com" } };
    respuesta["webhook_eventos:select"] = { data: [ev], error: null };
    respuesta["entradas:select"] = { data: [{ id: "en1", nombre: "Landing", ghl_activo: true, ghl_campos: {}, ghl_oportunidades: [], ghl_etiquetas_extra: [] }], error: null };
    respuesta["leads:select"] = { data: { ghl_contact_id: "c1", etiquetas: [] }, error: null };
    const r = await enviarPendientesGhl({ id: "p1", ghl_location_id: "loc" }, "tok", { avisar: async () => {} });
    expect(r.errores).toEqual([]);
    expect(r.enviados).toBe(1);
    // la lectura de los payloads trae también el id
    expect(consultas.filter((c) => c.tabla === "webhook_eventos").map((c) => c.ops[0][1][0])).toContain("id, payload");
    const ok = ops("webhook_eventos", "update").find((c) => (c.ops[0][1][0] as { ghl_estado?: string }).ghl_estado === "ok")!;
    expect(ok.ops).toContainEqual(["in", ["id", ["ev1"]]]);
    expect(ok.ops).not.toContainEqual(["eq", ["lead_id", "l1"]]);
  });
});

describe("S3-9 · ghl-llamadas-sync no traga el error de la lectura de leads", () => {
  it("si falla leer los leads, lanza y no avanza la fecha", async () => {
    const { sincronizarLlamadasGhl } = await import("@/lib/ghl-llamadas-sync");
    respuesta["proyectos:select"] = { data: { ghl_token: "t", ghl_location_id: "loc", ghl_llamadas_sincronizado_en: null }, error: null };
    respuesta["leads:select"] = { data: null, error: { message: "caída" } };
    await expect(sincronizarLlamadasGhl("p1")).rejects.toThrow(/caída/);
    expect(ops("llamadas_ghl", "upsert")).toHaveLength(0);
    expect(ops("proyectos", "update")).toHaveLength(0);
  });
});

describe("S3-9 · fathom-sync no avanza la fecha si el upsert falla", () => {
  it("error en el upsert → resultado con error y sincronizado_en sin tocar", async () => {
    const { sincronizarFathom } = await import("@/lib/fathom-sync");
    respuesta["cuentas_fathom:select"] = { data: [{ id: "cf1", proyecto_id: "p1", perfil_id: "pe1", nombre: "Ana", api_key: "k", formato_titulo: null, sincronizado_en: null }], error: null };
    respuesta["grabaciones:upsert"] = { data: null, error: { message: "fallo upsert" } };
    const res = await sincronizarFathom("p1");
    expect(res[0].error).toMatch(/fallo upsert/);
    const cambios = ops("cuentas_fathom", "update").map((c) => c.ops[0][1][0] as Record<string, unknown>);
    expect(cambios.some((x) => "sincronizado_en" in x)).toBe(false);
  });
});

describe("S4-3 · webhook de GHL, cita_agendada: errores de la base", () => {
  const llamar = async () => {
    const { POST } = await import("@/app/api/webhooks/ghl/[proyectoId]/route");
    const pid = "11111111-1111-1111-1111-111111111111";
    respuesta["proyectos:select"] = { data: { id: pid, webhook_secreto: "s", ghl_calendarios: [], zona_horaria: "Europe/Madrid" }, error: null };
    respuesta["webhook_eventos:insert"] = { data: { id: "ev1" }, error: null };
    const body = { tipo: "cita_agendada", email: "lead@x.com", pipeline: "Agendas", fecha: "2026-12-01T10:00:00Z", closer_email: "c@x.com", appointment: { id: "ap1" } };
    const req = new Request(`http://x/api/webhooks/ghl/${pid}`, { method: "POST", headers: { "x-eternity-secreto": "s" }, body: JSON.stringify(body) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return POST(req as any, { params: Promise.resolve({ proyectoId: pid }) } as any);
  };
  beforeEach(() => {
    respuesta["leads:select"] = [{ data: { id: "l1", pipeline_id: null }, error: null }, { data: { estado_caller: "vendido" }, error: null }];
    respuesta["miembros_proyecto:select"] = { data: { perfil_id: "pe1" }, error: null };
    respuesta["citas:select"] = { data: { id: "ci1" }, error: null };
  });

  it("si falla buscar el closer, responde error (no deja la cita sin closer en silencio)", async () => {
    respuesta["miembros_proyecto:select"] = { data: null, error: { message: "caída closer" } };
    const r = await llamar();
    expect(r.status).toBe(422);
    expect(ops("citas", "update")).toHaveLength(0);
  });

  it("si falla el update de la cita, responde error (no ok)", async () => {
    respuesta["citas:update"] = { data: null, error: { message: "caída cita" } };
    const r = await llamar();
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ ok: false, error: expect.stringMatching(/caída cita/) });
  });

  it("si falla leer el estado del lead, no lo toca y responde error", async () => {
    respuesta["leads:select"] = [{ data: { id: "l1", pipeline_id: null }, error: null }, { data: null, error: { message: "caída estado" } }];
    const r = await llamar();
    expect(r.status).toBe(422);
    expect(ops("leads", "update")).toHaveLength(0);
  });
});

describe("S3-6 · tarjetas no esconde errores que mencionan la tabla", () => {
  it("un error de clave foránea con «tarjetas_extra» en el mensaje sale como error", async () => {
    const { anadirTarjetas } = await import("@/lib/tarjetas");
    respuesta["tarjetas_extra:upsert"] = { data: null, error: { code: "23503", message: 'insert or update on table "tarjetas_extra" violates foreign key constraint' } };
    await expect(anadirTarjetas("p1", [{ lead_id: "l1", pipeline_id: "pi1", etapa_id: null }])).rejects.toThrow(/Error creando tarjetas/);
  });
});
