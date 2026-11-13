// Ola 6 · 6V (C1 y C6): la venta, los cobros y el cambio de forma de pago se guardan con una función de la base
// (una transacción); la devolución solo se apunta si la venta aún no tenía. Base simulada: guarda las consultas
// y las llamadas a funciones, y contesta lo que diga `base["tabla:tipo"]` o `base["rpc:función"]`.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string } | null };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let consultas: Consulta[];
let llamadas: { fn: string; args: Record<string, unknown> }[];
let base: Record<string, Resp>;
const tipo = (c: Consulta) => ["delete", "upsert", "update", "insert"].find((o) => c.ops.some(([x]) => x === o)) ?? "select";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      llamadas.push({ fn, args });
      return Promise.resolve(base[`rpc:${fn}`] ?? { data: null, error: null });
    },
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "neq", "order", "limit", "update", "insert", "delete", "maybeSingle", "single"])
        q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: Resp) => unknown, f?: (e: unknown) => unknown) => Promise.resolve(base[`${c.tabla}:${tipo(c)}`] ?? { data: null, error: null }).then(r, f);
      return q;
    },
  }),
}));
vi.mock("@/lib/permisos", async () => ({ exigirSeccion: async () => (await import("@/lib/sesion")).getSesion() }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => undefined }));
vi.mock("@/lib/datos", async (original) => ({ ...(await original<typeof import("@/lib/datos")>()), registrarActividad: async () => undefined }));

const { getSesion } = await import("@/lib/sesion");
const { registrarVenta } = await import("@/app/(panel)/leads/acciones");
const { registrarCobro, cambiarFormaPago, registrarDevolucion } = await import("@/app/(panel)/ventas/acciones");

const fallo: Resp = { data: null, error: { message: "la base no responde" } };
const de = (tabla: string, t: string) => consultas.filter((c) => c.tabla === tabla && tipo(c) === t);
const GENERICO = "Algo ha fallado. Inténtalo de nuevo y, si se repite, avisa al director.";

beforeEach(() => {
  consultas = [];
  llamadas = [];
  base = {};
  vi.mocked(getSesion).mockResolvedValue({ perfil: { id: "ceo", rol: "ceo" }, proyecto: { id: "p1", nombre: "Eternity", zona_horaria: "Europe/Madrid" } } as never);
});

describe("C1 · Venta en un paso", () => {
  const venta = (extra: Record<string, string> = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ producto: "pr1", facturacion: "1000", cash: "200", tipo_pago: "reserva", metodo: "stripe", fecha: "2026-11-02", ...extra })) fd.set(k, v);
    return fd;
  };
  beforeEach(() => {
    base["leads:select"] = { data: { id: "l1", caller_id: null, closer_id: null, pipeline_id: null }, error: null };
    base["productos:select"] = { data: { id: "pr1", nombre: "VIP" }, error: null };
    base["citas:select"] = { data: { id: "c1", closer_id: "luis", fecha: "2026-01-01T10:00:00Z" }, error: null };
    base["rpc:registrar_venta"] = { data: "v1", error: null };
  });

  it("venta, plazos, lead y cita van en UNA llamada a registrar_venta (nada suelto)", async () => {
    expect(await registrarVenta("l1", venta())).toBeUndefined();
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({
      fn: "registrar_venta",
      args: { p_proyecto: "p1", p_lead: "l1", p_producto: "pr1", p_vendedor: "luis", p_facturacion: 1000, p_cash: 200, p_tipo_pago: "reserva", p_num_cuotas: null, p_metodo: "stripe", p_cita: "c1", p_cita_fecha: null, p_estrellas: null },
    });
    expect(llamadas[0].args.p_plazos).toEqual([{ numero: 1, importe: 800, vence_el: expect.any(String) }]);
    for (const [t, op] of [["ventas", "insert"], ["vencimientos", "insert"], ["leads", "update"], ["citas", "update"]]) expect(de(t, op)).toHaveLength(0);
  });

  it("cita futura: se cierra con la hora de ahora; sin cita, p_cita null", async () => {
    base["citas:select"] = { data: { id: "c1", closer_id: "luis", fecha: "2099-01-01T10:00:00Z" }, error: null };
    await registrarVenta("l1", venta({ desde_cita: "1", estrellas: "4" }));
    expect(llamadas[0].args).toMatchObject({ p_cita: "c1", p_cita_fecha: expect.any(String), p_estrellas: 4 });
    llamadas = [];
    base["citas:select"] = { data: null, error: null };
    await registrarVenta("l1", venta());
    expect(llamadas[0].args).toMatchObject({ p_cita: null, p_cita_fecha: null });
  });

  it("si otra venta cerró la cita a la vez, mismo aviso que antes; si falla otra cosa, mensaje genérico", async () => {
    base["rpc:registrar_venta"] = { data: null, error: { message: "registrar_venta: cita_cerrada" } };
    expect(await registrarVenta("l1", venta())).toEqual({ error: "Esa cita no es de este lead o ya está cerrada." });
    base["rpc:registrar_venta"] = fallo;
    expect(await registrarVenta("l1", venta())).toEqual({ error: GENERICO });
  });
});

