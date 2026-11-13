// Ola 6 · 6F: Finanzas sin pagos dobles ni plazos repetidos. Base simulada (como c9-arreglos): cada consulta guarda
// sus pasos y contesta lo que diga `contestar` (o `base["tabla:tipo"]`, o vacío).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string; code?: string } | null };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let consultas: Consulta[];
let base: Record<string, Resp>;
let contestar: (c: Consulta) => Resp | undefined;
const tipo = (c: Consulta) => ["delete", "upsert", "update", "insert"].find((o) => c.ops.some(([x]) => x === o)) ?? "select";
const arg = (c: Consulta, op: string) => c.ops.find(([x]) => x === op)?.[1];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "not", "order", "range", "update", "insert", "upsert", "delete", "maybeSingle", "single"])
        q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: Resp) => unknown, f?: (e: unknown) => unknown) =>
        Promise.resolve(contestar(c) ?? base[`${c.tabla}:${tipo(c)}`] ?? { data: null, error: null }).then(r, f);
      return q;
    },
  }),
}));
vi.mock("@/lib/permisos", async () => ({ exigirSeccion: async () => (await import("@/lib/sesion")).getSesion() }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => undefined }));
vi.mock("@/lib/datos", async (original) => ({ ...(await original<typeof import("@/lib/datos")>()), equipo: async () => [], conBajas: async (a: unknown) => a }));
vi.mock("@/lib/finanzas-datos", async (original) => ({ ...(await original<typeof import("@/lib/finanzas-datos")>()), cargarFinanzas: async () => ({ ventas: [], pagos: [], productos: [] }) }));
vi.mock("@/lib/equipo", () => ({ cargarEquipo: async () => ({ miembros: [], comisionesRol: {} }) }));
vi.mock("@/lib/finanzas", async (original) => ({
  ...(await original<typeof import("@/lib/finanzas")>()),
  liquidacionesMes: () => ["ana", "beto"].map((perfil_id) => ({ perfil_id, base_facturado: 0, base_cobrado: 0, comision_facturado: 0, comision_cobrado: 50, detalle: [] })),
}));

const { getSesion } = await import("@/lib/sesion");
const fin = await import("@/app/(panel)/finanzas/acciones");
const { asegurarPlazosMensuales } = await import("@/lib/finanzas-datos");

const fallo: Resp = { data: null, error: { message: "la base no responde" } };
const de = (tabla: string, t: string) => consultas.filter((c) => c.tabla === tabla && tipo(c) === t);

beforeEach(() => {
  consultas = [];
  base = { "citas:select": { data: [], error: null } };
  contestar = () => undefined;
  vi.mocked(getSesion).mockResolvedValue({ perfil: { id: "ceo", rol: "ceo" }, proyecto: { id: "p1", nombre: "Eternity", zona_horaria: "America/New_York" } } as never);
});

