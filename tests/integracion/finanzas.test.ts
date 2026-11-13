// V2-6: Finanzas contra la base local: permisos, plazos al vender, gastos, cuentas, banco, deudores y liquidaciones.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agendaPorLink, borrarEscenario, como, crearEscenario, db, falla, formulario, ok, type Escenario } from "../apoyo/escenario";
import { registrarVenta } from "@/app/(panel)/leads/acciones";
import { registrarCobro } from "@/app/(panel)/ventas/acciones";
import { guardarComisionRol } from "@/app/(panel)/equipo/acciones";
import { asegurarFinanzas } from "@/lib/finanzas-datos";
import { cargarEquipo } from "@/lib/equipo";
import { hoyEnZona } from "@/lib/formato";
import {
  calcularLiquidaciones,
  conciliarMovimiento,
  crearMovimiento,
  desmarcarLiquidacion,
  guardarCuenta,
  importarMovimientos,
  marcarVencimiento,
  nuevoDeudor,
  pagarLiquidacion,
  transferir,
  borrarMovimiento,
} from "@/app/(panel)/finanzas/acciones";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
  await asegurarFinanzas(e.proyecto.id);
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});
const cuentas = async () => (await db.from("cuentas").select("*").eq("proyecto_id", e.proyecto.id).order("creado_en")).data!;
const movs = async () => (await db.from("movimientos").select("*").eq("proyecto_id", e.proyecto.id).order("creado_en")).data!;
const cat = async (nombre: string) => (await db.from("categorias_finanzas").select("id").eq("proyecto_id", e.proyecto.id).eq("nombre", nombre).single()).data!.id;