describe("C6 · Cobros, forma de pago y devoluciones", () => {
  beforeEach(() => {
    base["ventas:select"] = { data: { id: "v1", lead_id: "l1", vendedor_id: "ceo", facturacion: 1000, cash_collected: 200, fecha: "2026-11-01T10:00:00Z", devuelto: null }, error: null };
  });

  it("cobro: lo comprueba y lo guarda registrar_cobro (con la venta bloqueada), no la app", async () => {
    expect(await registrarCobro("v1", "300", "stripe")).toBeUndefined();
    expect(llamadas).toEqual([{ fn: "registrar_cobro", args: { p_proyecto: "p1", p_venta: "v1", p_importe: 300, p_metodo: "stripe", p_registrado_por: "ceo", p_fecha: expect.any(String) } }]);
    expect(de("pagos", "insert")).toHaveLength(0);
    expect(de("pagos", "select")).toHaveLength(0);
  });

  it("cobro: si se pasa de lo facturado, el mismo aviso de antes; si falla la base, genérico", async () => {
    base["rpc:registrar_cobro"] = { data: null, error: { message: "registrar_cobro: excede_facturacion" } };
    expect(await registrarCobro("v1", "900", "stripe")).toEqual({ error: "Con ese importe se cobraría más que la facturación." });
    base["rpc:registrar_cobro"] = fallo;
    expect(await registrarCobro("v1", "100", "stripe")).toEqual({ error: GENERICO });
  });

  it("forma de pago: borrar plazos, crear los nuevos y cambiar la venta, en una llamada a cambiar_forma_pago", async () => {
    base["pagos:select"] = { data: [], error: null };
    base["vencimientos:select"] = { data: [{ id: "x1", importe: 800, estado: "pendiente", numero: 1 }], error: null };
    expect(await cambiarFormaPago("v1", "cuotas", "2")).toBeUndefined();
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({ fn: "cambiar_forma_pago", args: { p_proyecto: "p1", p_venta: "v1", p_tipo: "cuotas", p_num_cuotas: 2 } });
    expect((llamadas[0].args.p_plazos as { importe: number }[]).map((p) => p.importe)).toEqual([400, 400]);
    for (const op of ["delete", "insert"]) expect(de("vencimientos", op)).toHaveLength(0);
    expect(de("ventas", "update")).toHaveLength(0);
    base["rpc:cambiar_forma_pago"] = fallo;
    expect(await cambiarFormaPago("v1", "reserva")).toEqual({ error: GENERICO });
  });

  it("forma de pago: si falla leer pagos o plazos, no cambia nada", async () => {
    base["pagos:select"] = fallo;
    expect(await cambiarFormaPago("v1", "reserva")).toEqual({ error: GENERICO });
    expect(llamadas).toHaveLength(0);
  });

  it("devolución: solo si la venta aún no tenía (devuelto vacío); si otro la apuntó a la vez, avisa", async () => {
    base["pagos:select"] = { data: [], error: null };
    base["ventas:update"] = { data: [{ id: "v1" }], error: null };
    expect(await registrarDevolucion("v1", "100", "", "")).toBeUndefined();
    expect(de("ventas", "update")[0].ops).toContainEqual(["is", ["devuelto", null]]);
    base["ventas:update"] = { data: [], error: null };
    expect(await registrarDevolucion("v1", "100", "", "")).toEqual({ error: "Esta venta ya tiene una devolución registrada." });
  });
});
