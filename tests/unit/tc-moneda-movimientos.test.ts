// Cristian (17 nov): cada movimiento guarda su moneda. La comisión pagada lleva la moneda de la persona (la misma
// regla que Finanzas usa para sus ventas) y Finanzas la filtra igual que las ventas; sin moneda = la del proyecto.
import { describe, expect, it, vi } from "vitest";
import { filtrarPorMoneda } from "@/lib/finanzas";

type Resp = { data: unknown; error: null };
const inserts: { tabla: string; fila: Record<string, unknown> }[] = [];
const base: Record<string, Resp> = {
  "liquidaciones:select": { data: { id: "l1", proyecto_id: "p1", estado: "pendiente", perfil_id: "ana", comision_cobrado: 50, mes: "2026-11", perfiles: { nombre: "Ana" } }, error: null },
  "movimientos:insert": { data: { id: "m1" }, error: null },
  "liquidaciones:update": { data: [{ id: "l1" }], error: null },
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      let t = "select";
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "range", "maybeSingle", "single", "delete", "update"]) q[m] = () => ((t = m === "delete" || m === "update" ? m : t), q);
      q.insert = (fila: Record<string, unknown>) => ((t = "insert"), inserts.push({ tabla, fila }), q);
      q.then = (r: (v: Resp) => unknown) => Promise.resolve(base[`${tabla}:${t}`] ?? { data: null, error: null }).then(r);
      return q;
    },
  }),
}));
// Proyecto en $; Ana es de España (€)
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => ({ perfil: { id: "jefe", rol: "admin" }, proyecto: { id: "p1", moneda: "USD", zona_horaria: "America/New_York" } }) }));
vi.mock("@/lib/auth", () => ({ exigirNoEsPropia: () => undefined }));
vi.mock("@/lib/mercado-datos", () => ({ mercadosDelProyecto: async () => ({ ana: "es", luis: "latam" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => undefined }));

describe("TC · la comisión pagada guarda su moneda", () => {
  it("persona de España (€) en un proyecto en $: el gasto lleva EUR", async () => {
    const fin = await import("@/app/(panel)/finanzas/acciones");
    expect(await fin.pagarLiquidacion("l1", null)).not.toMatchObject({ error: expect.anything() });
    const mov = inserts.find((i) => i.tabla === "movimientos")!.fila;
    expect(mov).toMatchObject({ tipo: "egreso", importe: 50, origen: "liquidacion", moneda: "EUR" });
  });
});

describe("TC · filtrarPorMoneda con movimientos con moneda", () => {
  const d = { ventas: [], pagos: [], vencimientos: [], movimientos: [{ id: "eur", moneda: "EUR" as const }, { id: "usd", moneda: "USD" as const }, { id: "viejo", moneda: null }, { id: "sin" }] };
  const ids = (r: { movimientos: { id: string }[] }) => r.movimientos.map((m) => m.id);
  const monedaDe = () => "USD" as const;
  it("proyecto en $: el EUR solo en la vista €; null y sin campo, como hoy (solo en la del proyecto)", () => {
    expect(ids(filtrarPorMoneda(d, "EUR", monedaDe, "USD"))).toEqual(["eur"]);
    expect(ids(filtrarPorMoneda(d, "USD", monedaDe, "USD"))).toEqual(["usd", "viejo", "sin"]);
  });
  it("proyecto en €: el USD sale en la vista $ y no en la €", () => {
    expect(ids(filtrarPorMoneda(d, "USD", monedaDe, "EUR"))).toEqual(["usd"]);
    expect(ids(filtrarPorMoneda(d, "EUR", monedaDe, "EUR"))).toEqual(["eur", "viejo", "sin"]);
  });
});