describe("Finanzas", () => {
  it("preparar Finanzas 4 veces a la vez deja una sola cuenta por defecto y sin categorías repetidas", async () => {
    await db.from("cuentas").delete().eq("proyecto_id", e.proyecto.id);
    await db.from("categorias_finanzas").delete().eq("proyecto_id", e.proyecto.id);
    await Promise.all([1, 2, 3, 4].map(() => asegurarFinanzas(e.proyecto.id)));
    expect((await cuentas()).filter((c) => c.por_defecto)).toHaveLength(1);
    expect((await db.from("categorias_finanzas").select("id").eq("proyecto_id", e.proyecto.id)).data).toHaveLength(6);
  });

  it("solo con la sección «finanzas»: el director no entra por defecto", async () => {
    como(e, e.p.director);
    await falla(crearMovimiento({ tipo: "egreso", importe: "10", fecha: "", categoria_id: null, cuenta_id: null, descripcion: "" }), /No tienes acceso/);
  });

  it("una venta de «4.600» con «1.000» cobrados se guarda como 4600 y 1000", async () => {
    como(e, e.p.ceo);
    await ok(registrarVenta(e.leads.LeadLibre, formulario({ producto: e.productos["Mentoría grupal"], facturacion: "4.600", cash: "1.000", tipo_pago: "reserva", metodo: "stripe" })));
    const { data: v } = await db.from("ventas").select("facturacion, cash_collected").eq("lead_id", e.leads.LeadLibre).single();
    expect([Number(v!.facturacion), Number(v!.cash_collected)]).toEqual([4600, 1000]);
  });

  it("vender en cuotas crea los plazos que faltan (uno al mes, cuadran al céntimo)", async () => {
    como(e, e.p.ceo);
    await ok(registrarVenta(e.leads.LeadB, formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1997", cash: "497", tipo_pago: "cuotas", num_cuotas: "4", metodo: "stripe", vendedor: e.p.closerB.id })));
    const { data: v } = await db.from("ventas").select("id").eq("lead_id", e.leads.LeadB).single();
    const { data: plazos } = await db.from("vencimientos").select("numero, importe").eq("venta_id", v!.id).order("numero");
    expect(plazos!.map((p) => [p.numero, Number(p.importe)])).toEqual([[2, 500], [3, 500], [4, 500]]);
    // Un plazo de venta no se marca «cobrado» a mano: se cobra con «Cobro»
    const { data: uno } = await db.from("vencimientos").select("id").eq("venta_id", v!.id).limit(1).single();
    await falla(marcarVencimiento(uno!.id, "pagado"), /registrando el cobro/);
  });

  it("gastos e ingresos: importe y categoría validados; un dato de otro proyecto no se acepta", async () => {
    como(e, e.p.ceo);
    await falla(crearMovimiento({ tipo: "egreso", importe: "0", fecha: "", categoria_id: null, cuenta_id: null, descripcion: "" }), /mayor que 0/);
    await falla(crearMovimiento({ tipo: "egreso", importe: "10", fecha: "", categoria_id: "00000000-0000-0000-0000-000000000000", cuenta_id: null, descripcion: "" }), /no es de este proyecto/);
    await ok(crearMovimiento({ tipo: "egreso", importe: "120,50", fecha: "2026-10-05", categoria_id: await cat("Publicidad"), cuenta_id: null, descripcion: "Meta" }));
    const m = (await movs()).find((x) => x.descripcion === "Meta")!;
    expect(Number(m.importe)).toBe(120.5);
    // Importes como en España (fallo arreglado en V2-12): «1.250,75» = 1250,75
    await ok(crearMovimiento({ tipo: "egreso", importe: "1.250,75", fecha: "2026-10-05", categoria_id: null, cuenta_id: null, descripcion: "Miles" }));
    expect(Number((await movs()).find((x) => x.descripcion === "Miles")!.importe)).toBe(1250.75);
    expect(m).toMatchObject({ tipo: "egreso", conciliado: true, origen: "manual" });
  });

  it("cuentas: un método solo puede ir a una cuenta; transferir exige dos cuentas distintas", async () => {
    como(e, e.p.ceo);
    await ok(guardarCuenta(null, "Banco", ["transferencia"]));
    await falla(guardarCuenta(null, "Otra", ["transferencia"]), /ya va a la cuenta «Banco»/);
    const [todo, banco] = await cuentas();
    expect(todo).toMatchObject({ nombre: "Todo", por_defecto: true });
    await falla(transferir(banco.id, banco.id, "50", "", ""), /dos cuentas distintas/);
    await ok(transferir(todo.id, banco.id, "50", "", "Paso a banco"));
    expect((await movs()).find((x) => x.tipo === "transferencia")).toMatchObject({ cuenta_id: todo.id, cuenta_destino_id: banco.id });
  });

  it("importar el CSV del banco: los gastos en negativo, fallos explicados, todo «sin conciliar»; conciliar le da categoría", async () => {
    como(e, e.p.ceo);
    const csv = "Fecha;Descripción;Importe\n2026-10-02;Stripe payout;1000\n03/10/2026;Zoom;-15,99\nmal;X;3\n";
    const r = (await ok(importarMovimientos(csv, null))) as { importados: number; fallos: string[] };
    expect(r.importados).toBe(2);
    expect(r.fallos).toEqual(["Fila 4: fecha o importe no válidos"]);
    const zoom = (await movs()).find((x) => x.descripcion === "Zoom")!;
    expect(zoom).toMatchObject({ tipo: "egreso", conciliado: false, origen: "importado" });
    expect(Number(zoom.importe)).toBe(15.99);
    await ok(conciliarMovimiento(zoom.id, await cat("Herramientas")));
    expect((await db.from("movimientos").select("conciliado, categoria_id").eq("id", zoom.id).single()).data).toEqual({ conciliado: true, categoria_id: await cat("Herramientas") });
  });

  it("deudor puesto a mano: al marcarlo cobrado entra como ingreso", async () => {
    como(e, e.p.ceo);
    await falla(nuevoDeudor(" ", "100", "2026-11-01"), /Quién debe/);
    await ok(nuevoDeudor("Empresa X", "300", "2026-11-01"));
    const { data: v } = await db.from("vencimientos").select("id").eq("proyecto_id", e.proyecto.id).eq("nombre", "Empresa X").single();
    await ok(marcarVencimiento(v!.id, "pagado"));
    expect((await movs()).find((x) => x.descripcion === "Cobro de Empresa X")).toMatchObject({ tipo: "ingreso" });
  });
  it("arreglo 33: un deudor marcado «cobrado» por error se deshace y su ingreso se borra (no cuenta dos veces)", async () => {
    como(e, e.p.ceo);
    const { data: v } = await db.from("vencimientos").select("id, movimiento_id").eq("proyecto_id", e.proyecto.id).eq("nombre", "Empresa X").single();
    expect(v!.movimiento_id).toBeTruthy();
    await ok(marcarVencimiento(v!.id, "pendiente"));
    expect((await db.from("vencimientos").select("estado, pagado_en, movimiento_id").eq("id", v!.id).single()).data).toEqual({ estado: "pendiente", pagado_en: null, movimiento_id: null });
    expect((await movs()).filter((x) => x.descripcion === "Cobro de Empresa X")).toHaveLength(0);
    // Volver a cobrarlo crea un ingreso, uno solo
    await ok(marcarVencimiento(v!.id, "pagado"));
    expect((await movs()).filter((x) => x.descripcion === "Cobro de Empresa X")).toHaveLength(1);
  });

  it("liquidaciones: closer % sobre lo cobrado del mes y caller % de la agenda que cerró; pagar crea el gasto y desmarcar lo quita", async () => {
    como(e, e.p.ceo);
    await ok(guardarComisionRol("closer", "10", ""));
    await ok(guardarComisionRol("caller", "0", "3"));
    // Bloque 4: este test es el de «su % propio» (los tramos, en comisiones-tramos.test.ts)
    await cargarEquipo(e.proyecto.id);
    await db.from("miembros_equipo").update({ comision_modo: "propio" }).eq("proyecto_id", e.proyecto.id).in("perfil_id", [e.p.closerA.id, e.p.closerB.id, e.p.callerA.id]);
    await agendaPorLink(e, e.leads.LeadA, e.p.callerA, e.p.closerA.id, new Date(Date.now() + 3600_000).toISOString().slice(0, 16), 4);
    como(e, e.p.closerA);
    await ok(registrarVenta(e.leads.LeadA, formulario({ producto: e.productos["Mentoría grupal"], facturacion: "2000", cash: "1000", tipo_pago: "reserva", metodo: "stripe", desde_cita: "1", estrellas: "5" })));
    const { data: venta } = await db.from("ventas").select("id").eq("lead_id", e.leads.LeadA).single();
    await ok(registrarCobro(venta!.id, "500", "stripe"));

    como(e, e.p.ceo);
    const mes = hoyEnZona(e.proyecto.zona_horaria).slice(0, 7);
    await ok(calcularLiquidaciones(mes));
    const liq = async (perfil: string) => (await db.from("liquidaciones").select("*").eq("proyecto_id", e.proyecto.id).eq("mes", mes).eq("perfil_id", perfil).maybeSingle()).data;
    // closerA: 10 % de 2000 facturado = 200; de 1500 cobrado = 150 (se paga esto)
    expect(await liq(e.p.closerA.id)).toMatchObject({ comision_facturado: 200, comision_cobrado: 150, estado: "pendiente" });
    // callerA agendó la cita que cerró el closer: 3 % de 1500 = 45
    expect(await liq(e.p.callerA.id)).toMatchObject({ comision_cobrado: 45 });
    // closerB vendió en cuotas (497 cobrados) con 10 %
    expect(await liq(e.p.closerB.id)).toMatchObject({ comision_cobrado: 49.7 });

    const l = (await liq(e.p.closerA.id))!;
    await ok(pagarLiquidacion(l.id, null));
    const pagada = (await liq(e.p.closerA.id))!;
    expect(pagada.estado).toBe("pagada");
    const gasto = (await db.from("movimientos").select("*").eq("id", pagada.movimiento_id).single()).data!;
    expect(gasto).toMatchObject({ tipo: "egreso", origen: "liquidacion", categoria_id: await cat("Comisiones") });
    expect(Number(gasto.importe)).toBe(150);
    await falla(borrarMovimiento(gasto.id), /desmárcala/);
    // Recalcular no toca la pagada
    await ok(calcularLiquidaciones(mes));
    expect((await liq(e.p.closerA.id))!.estado).toBe("pagada");
    await ok(desmarcarLiquidacion(l.id));
    expect((await liq(e.p.closerA.id))!.estado).toBe("pendiente");
    expect((await db.from("movimientos").select("id").eq("id", gasto.id)).data).toHaveLength(0);
    // Ola 6: desmarcar otra vez (doble clic) avisa y no toca nada
    await falla(desmarcarLiquidacion(l.id), /Ya no está pagada/);
  });

  it("Ola 6 (C2): recalcular no pisa una pagada aunque no esté en la lista de «ya pagadas» (pagada mientras se calcula)", async () => {
    como(e, e.p.ceo);
    const mes = hoyEnZona(e.proyecto.zona_horaria).slice(0, 7);
    await ok(calcularLiquidaciones(mes));
    const { data: l } = await db.from("liquidaciones").select("id").eq("proyecto_id", e.proyecto.id).eq("mes", mes).eq("perfil_id", e.p.closerB.id).single();
    await ok(pagarLiquidacion(l!.id, null));
    // Simula la carrera: la lectura de pagadas ya pasó; se llama al guardado como lo hace calcularLiquidaciones
    await db.from("liquidaciones").upsert([{ proyecto_id: e.proyecto.id, perfil_id: e.p.closerB.id, mes, comision_cobrado: 1, estado: "pendiente" }], { onConflict: "proyecto_id,perfil_id,mes", ignoreDuplicates: true });
    await db.from("liquidaciones").update({ comision_cobrado: 1, estado: "pendiente" }).eq("proyecto_id", e.proyecto.id).eq("perfil_id", e.p.closerB.id).eq("mes", mes).eq("estado", "pendiente");
    const { data: sigue } = await db.from("liquidaciones").select("estado, comision_cobrado").eq("id", l!.id).single();
    expect(sigue).toMatchObject({ estado: "pagada", comision_cobrado: 49.7 });
  });

  it("D43: recalcular_liquidaciones (un paso, con candado): mismas cifras, 2 a la vez no se pisan y la pagada no vuelve a pendiente", async () => {
    como(e, e.p.ceo);
    const mes = hoyEnZona(e.proyecto.zona_horaria).slice(0, 7);
    const foto = async () =>
      ((await db.from("liquidaciones").select("perfil_id, estado, base_facturado, base_cobrado, comision_facturado, comision_cobrado, tramo, detalle").eq("proyecto_id", e.proyecto.id).eq("mes", mes).order("perfil_id")).data ?? []).map((x) => ({ ...x, comision_cobrado: Number(x.comision_cobrado) }));
    await ok(calcularLiquidaciones(mes));
    const antes = await foto();
    expect(antes.find((x) => x.perfil_id === e.p.closerB.id)).toMatchObject({ estado: "pagada", comision_cobrado: 49.7 }); // la del test anterior
    expect(antes.find((x) => x.perfil_id === e.p.closerA.id)).toMatchObject({ comision_facturado: 200, comision_cobrado: 150 }); // las cifras de siempre
    const [r1, r2] = await Promise.all([calcularLiquidaciones(mes), calcularLiquidaciones(mes)]);
    expect(r1).toEqual(r2);
    expect(await foto()).toEqual(antes);
    // Llamada directa: la pagada no se pisa aunque venga en la lista; la pendiente de quien ya no sale se borra
    const { data: pagadas, error } = await db.rpc("recalcular_liquidaciones", {
      p_proyecto: e.proyecto.id,
      p_mes: mes,
      p_filas: [{ perfil_id: e.p.closerB.id, base_facturado: 1, base_cobrado: 1, comision_facturado: 1, comision_cobrado: 1, detalle: [] }],
    });
    expect(error).toBeNull();
    expect(pagadas).toEqual([e.p.closerB.id]);
    const despues = await foto();
    expect(despues.filter((x) => x.estado === "pendiente")).toHaveLength(0);
    expect(despues.find((x) => x.perfil_id === e.p.closerB.id)).toMatchObject({ estado: "pagada", comision_cobrado: 49.7 });
    await ok(calcularLiquidaciones(mes)); // las deja como estaban
    expect(await foto()).toEqual(antes);
  });

  it("D43: cambiar_forma_pago no cambia nada si los plazos que se quedan ya no son los que leyó la app", async () => {
    const { data: v } = await db.from("ventas").select("id, facturacion").eq("proyecto_id", e.proyecto.id).eq("lead_id", e.leads.LeadA).single();
    const plazos = async () => (await db.from("vencimientos").select("id, estado, numero, importe").eq("venta_id", v!.id).order("numero")).data ?? [];
    const antes = await plazos();
    const fijos = antes.filter((x) => x.estado !== "pendiente").map((x) => x.id);
    const { error } = await db.rpc("cambiar_forma_pago", { p_proyecto: e.proyecto.id, p_venta: v!.id, p_tipo: "reserva", p_num_cuotas: null, p_plazos: [{ numero: 99, importe: 1, vence_el: "2030-01-01" }], p_fijos: [...fijos, crypto.randomUUID()] });
    expect(error?.message).toMatch(/plazos_cambiados/);
    expect(await plazos()).toEqual(antes);
  });
});
