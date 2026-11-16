// Fase 2 · zona a (Dinero), migración 20261120100000: cobrar membresías desde el 2.º mes (A5-01), una venta sin cita
// con doble clic no se duplica (S5-4), borrar una venta es todo o nada (S2-8), mover una venta en Agendas no la borra
// si su cita no se puede mover (S1-2) y una cita cerrada no cambia de closer (S1-9).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, falla, formulario, ok, type Escenario } from "../apoyo/escenario";
import { registrarVenta } from "@/app/(panel)/leads/acciones";
import { borrarVenta, registrarCobro } from "@/app/(panel)/ventas/acciones";
import { cambiarCloserCita, moverVenta } from "@/app/(panel)/closer/acciones";
import { localAIso } from "@/lib/formato";
import { zonaPersona } from "@/lib/zona-persona";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

const nuevoLead = async (nombre: string) =>
  (await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre, email: `${e.pref}-${nombre.toLowerCase()}@x.test`, caller_id: e.p.callerA.id, closer_id: e.p.closerA.id }).select("id").single()).data!.id as string;
let hora = 0;
const nuevaCita = async (lead: string) =>
  (await db.from("citas").insert({ proyecto_id: e.proyecto.id, lead_id: lead, closer_id: e.p.closerA.id, fecha: new Date(Date.UTC(2026, 9, 6, 8 + hora++)).toISOString(), estado: "confirmada" }).select("id").single()).data!.id as string;
const ventasDe = async (lead: string) => (await db.from("ventas").select("id").eq("lead_id", lead)).data!;
const estadoCita = async (id: string) => (await db.from("citas").select("estado").eq("id", id).single()).data!.estado;
const estadoLead = async (id: string) => (await db.from("leads").select("estado_caller").eq("id", id).single()).data!.estado_caller;
const errores = (rs: unknown[]) => rs.filter((r) => r && typeof r === "object" && "error" in r);

describe("A5-01 · Membresía: se cobra desde el 2.º mes", () => {
  it("mes 2 entra; un cobro que pasa de lo debido sigue rechazado", async () => {
    const producto = (await db.from("productos").insert({ proyecto_id: e.proyecto.id, nombre: "Membresía", precio: 47, modo_pago: "mensual", vende_caller: true }).select("id").single()).data!.id as string;
    const l = await nuevoLead("Membresia");
    como(e, e.p.ceo);
    await ok(registrarVenta(l, formulario({ producto, facturacion: "47", cash: "47", tipo_pago: "mensual", metodo: "stripe" })));
    const [v] = await ventasDe(l);
    await ok(registrarCobro(v.id, "47", "stripe")); // mes 2: antes «se cobraría más que la facturación»
    await falla(registrarCobro(v.id, "47", "stripe"), /más que la facturación/); // solo hay un plazo creado: no hay más que deber
    expect((await db.from("pagos").select("importe").eq("venta_id", v.id)).data!.map((p) => Number(p.importe))).toEqual([47]);
  });
});

describe("S5-4 · Venta sin cita con doble clic", () => {
  it("dos llamadas seguidas: 1 venta y 1 juego de plazos", async () => {
    const l = await nuevoLead("DobleSinCita");
    como(e, e.p.ceo);
    const vender = () => registrarVenta(l, formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1000", cash: "100", tipo_pago: "reserva", metodo: "stripe" }));
    const rs = await Promise.all([vender(), vender()]);
    expect(errores(rs)).toHaveLength(1);
    const vs = await ventasDe(l);
    expect(vs).toHaveLength(1);
    expect((await db.from("vencimientos").select("id").eq("lead_id", l)).data).toHaveLength(1);
  });
});

describe("S2-8 · Borrar venta en un paso", () => {
  it("borra la venta, su cita vuelve a «seguimiento» y el lead a «agendado»; otra vez: «Venta no encontrada.»", async () => {
    const l = await nuevoLead("Borrar");
    const cita = await nuevaCita(l);
    como(e, e.p.ceo);
    await ok(registrarVenta(l, formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1000", cash: "100", tipo_pago: "reserva", metodo: "stripe", cita_id: cita })));
    const [v] = await ventasDe(l);
    expect(await ok(borrarVenta(v.id))).toMatchObject({ citaId: cita });
    expect(await ventasDe(l)).toHaveLength(0);
    expect((await db.from("vencimientos").select("id").eq("venta_id", v.id)).data).toHaveLength(0);
    expect(await estadoCita(cita)).toBe("seguimiento");
    expect(await estadoLead(l)).toBe("agendado");
    await falla(borrarVenta(v.id), /Venta no encontrada/);
  });
});

describe("S1-2 · Mover una venta en Agendas", () => {
  it("reagendar a una hora ocupada no borra la venta; a una libre, sí y crea la cita nueva", async () => {
    const l = await nuevoLead("MoverVenta");
    const cita = await nuevaCita(l);
    como(e, e.p.ceo);
    await ok(registrarVenta(l, formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1000", cash: "1000", tipo_pago: "completo", metodo: "stripe", cita_id: cita })));
    const [v] = await ventasDe(l);
    const ocupada = "2027-03-10T10:00";
    const otro = await nuevoLead("Ocupa");
    await db.from("citas").insert({ proyecto_id: e.proyecto.id, lead_id: otro, closer_id: e.p.closerA.id, fecha: localAIso(ocupada, zonaPersona(e.p.ceo, e.proyecto)), estado: "confirmada" });
    await falla(moverVenta(v.id, { fechaLocal: ocupada }), /No está libre/);
    expect(await ventasDe(l)).toHaveLength(1);
    expect(await estadoCita(cita)).toBe("cerrada");
    await ok(moverVenta(v.id, { fechaLocal: "2027-03-10T16:00" }));
    expect(await ventasDe(l)).toHaveLength(0);
    expect(await estadoCita(cita)).toBe("reagendada");
  });
});

describe("S1-9 · Cambiar el closer de una cita cerrada", () => {
  it("no se puede: tiene su venta", async () => {
    const l = await nuevoLead("CerradaCloser");
    const cita = await nuevaCita(l);
    como(e, e.p.ceo);
    await ok(registrarVenta(l, formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1000", cash: "1000", tipo_pago: "completo", metodo: "stripe", cita_id: cita })));
    await falla(cambiarCloserCita(cita, e.p.closerB.id), /tiene su venta/);
    expect((await db.from("citas").select("closer_id").eq("id", cita).single()).data!.closer_id).toBe(e.p.closerA.id);
  });
});