describe("C3 · plazos de la membresía", () => {
  const venta = { id: "v1", lead_id: "l1", facturacion: 47, fecha: "2026-10-11T15:00:00Z", tipo_pago: "mensual", baja_en: null };
  it("si falla leer los plazos, corta y no crea ninguno (antes los creaba todos otra vez)", async () => {
    base["ventas:select"] = { data: [venta], error: null };
    base["vencimientos:select"] = fallo;
    await expect(asegurarPlazosMensuales("p1", "2027-01-12")).rejects.toThrow(/no responde/);
    expect(de("vencimientos", "upsert")).toHaveLength(0);
    expect(de("vencimientos", "insert")).toHaveLength(0);
  });
  it("lee los plazos por trozos de 200 ventas y guarda con «ignorar repetidos» sobre (venta_id, numero)", async () => {
    const ventas = Array.from({ length: 250 }, (_, i) => ({ ...venta, id: `v${i}` }));
    base["ventas:select"] = { data: ventas, error: null };
    // Cada venta tiene el plazo de diciembre: faltan enero y el siguiente (febrero, siempre queda uno por venir)
    contestar = (c) => (c.tabla === "vencimientos" && tipo(c) === "select" ? { data: ((arg(c, "in")?.[1] ?? []) as string[]).map((venta_id) => ({ venta_id, numero: 3, vence_el: "2026-12-11" })), error: null } : undefined);
    expect(await asegurarPlazosMensuales("p1", "2027-01-12")).toBe(500);
    const lecturas = de("vencimientos", "select");
    expect(lecturas.map((c) => (arg(c, "in")?.[1] as string[]).length)).toEqual([200, 50]);
    expect(lecturas[0].ops).toContainEqual(["order", ["id"]]);
    const [guardar] = de("vencimientos", "upsert");
    expect(arg(guardar, "upsert")?.[1]).toEqual({ onConflict: "venta_id,numero", ignoreDuplicates: true });
    expect((arg(guardar, "upsert")?.[0] as { numero: number; vence_el: string }[])[0]).toMatchObject({ numero: 4, vence_el: "2027-01-11", proyecto_id: "p1" });
  });
  it("sin «hoy», usa el día en la zona del proyecto", async () => {
    vi.useFakeTimers({ now: new Date("2026-12-12T03:00:00Z"), toFake: ["Date"] }); // en Nueva York aún es el 11 por la noche
    try {
      base["ventas:select"] = { data: [venta], error: null };
      base["proyectos:select"] = { data: { zona_horaria: "America/New_York" }, error: null };
      base["vencimientos:select"] = { data: [{ venta_id: "v1", numero: 2, vence_el: "2026-12-12" }], error: null };
      // En Nueva York es el 11: el plazo del 12 aún no ha llegado, no toca crear el de enero (en UTC, sí)
      expect(await asegurarPlazosMensuales("p1")).toBe(0);
      expect(de("proyectos", "select")).toHaveLength(1);
      expect(de("vencimientos", "upsert")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("C2 · comisiones sin pago doble", () => {
  it("si falla leer las pagadas, corta sin guardar nada", async () => {
    base["liquidaciones:select"] = fallo;
    expect(await fin.calcularLiquidaciones("2026-11")).toMatchObject({ error: expect.any(String) });
    expect(de("liquidaciones", "upsert")).toHaveLength(0);
    expect(de("liquidaciones", "update")).toHaveLength(0);
    expect(de("liquidaciones", "delete")).toHaveLength(0);
  });
  it("crea las que faltan sin pisar las que ya hay y rehace solo las que siguen «pendiente»", async () => {
    base["liquidaciones:select"] = { data: [{ perfil_id: "beto" }], error: null }; // beto ya está pagada
    expect(await fin.calcularLiquidaciones("2026-11")).toMatchObject({ personas: 1, yaPagadas: 1 });
    const [crear] = de("liquidaciones", "upsert");
    expect(arg(crear, "upsert")?.[1]).toMatchObject({ ignoreDuplicates: true });
    expect((arg(crear, "upsert")?.[0] as { perfil_id: string }[]).map((f) => f.perfil_id)).toEqual(["ana"]);
    const [rehacer] = de("liquidaciones", "update");
    expect(rehacer.ops).toContainEqual(["eq", ["perfil_id", "ana"]]);
    expect(rehacer.ops).toContainEqual(["eq", ["estado", "pendiente"]]);
  });
});

describe("E · cuentas y desmarcar pago", () => {
  beforeEach(() => {
    base["liquidaciones:select"] = { data: { id: "f1", movimiento_id: "m1", perfil_id: "ana" }, error: null };
  });
  it("crear cuenta: si falla, no dice «hecho»", async () => {
    base["cuentas:select"] = { data: [], error: null };
    base["cuentas:insert"] = fallo;
    expect(await fin.guardarCuenta(null, "Banco", [])).toMatchObject({ error: expect.any(String) });
  });
  it("desmarcar: si falla leer la liquidación, corta sin cambiar nada", async () => {
    contestar = (c) => (c.tabla === "liquidaciones" && c.ops.some(([m]) => m === "single") ? fallo : undefined);
    expect(await fin.desmarcarLiquidacion("f1")).toMatchObject({ error: expect.any(String) });
    expect(de("liquidaciones", "update")).toHaveLength(0);
    expect(de("movimientos", "delete")).toHaveLength(0);
  });
  it("desmarcar: si otro ya la desmarcó (0 filas), avisa y no borra el gasto", async () => {
    base["liquidaciones:update"] = { data: [], error: null };
    expect(await fin.desmarcarLiquidacion("f1")).toMatchObject({ error: "Ya no está pagada." });
    expect(de("liquidaciones", "update")[0].ops).toContainEqual(["eq", ["estado", "pagada"]]);
    expect(de("movimientos", "delete")).toHaveLength(0);
  });
  it("desmarcar: si falla borrar el gasto, no dice «hecho»", async () => {
    base["liquidaciones:update"] = { data: [{ id: "f1" }], error: null };
    base["movimientos:delete"] = fallo;
    expect(await fin.desmarcarLiquidacion("f1")).toMatchObject({ error: expect.any(String) });
  });
  it("desmarcar: sin fallos, vuelve a pendiente y borra su gasto", async () => {
    base["liquidaciones:update"] = { data: [{ id: "f1" }], error: null };
    expect(await fin.desmarcarLiquidacion("f1")).toBeUndefined();
    expect(de("movimientos", "delete")[0].ops).toContainEqual(["eq", ["id", "m1"]]);
  });
});
