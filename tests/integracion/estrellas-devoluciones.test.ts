// V2-0: estrellas del caller y del closer, y devoluciones.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agendaPorLink, borrarEscenario, como, crearEscenario, db, falla, formulario, ok, type Escenario } from "../apoyo/escenario";
import { registrarLlamada, registrarVenta } from "@/app/(panel)/leads/acciones";
import { cambiarEstadoCita } from "@/app/(panel)/closer/acciones";
import { registrarCobro, registrarDevolucion } from "@/app/(panel)/ventas/acciones";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});
const lead = async (id: string) => (await db.from("leads").select("*").eq("id", id).single()).data!;
const citaDe = async (leadId: string) => (await db.from("citas").select("*").eq("lead_id", leadId).order("creado_en", { ascending: false }).limit(1).single()).data!;

describe("Estrellas del caller", () => {
  it("C11: «Llamado» no toca las estrellas (F2: antes «No contesta» ponía 1★ encima)", async () => {
    como(e, e.p.callerA);
    await ok(registrarLlamada(e.leads.LeadA, "llamado", ""));
    expect((await lead(e.leads.LeadA)).estrellas_caller).toBeNull();
  });
  it("«Llamar luego», «No interesa» y «Seguimiento» exigen elegir de 2 a 5", async () => {
    como(e, e.p.callerA);
    await falla(registrarLlamada(e.leads.LeadA, "llamar_luego", ""), /de 2 a 5/);
    await falla(registrarLlamada(e.leads.LeadA, "no_interesa", "", 1), /de 2 a 5/);
    await falla(registrarLlamada(e.leads.LeadA, "seguimiento", "", 6), /de 2 a 5/);
    await ok(registrarLlamada(e.leads.LeadA, "llamar_luego", "", 4));
    expect((await lead(e.leads.LeadA)).estrellas_caller).toBe(4);
  });
  it("las estrellas del caller pasan a la cita que llega de GHL", async () => {
    como(e, e.p.callerA);
    await agendaPorLink(e, e.leads.LeadA, e.p.callerA, e.p.closerA.id, "2026-10-21T10:00", 5);
    expect((await citaDe(e.leads.LeadA)).estrellas_caller).toBe(5);
    expect((await lead(e.leads.LeadA)).estrellas_caller).toBe(5);
  });
});

describe("Estrellas del closer", () => {
  it("«Seguimiento» y «Perdida» exigen de 1 a 5; «No califica» pone 1; «No show» no lleva", async () => {
    como(e, e.p.closerA);
    const c = await citaDe(e.leads.LeadA);
    await falla(cambiarEstadoCita(c.id, "seguimiento", ""), /de 1 a 5/);
    await ok(cambiarEstadoCita(c.id, "seguimiento", "", 3));
    expect((await citaDe(e.leads.LeadA)).estrellas_closer).toBe(3);
    await ok(cambiarEstadoCita(c.id, "no_califica", ""));
    expect((await citaDe(e.leads.LeadA)).estrellas_closer).toBe(1);
    await ok(cambiarEstadoCita(c.id, "no_show", ""));
    expect((await citaDe(e.leads.LeadA)).estrellas_closer).toBe(1); // no las toca
  });
  it("cerrar con venta desde la cita: sin estrellas no se guarda NADA; con estrellas, quedan en la cita", async () => {
    como(e, e.p.closerA);
    const c = await citaDe(e.leads.LeadA);
    await ok(cambiarEstadoCita(c.id, "confirmada", ""));
    const venta = { producto: e.productos["Mentoría grupal"], facturacion: "1997", cash: "500", tipo_pago: "reserva", metodo: "transferencia", desde_cita: "1" };
    await falla(registrarVenta(e.leads.LeadA, formulario(venta)), /de 1 a 5/);
    expect((await db.from("ventas").select("id").eq("lead_id", e.leads.LeadA)).data).toHaveLength(0);
    await ok(registrarVenta(e.leads.LeadA, formulario({ ...venta, estrellas: "5" })));
    expect(await citaDe(e.leads.LeadA)).toMatchObject({ estado: "cerrada", estrellas_closer: 5 });
  });
});

describe("Vendedor al cerrar una cita", () => {
  it("si el CEO cierra la cita de un closer, la venta es del closer de la cita", async () => {
    await agendaPorLink(e, e.leads.LeadB, e.p.callerB, e.p.closerB.id, "2026-10-08T10:00", 3);
    como(e, e.p.ceo);
    await ok(registrarVenta(e.leads.LeadB, formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1997", cash: "1997", tipo_pago: "completo", metodo: "stripe", desde_cita: "1", estrellas: "4" })));
    const { data } = await db.from("ventas").select("vendedor_id").eq("lead_id", e.leads.LeadB).single();
    expect(data!.vendedor_id).toBe(e.p.closerB.id);
  });
  it("desde la ficha (sin cita), el CEO sigue pudiendo elegir el vendedor", async () => {
    como(e, e.p.ceo);
    await ok(registrarVenta(e.leads.LeadLibre, formulario({ producto: e.productos["Low ticket"], facturacion: "47", cash: "47", tipo_pago: "completo", metodo: "stripe", vendedor: e.p.callerC.id })));
    const { data } = await db.from("ventas").select("vendedor_id").eq("lead_id", e.leads.LeadLibre).single();
    expect(data!.vendedor_id).toBe(e.p.callerC.id);
  });
});

describe("Devoluciones", () => {
  it("solo director o CEO; no más de lo cobrado; una sola vez; queda en el historial", async () => {
    const { data: v } = await db.from("ventas").select("id").eq("lead_id", e.leads.LeadA).single();
    como(e, e.p.closerA);
    await falla(registrarDevolucion(v!.id, "100", "", ""), /director o el CEO/);
    como(e, e.p.director);
    await ok(registrarCobro(v!.id, "300", "transferencia")); // cobrado: 500 + 300
    await falla(registrarDevolucion(v!.id, "801", "", ""), /más de lo cobrado/);
    await falla(registrarDevolucion(v!.id, "0", "", ""), /mayor que 0/);
    await ok(registrarDevolucion(v!.id, "800", "2026-10-25", "Pidió el reembolso"));
    const { data: d } = await db.from("ventas").select("devuelto, devuelto_en, devolucion_nota").eq("id", v!.id).single();
    expect(d).toMatchObject({ devuelto: 800, devolucion_nota: "Pidió el reembolso" });
    expect(d!.devuelto_en.startsWith("2026-10-25")).toBe(true);
    await falla(registrarDevolucion(v!.id, "10", "", ""), /ya tiene una devolución/);
    const { data: act } = await db.from("actividades").select("nota").eq("lead_id", e.leads.LeadA).eq("resultado", "devolucion");
    expect(act).toHaveLength(1);
  });
});
