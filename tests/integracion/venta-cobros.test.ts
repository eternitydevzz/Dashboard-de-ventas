// Ola 6 · 6V (auditoría final C1 y C6): venta, cobros, forma de pago y devolución, todo o nada y sin duplicados
// cuando llegan dos a la vez. Funciones registrar_venta, registrar_cobro y cambiar_forma_pago (migración 20261115110000).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, formulario, ok, type Escenario } from "../apoyo/escenario";
import { registrarVenta } from "@/app/(panel)/leads/acciones";
import { cambiarFormaPago, registrarCobro, registrarDevolucion } from "@/app/(panel)/ventas/acciones";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

const nuevoLead = async (nombre: string) =>
  (await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre, email: `${e.pref}-${nombre.toLowerCase()}@x.test`, caller_id: e.p.callerA.id, closer_id: e.p.closerA.id }).select("id").single()).data!.id as string;
// Cada cita a una hora distinta: el índice «1 closer, 1 hora» no deja 2 citas abiertas del mismo closer a la misma hora
let hora = 0;
const nuevaCita = async (lead: string) =>
  (await db.from("citas").insert({ proyecto_id: e.proyecto.id, lead_id: lead, closer_id: e.p.closerA.id, fecha: new Date(Date.UTC(2026, 9, 5, 15 + hora++)).toISOString(), estado: "confirmada" }).select("id").single()).data!.id as string;
const ventasDe = async (lead: string) => (await db.from("ventas").select("id, tipo_pago, devuelto").eq("lead_id", lead)).data!;
const vender = (lead: string, extra: Record<string, string> = {}) =>
  registrarVenta(lead, formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1000", cash: "100", tipo_pago: "reserva", metodo: "stripe", ...extra }));
const errores = (rs: unknown[]) => rs.filter((r) => r && typeof r === "object" && "error" in r) as { error: string }[];

describe("C1 · Venta en un paso", () => {
  it("si fallan los plazos, no queda venta, la cita sigue abierta y el lead no pasa a «vendido»", async () => {
    const l = await nuevoLead("SinPlazos");
    const cita = await nuevaCita(l);
    const { error } = await db.rpc("registrar_venta", {
      p_proyecto: e.proyecto.id, p_lead: l, p_producto: e.productos["Mentoría grupal"], p_vendedor: e.p.closerA.id,
      p_facturacion: 1000, p_cash: 100, p_tipo_pago: "reserva", p_num_cuotas: null, p_metodo: "stripe", p_nota: null,
      p_fecha: new Date().toISOString(), p_plazos: [{ numero: 1, importe: 0, vence_el: "2026-12-01" }], // importe 0: lo rechaza la base
      p_cita: cita, p_cita_fecha: null, p_estrellas: null,
    });
    expect(error).not.toBeNull();
    expect(await ventasDe(l)).toHaveLength(0);
    expect((await db.from("citas").select("estado").eq("id", cita).single()).data!.estado).toBe("confirmada");
    expect((await db.from("leads").select("estado_caller").eq("id", l).single()).data!.estado_caller).not.toBe("vendido");
  });

  it("dos ventas a la vez con la misma cita: solo se guarda una, con sus plazos", async () => {
    const l = await nuevoLead("DobleClic");
    const cita = await nuevaCita(l);
    como(e, e.p.closerA);
    const rs = await Promise.all([vender(l, { cita_id: cita }), vender(l, { cita_id: cita })]);
    expect(errores(rs)).toHaveLength(1);
    expect(errores(rs)[0].error).toMatch(/ya está cerrada/);
    const vs = await ventasDe(l);
    expect(vs).toHaveLength(1);
    expect((await db.from("vencimientos").select("importe").eq("venta_id", vs[0].id)).data!.map((v) => Number(v.importe))).toEqual([900]);
    expect((await db.from("citas").select("estado").eq("id", cita).single()).data!.estado).toBe("cerrada");
    expect((await db.from("leads").select("estado_caller").eq("id", l).single()).data!.estado_caller).toBe("vendido");
  });
});

describe("C6 · Cobros, forma de pago y devolución", () => {
  it("dos cobros a la vez que juntos pasan de lo facturado: entra uno", async () => {
    const l = await nuevoLead("DosCobros");
    como(e, e.p.ceo);
    await ok(vender(l));
    const [v] = await ventasDe(l);
    const rs = await Promise.all([registrarCobro(v.id, "600", "stripe"), registrarCobro(v.id, "600", "stripe")]);
    expect(errores(rs).map((r) => r.error)).toEqual(["Con ese importe se cobraría más que la facturación."]);
    expect((await db.from("pagos").select("importe").eq("venta_id", v.id)).data!.map((p) => Number(p.importe))).toEqual([600]);
  });

  it("cambiar forma de pago: si fallan los plazos nuevos, quedan los de antes; si va bien, se cambian", async () => {
    const l = await nuevoLead("FormaPago");
    como(e, e.p.ceo);
    await ok(vender(l));
    const [v] = await ventasDe(l);
    const pendientes = async () => (await db.from("vencimientos").select("importe").eq("venta_id", v.id).eq("estado", "pendiente").order("numero")).data!.map((x) => Number(x.importe));
    const { error } = await db.rpc("cambiar_forma_pago", { p_proyecto: e.proyecto.id, p_venta: v.id, p_tipo: "cuotas", p_num_cuotas: 2, p_plazos: [{ numero: 1, importe: 0, vence_el: "2026-12-01" }] });
    expect(error).not.toBeNull();
    expect(await pendientes()).toEqual([900]);
    expect((await ventasDe(l))[0].tipo_pago).toBe("reserva");
    await ok(cambiarFormaPago(v.id, "cuotas", "3"));
    expect(await pendientes()).toEqual([300, 300, 300]);
    expect((await ventasDe(l))[0].tipo_pago).toBe("cuotas");
  });

  it("dos devoluciones a la vez: se guarda una y la otra avisa", async () => {
    const l = await nuevoLead("DosDevoluciones");
    como(e, e.p.ceo);
    await ok(vender(l));
    const [v] = await ventasDe(l);
    const rs = await Promise.all([registrarDevolucion(v.id, "50", "", "primera"), registrarDevolucion(v.id, "80", "", "segunda")]);
    expect(errores(rs).map((r) => r.error)).toEqual(["Esta venta ya tiene una devolución registrada."]);
    expect([50, 80]).toContain(Number((await ventasDe(l))[0].devuelto));
  });
});
