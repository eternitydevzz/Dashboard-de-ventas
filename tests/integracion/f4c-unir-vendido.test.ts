// Fase 4 · zona c (S5-7): al unir, si al lead que se queda le llegan ventas, pasa a «vendido».
// A «nuevo» (el antiguo) + B «vendido» con venta → A «vendido». Sin ventas, el estado de A no cambia.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";

let e: Escenario;
const unir = (queda: string, sobra: string) => db.rpc("unir_leads", { p_proyecto: e.proyecto.id, p_queda: queda, p_sobra: sobra });
async function lead(nombre: string, estado: string, creado: string) {
  const { data, error } = await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre, estado_caller: estado, creado_en: creado }).select("id").single();
  if (error) throw new Error(`leads: ${error.message}`);
  return data.id as string;
}
const estado = async (id: string) => (await db.from("leads").select("estado_caller").eq("id", id).single()).data?.estado_caller;

beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("f4c · unir_leads y «vendido»", () => {
  it("A «nuevo» + B «vendido» con venta → A «vendido» y con la venta", async () => {
    const a = await lead("A", "nuevo", "2026-01-01T00:00:00Z");
    const b = await lead("B", "vendido", "2026-02-01T00:00:00Z");
    const { error } = await db.from("ventas").insert({ proyecto_id: e.proyecto.id, lead_id: b, vendedor_id: e.p.closerA.id, facturacion: 1997, cash_collected: 500, tipo_pago: "reserva" });
    expect(error).toBeNull();
    expect((await unir(a, b)).error).toBeNull();
    expect(await estado(a)).toBe("vendido");
    expect((await db.from("ventas").select("id").eq("lead_id", a)).data).toHaveLength(1);
  });

  it("sin ventas, el que se queda conserva su estado", async () => {
    const a = await lead("C", "seguimiento", "2026-01-01T00:00:00Z");
    const b = await lead("D", "nuevo", "2026-02-01T00:00:00Z");
    expect((await unir(a, b)).error).toBeNull();
    expect(await estado(a)).toBe("seguimiento");
  });
});
