// Fase 2 · zona b (Finanzas). Fechas de plazos a fin de mes, cobros de deudores sin dinero fantasma, importación sin
// duplicados y filtro € / $. Base simulada (como c9-arreglos): cada consulta guarda sus pasos y contesta `base["tabla:tipo"]`.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { filtrarPorMoneda, monedaDeLaVista, pendienteDe, planDePagos, plazosMensualesQueFaltan, type VentaF } from "@/lib/finanzas";

type Resp = { data: unknown; error: { message: string; code?: string } | null };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let consultas: Consulta[];
let base: Record<string, Resp>;
const tipo = (c: Consulta) => ["delete", "upsert", "update", "insert"].find((o) => c.ops.some(([x]) => x === o)) ?? "select";
const arg = (c: Consulta, op: string) => c.ops.find(([x]) => x === op)?.[1];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "not", "gte", "lte", "order", "range", "limit", "update", "insert", "upsert", "delete", "maybeSingle", "single"])
        q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: Resp) => unknown, f?: (e: unknown) => unknown) => Promise.resolve(base[`${c.tabla}:${tipo(c)}`] ?? { data: null, error: null }).then(r, f);
      return q;
    },
  }),
}));
vi.mock("@/lib/permisos", async () => ({ exigirSeccion: async () => (await import("@/lib/sesion")).getSesion() }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => undefined }));

const { getSesion } = await import("@/lib/sesion");
const fin = await import("@/app/(panel)/finanzas/acciones");
const de = (tabla: string, t: string) => consultas.filter((c) => c.tabla === tabla && tipo(c) === t);
const orden = () => consultas.filter((c) => tipo(c) !== "select").map((c) => `${c.tabla}:${tipo(c)}`);

beforeEach(() => {
  consultas = [];
  base = {};
  vi.mocked(getSesion).mockResolvedValue({ perfil: { id: "ceo", rol: "ceo" }, proyecto: { id: "p1", nombre: "Eternity", zona_horaria: "America/New_York", moneda: "USD" } } as never);
});

