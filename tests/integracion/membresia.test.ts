// Bloque A (Cristian, 11 oct 2026): membresía mensual sin fin: al venderla queda un cobro cada mes hasta la baja
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, formulario, ok, type Escenario } from "../apoyo/escenario";
import { registrarVenta } from "@/app/(panel)/leads/acciones";
import { darDeBajaMembresia } from "@/app/(panel)/ventas/acciones";
import { asegurarPlazosMensuales } from "@/lib/finanzas-datos";

let e: Escenario;
let producto: string;
beforeAll(async () => {
  e = await crearEscenario();
  producto = (await db.from("productos").insert({ proyecto_id: e.proyecto.id, nombre: "Membresía", precio: 47, modo_pago: "mensual", vende_caller: true }).select("id").single()).data!.id;
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});
const plazos = async (venta: string) => (await db.from("vencimientos").select("numero, vence_el, estado").eq("venta_id", venta).order("numero")).data!;

describe("Membresía mensual", () => {
  it("al venderla queda el cobro del mes siguiente; luego se van creando; con la baja se quitan los que no vencieron", async () => {
    // 12 oct (Cristian): el caller ya no registra ventas: la registra el closer del lead
    await db.from("leads").update({ closer_id: e.p.closerA.id }).eq("id", e.leads.LeadA);
    como(e, e.p.closerA);
    await ok(registrarVenta(e.leads.LeadA, formulario({ producto, facturacion: "47", cash: "47", tipo_pago: "mensual", metodo: "stripe", fecha: "2026-10-11" })));
    const { data: v } = await db.from("ventas").select("id, tipo_pago").eq("lead_id", e.leads.LeadA).single();
    expect(v!.tipo_pago).toBe("mensual");
    expect((await plazos(v!.id)).map((p) => p.vence_el)).toEqual(["2026-11-11"]);
    expect(await asegurarPlazosMensuales(e.proyecto.id, "2027-01-12")).toBe(3);
    expect((await plazos(v!.id)).map((p) => p.vence_el)).toEqual(["2026-11-11", "2026-12-11", "2027-01-11", "2027-02-11"]);
    como(e, e.p.ceo);
    await ok(darDeBajaMembresia(v!.id));
    expect(await asegurarPlazosMensuales(e.proyecto.id, "2027-06-01")).toBe(0); // dada de baja: ya no crea
  });
  it("Ola 6 (C3): cargar Finanzas 4 veces a la vez no repite plazos; la base no deja repetir (venta, número)", async () => {
    await db.from("leads").update({ closer_id: e.p.closerA.id }).eq("id", e.leads.LeadLibre);
    como(e, e.p.closerA);
    await ok(registrarVenta(e.leads.LeadLibre, formulario({ producto, facturacion: "47", cash: "47", tipo_pago: "mensual", metodo: "stripe", fecha: "2026-10-11" })));
    const { data: v } = await db.from("ventas").select("id").eq("lead_id", e.leads.LeadLibre).single();
    await Promise.all([1, 2, 3, 4].map(() => asegurarPlazosMensuales(e.proyecto.id, "2027-01-12")));
    expect((await plazos(v!.id)).map((p) => p.vence_el)).toEqual(["2026-11-11", "2026-12-11", "2027-01-11", "2027-02-11"]);
    const { error } = await db.from("vencimientos").insert({ proyecto_id: e.proyecto.id, venta_id: v!.id, numero: 2, importe: 47, vence_el: "2030-01-01" });
    expect(error?.code).toBe("23505");
  });
  it("al vender, el lead va a la columna con el nombre del producto (p. ej. «Membresía» en Orgánico); si no hay, a «Cerrados»", async () => {
    const col = (await db.from("etapas").insert({ pipeline_id: e.pipeline.id, nombre: "Membresía", orden: 9 }).select("id").single()).data!.id;
    await db.from("leads").update({ pipeline_id: e.pipeline.id, etapa_id: e.etapas.Nuevos }).eq("id", e.leads.LeadB);
    await db.from("leads").update({ closer_id: e.p.closerB.id }).eq("id", e.leads.LeadB);
    como(e, e.p.closerB);
    await ok(registrarVenta(e.leads.LeadB, formulario({ producto, facturacion: "47", cash: "47", tipo_pago: "mensual", metodo: "stripe" })));
    expect((await db.from("leads").select("etapa_id").eq("id", e.leads.LeadB).single()).data!.etapa_id).toBe(col);
  });
});
