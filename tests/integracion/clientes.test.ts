// V2-7: Clientes = quien ha comprado. Estado a mano, seguimiento, onboarding, caso de éxito y «Nuevo cliente» (datos + venta).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, falla, formulario, ok, type Escenario } from "../apoyo/escenario";
import { anotarSeguimiento, cambiarEstadoCliente, guardarCasoExito, guardarPasoOnboarding, marcarPasoOnboarding, nuevoCliente } from "@/app/(panel)/clientes/acciones";
import { registrarVenta } from "@/app/(panel)/leads/acciones";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});
const ficha = async (leadId: string) => (await db.from("clientes").select("*").eq("proyecto_id", e.proyecto.id).eq("lead_id", leadId).maybeSingle()).data;
const venta = (extra: Record<string, string> = {}) => formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1997", cash: "997", tipo_pago: "reserva", metodo: "stripe", ...extra });

describe("Clientes", () => {
  it("solo con la sección «clientes»: el director no entra por defecto", async () => {
    como(e, e.p.director);
    await falla(nuevoCliente(venta({ nombre: "X", email: "x@x.test" })), /No tienes acceso/);
  });

  it("solo se toca la ficha de quien ha comprado", async () => {
    como(e, e.p.ceo);
    await falla(cambiarEstadoCliente(e.leads.LeadLibre, "pausado"), /no ha comprado/);
    await ok(registrarVenta(e.leads.LeadLibre, venta()));
    await ok(cambiarEstadoCliente(e.leads.LeadLibre, "pausado"));
    expect(await ficha(e.leads.LeadLibre)).toMatchObject({ estado: "pausado" });
    await falla(cambiarEstadoCliente(e.leads.LeadLibre, "otro" as "activo"), /no válido/);
  });

  it("seguimiento: nota + próxima fecha; vaciar la fecha la quita", async () => {
    como(e, e.p.ceo);
    await ok(anotarSeguimiento(e.leads.LeadLibre, "Le va bien, pide plantilla", "2026-10-20"));
    expect((await ficha(e.leads.LeadLibre))!.proximo_contacto).toBe("2026-10-20");
    expect((await db.from("seguimientos_cliente").select("nota").eq("lead_id", e.leads.LeadLibre)).data).toEqual([{ nota: "Le va bien, pide plantilla" }]);
    await falla(anotarSeguimiento(e.leads.LeadLibre, "", "20/10/2026"), /no válida/);
    await ok(anotarSeguimiento(e.leads.LeadLibre, "", ""));
    expect((await ficha(e.leads.LeadLibre))!.proximo_contacto).toBeNull();
    // El estado que tenía no se pierde al guardar otra cosa
    expect((await ficha(e.leads.LeadLibre))!.estado).toBe("pausado");
  });

  it("onboarding: marcar y desmarcar pasos del proyecto (no de otro)", async () => {
    como(e, e.p.ceo);
    await ok(guardarPasoOnboarding(null, "Bienvenida enviada"));
    await falla(guardarPasoOnboarding(null, "Bienvenida enviada"), /Ya hay un paso/);
    const { data: paso } = await db.from("pasos_onboarding").select("id").eq("proyecto_id", e.proyecto.id).single();
    await ok(marcarPasoOnboarding(e.leads.LeadLibre, paso!.id, true));
    expect(Object.keys((await ficha(e.leads.LeadLibre))!.onboarding)).toEqual([paso!.id]);
    await ok(marcarPasoOnboarding(e.leads.LeadLibre, paso!.id, false));
    expect((await ficha(e.leads.LeadLibre))!.onboarding).toEqual({});
    await falla(marcarPasoOnboarding(e.leads.LeadLibre, "00000000-0000-0000-0000-000000000000", true), /no existe/);
  });

  it("caso de éxito: resultado obligatorio y enlace solo https", async () => {
    como(e, e.p.ceo);
    await falla(guardarCasoExito(e.leads.LeadLibre, { caso: true, resultado: " ", enlace: "", fecha: "" }), /resultado/);
    await falla(guardarCasoExito(e.leads.LeadLibre, { caso: true, resultado: "3 clientes", enlace: "javascript:alert(1)", fecha: "" }), /https/);
    await ok(guardarCasoExito(e.leads.LeadLibre, { caso: true, resultado: "3 clientes en un mes", enlace: "https://youtu.be/abc", fecha: "2026-10-09" }));
    expect(await ficha(e.leads.LeadLibre)).toMatchObject({ caso_exito: true, caso_resultado: "3 clientes en un mes", caso_enlace: "https://youtu.be/abc", caso_fecha: "2026-10-09" });
  });

  it("«Nuevo cliente» crea el lead con su venta y plazo; si ya existe por email, no lo duplica; si la venta falla, no deja el lead", async () => {
    como(e, e.p.ceo);
    await falla(nuevoCliente(venta({ nombre: "Sin contacto" })), /email o el teléfono/);
    await ok(nuevoCliente(venta({ nombre: "Marta", apellido: "Nueva", email: "MARTA@nueva.test", telefono: "+34 600 111 222" })));
    const { data: marta } = await db.from("leads").select("id, origen").eq("proyecto_id", e.proyecto.id).eq("email", "marta@nueva.test").single();
    expect(marta!.origen).toBe("manual");
    const { data: v } = await db.from("ventas").select("id, facturacion").eq("lead_id", marta!.id).single();
    expect(Number(v!.facturacion)).toBe(1997);
    expect((await db.from("vencimientos").select("importe").eq("venta_id", v!.id)).data!.map((x) => Number(x.importe))).toEqual([1000]);
    // Mismo teléfono sin el prefijo del país → misma persona (últimas 9 cifras, V2-12)
    // Otra compra suya (otro producto): la misma venta repetida en menos de 1 min sería un doble clic (S5-4, Fase 2)
    await ok(nuevoCliente(venta({ nombre: "Marta", telefono: "600 111 222", producto: e.productos["Low ticket"], facturacion: "47", cash: "47", tipo_pago: "completo" })));
    expect((await db.from("leads").select("id").eq("proyecto_id", e.proyecto.id).eq("nombre", "Marta")).data).toHaveLength(1);
    expect((await db.from("ventas").select("id").eq("lead_id", marta!.id)).data).toHaveLength(2);
    // Venta mal hecha (cobrado > facturación): error y sin lead suelto
    await falla(nuevoCliente(venta({ nombre: "Pedro", email: "pedro@x.test", cash: "5000" })), /cash collected/);
    expect((await db.from("leads").select("id").eq("proyecto_id", e.proyecto.id).eq("email", "pedro@x.test")).data).toHaveLength(0);
  });
});