describe("S3-3 · plazos a fin de mes", () => {
  it("cuotas de una venta del 31-oct: 30-nov y 31-dic (antes 1-dic y 31-dic)", () => {
    const plan = planDePagos({ facturacion: 300, cobradoHoy: 100, tipo: "cuotas", numCuotas: 3, fecha: "2026-10-31T12:00:00Z" });
    expect(plan.map((p) => p.vence_el)).toEqual(["2026-11-30", "2026-12-31"]);
  });
  it("cuotas de una venta del 31-ene sin cobro hoy: 31-ene, 28-feb, 31-mar (antes la 2.ª caía el 3-mar)", () => {
    const plan = planDePagos({ facturacion: 300, cobradoHoy: 0, tipo: "cuotas", numCuotas: 3, fecha: "2026-01-31T12:00:00Z" });
    expect(plan.map((p) => p.vence_el)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
  it("membresía del 31-ene: 28-feb, 31-mar, 30-abr (antes se quedaba en el 28 para siempre)", () => {
    const venta = { id: "v", lead_id: "l", facturacion: 47, fecha: "2026-01-31T12:00:00Z", tipo_pago: "mensual", baja_en: null };
    const primero = planDePagos({ facturacion: 47, cobradoHoy: 47, tipo: "mensual", numCuotas: null, fecha: venta.fecha });
    expect(primero.map((p) => p.vence_el)).toEqual(["2026-02-28"]);
    const nuevos = plazosMensualesQueFaltan([venta], [{ venta_id: "v", numero: 2, vence_el: "2026-02-28" }], "2026-04-01");
    expect(nuevos.map((p) => [p.numero, p.vence_el])).toEqual([[3, "2026-03-31"], [4, "2026-04-30"]]);
  });
});

describe("S6-4 · pendienteDe", () => {
  const v: VentaF = { id: "v1", lead_id: "l", producto_id: null, vendedor_id: null, facturacion: 1000, cash_collected: 300, fecha: "2026-10-01T12:00:00Z", metodo: "stripe", tipo_pago: "cuotas", devuelto: null, devuelto_en: null };
  const pago = (venta_id: string, importe: number) => ({ id: venta_id + importe, venta_id, importe, fecha: "2026-10-10T12:00:00Z", metodo: "stripe" });
  it("resta lo cobrado al vender y los pagos de esa venta (no los de otras)", () => {
    expect(pendienteDe(v, [pago("v1", 200), pago("otra", 999)])).toBe(500);
  });
  it("nunca negativo si se cobró de más", () => {
    expect(pendienteDe(v, [pago("v1", 900)])).toBe(0);
  });
});

describe("S2-1 · «Marcar cobrado» de un deudor", () => {
  beforeEach(() => {
    base["vencimientos:select"] = { data: { id: "f1", proyecto_id: "p1", estado: "pendiente", venta_id: null, importe: 10, nombre: "Juan", movimiento_id: null }, error: null };
    base["movimientos:insert"] = { data: { id: "m1" }, error: null };
  });
  it("crea el ingreso primero y lo guarda en el mismo cambio del plazo", async () => {
    base["vencimientos:update"] = { data: [{ id: "f1" }], error: null };
    expect(await fin.marcarVencimiento("f1", "pagado")).toBeUndefined();
    expect(orden()).toEqual(["movimientos:insert", "vencimientos:update"]);
    expect(arg(de("vencimientos", "update")[0], "update")?.[0]).toMatchObject({ estado: "pagado", movimiento_id: "m1" });
  });
  it("si el plazo no cambia (doble clic o fallo), borra el ingreso recién creado", async () => {
    base["vencimientos:update"] = { data: [], error: null };
    expect(await fin.marcarVencimiento("f1", "pagado")).toMatchObject({ error: expect.stringMatching(/acaba de cambiar/) });
    expect(de("movimientos", "delete").map((c) => arg(c, "eq"))).toEqual([["id", "m1"]]);
  });
  it("si falla crear el ingreso, el plazo no se toca", async () => {
    base["movimientos:insert"] = { data: null, error: { message: "la base no responde" } };
    expect(await fin.marcarVencimiento("f1", "pagado")).toMatchObject({ error: expect.any(String) });
    expect(de("vencimientos", "update")).toHaveLength(0);
  });
  it("deshacer: primero el plazo (solo si sigue pagado) y después se borra el ingreso", async () => {
    base["vencimientos:select"] = { data: { id: "f1", proyecto_id: "p1", estado: "pagado", venta_id: null, importe: 10, nombre: "Juan", movimiento_id: "m1" }, error: null };
    base["vencimientos:update"] = { data: [{ id: "f1" }], error: null };
    expect(await fin.marcarVencimiento("f1", "pendiente")).toBeUndefined();
    expect(orden()).toEqual(["vencimientos:update", "movimientos:delete"]);
    expect(de("vencimientos", "update")[0].ops).toContainEqual(["eq", ["estado", "pagado"]]);
  });
  it("deshacer: si el plazo falla, el ingreso sigue (no se pierde el dinero)", async () => {
    base["vencimientos:select"] = { data: { id: "f1", proyecto_id: "p1", estado: "pagado", venta_id: null, importe: 10, nombre: "Juan", movimiento_id: "m1" }, error: null };
    base["vencimientos:update"] = { data: null, error: { message: "la base no responde" } };
    expect(await fin.marcarVencimiento("f1", "pendiente")).toMatchObject({ error: expect.any(String) });
    expect(de("movimientos", "delete")).toHaveLength(0);
  });
});

describe("S2-2 · borrar el ingreso de un cobro", () => {
  it("si es el cobro de un plazo, no deja borrarlo", async () => {
    base["movimientos:select"] = { data: { id: "m1" }, error: null };
    base["vencimientos:select"] = { data: { id: "f1" }, error: null };
    expect(await fin.borrarMovimiento("m1")).toEqual({ error: "Este ingreso es el cobro de un pago: desmárcalo en Pagos pendientes" });
    expect(de("vencimientos", "select").at(-1)!.ops).toContainEqual(["eq", ["movimiento_id", "m1"]]);
    expect(de("movimientos", "delete")).toHaveLength(0);
  });
  it("un ingreso normal se borra", async () => {
    base["movimientos:select"] = { data: { id: "m1" }, error: null };
    expect(await fin.borrarMovimiento("m1")).toBeUndefined();
    expect(de("movimientos", "delete")).toHaveLength(1);
  });
});

describe("S2-3 · importar el extracto", () => {
  const csv = "fecha,descripcion,importe\n2026-11-01,café,-3\n2026-11-01,café,-3\n2026-11-02,cliente,100\n2026-13-45,mala,5\n31/02/2026,mala,5";
  it("salta lo que ya está en la base, deja entrar dos pagos iguales del archivo y rechaza fechas que no existen", async () => {
    // Ya existe el «cliente 100» del 2-nov en esta cuenta (sin cuenta = null)
    base["movimientos:select"] = { data: [{ tipo: "ingreso", importe: "100.00", fecha: "2026-11-02T17:00:00+00:00", descripcion: "cliente", cuenta_id: null }], error: null };
    const r = await fin.importarMovimientos(csv, null);
    expect(r).toMatchObject({ importados: 2, saltadas: 1 });
    expect((r as { fallos: string[] }).fallos).toEqual(["Fila 5: fecha o importe no válidos", "Fila 6: fecha o importe no válidos"]); // las saltadas van aparte, no como fallo
    const filas = arg(de("movimientos", "insert")[0], "insert")?.[0] as { descripcion: string; importe: number }[];
    expect(filas.map((f) => [f.descripcion, f.importe])).toEqual([["café", 3], ["café", 3]]); // dos cafés reales el mismo día
  });
  it("reimportar: si la base ya tiene 1 igual y el archivo trae 2, entra 1", async () => {
    base["movimientos:select"] = { data: [{ tipo: "egreso", importe: 50, fecha: "2026-11-01T17:00:00Z", descripcion: "Bizum Juan", cuenta_id: null }], error: null };
    const r = await fin.importarMovimientos("fecha,descripcion,importe\n2026-11-01,Bizum Juan,-50\n2026-11-01,Bizum Juan,-50", null);
    expect(r).toMatchObject({ importados: 1, saltadas: 1 });
  });
  it("lo mismo en otra cuenta no es repetido", async () => {
    base["movimientos:select"] = { data: [{ tipo: "egreso", importe: 3, fecha: "2026-11-01T17:00:00Z", descripcion: "café", cuenta_id: "otra" }], error: null };
    const r = await fin.importarMovimientos("fecha,descripcion,importe\n2026-11-01,café,-3", null);
    expect(r).toMatchObject({ importados: 1, saltadas: 0 });
  });
});

describe("A2-03 · filtro € / $ (filtrar, sin convertir)", () => {
  const venta = (id: string, vendedor_id: string) => ({ id, vendedor_id });
  const d = {
    ventas: [venta("v1", "es"), venta("v2", "latam"), venta("v3", "latam")],
    pagos: [{ venta_id: "v1" }, { venta_id: "v2" }],
    vencimientos: [{ venta_id: "v1" }, { venta_id: "v3" }, { venta_id: null }],
    movimientos: [{ id: "m1" }],
    programados: [{ id: "p1" }],
    otra: 1,
  };
  const monedaDe = (v: string | null) => (v === "es" ? "EUR" : "USD") as "EUR" | "USD";
  it("€: solo las ventas en euros y sus cobros y plazos; lo manual (moneda del proyecto, $) fuera", () => {
    const r = filtrarPorMoneda(d, "EUR", monedaDe, "USD");
    expect(r.ventas.map((v) => v.id)).toEqual(["v1"]);
    expect(r.pagos).toEqual([{ venta_id: "v1" }]);
    expect(r.vencimientos).toEqual([{ venta_id: "v1" }]);
    expect(r.movimientos).toEqual([]);
    expect(r.programados).toEqual([]);
    expect(r.otra).toBe(1);
  });
  it("$ (la del proyecto): las de dólares y lo manual", () => {
    const r = filtrarPorMoneda(d, "USD", monedaDe, "USD");
    expect(r.ventas.map((v) => v.id)).toEqual(["v2", "v3"]);
    expect(r.pagos).toEqual([{ venta_id: "v2" }]);
    expect(r.vencimientos).toEqual([{ venta_id: "v3" }, { venta_id: null }]);
    expect(r.movimientos).toEqual([{ id: "m1" }]);
    expect(r.programados).toEqual([{ id: "p1" }]);
  });
  it("?moneda=eur / usd; si no viene o no vale, la del proyecto", () => {
    expect(monedaDeLaVista("eur", "USD")).toBe("EUR");
    expect(monedaDeLaVista("usd", "EUR")).toBe("USD");
    expect(monedaDeLaVista(undefined, "EUR")).toBe("EUR");
    expect(monedaDeLaVista("yen", "USD")).toBe("USD");
  });
});
