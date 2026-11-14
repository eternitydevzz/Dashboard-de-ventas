import { describe, expect, it } from "vitest";
import { calcularFunnel, calcularVendedores, type Base } from "@/lib/metricas";
import { rangoDe } from "@/lib/formato";
import type { Perfil } from "@/lib/tipos";

const NY = "America/New_York";
const persona = (id: string, rol: Perfil["rol"]): Perfil => ({ id, nombre: id, email: `${id}@t`, rol, telefono: null, whatsapp: null, admin_activo: false, onboarding_completo: true, activo: true });
const caller = persona("carla", "caller");
const closer = persona("ana", "closer");

// Octubre de 2026 en Nueva York
const octubre = rangoDe("rango", NY, "2026-10-01", "2026-10-31");

function base(): Base {
  return {
    gente: [caller, closer],
    leads: [
      { id: "l1", creado_en: "2026-10-02T15:00:00Z", caller_id: "carla", closer_id: "ana" },
      { id: "l2", creado_en: "2026-10-03T15:00:00Z", caller_id: "carla", closer_id: null },
      { id: "l3", creado_en: "2026-10-04T15:00:00Z", caller_id: null, closer_id: null },
      { id: "l4", creado_en: "2026-10-05T15:00:00Z", caller_id: null, closer_id: null },
      { id: "fuera", creado_en: "2026-09-20T15:00:00Z", caller_id: null, closer_id: null },
    ],
    citas: [
      // Cita reagendada: NO debe contar
      { id: "c0", lead_id: "l1", closer_id: "ana", agendada_por: "carla", fecha: "2026-10-05T14:00:00Z", estado: "reagendada", creado_en: "2026-10-02T16:00:00Z" },
      { id: "c1", lead_id: "l1", closer_id: "ana", agendada_por: "carla", fecha: "2026-10-06T14:00:00Z", estado: "cerrada", creado_en: "2026-10-04T16:00:00Z" },
      { id: "c2", lead_id: "l2", closer_id: "ana", agendada_por: "carla", fecha: "2026-10-07T14:00:00Z", estado: "no_show", creado_en: "2026-10-04T17:00:00Z" },
    ],
    ventas: [
      { id: "v1", lead_id: "l1", vendedor_id: "ana", facturacion: 1997, cash_collected: 500, fecha: "2026-10-06T15:00:00Z", producto_id: "grupal" },
      { id: "v2", lead_id: "l2", vendedor_id: "carla", facturacion: 47, cash_collected: 47, fecha: "2026-10-08T15:00:00Z", producto_id: "low" },
    ],
    actividades: [
      { lead_id: "l1", perfil_id: "carla", tipo: "llamada", resultado: "no_contesta", creado_en: "2026-10-03T16:00:00Z" },
      { lead_id: "l1", perfil_id: "carla", tipo: "llamada", resultado: "contestado", creado_en: "2026-10-03T17:00:00Z" },
      { lead_id: "l2", perfil_id: "carla", tipo: "whatsapp", resultado: null, creado_en: "2026-10-03T18:00:00Z" },
    ],
    // Cuota cobrada en octubre de la venta v1
    pagos: [{ importe: 300, fecha: "2026-10-20T15:00:00Z", venta_id: "v1" }],
  };
}

describe("calcularFunnel", () => {
  it("cuenta leads, agendas (sin la reagendada), ventas, facturación y cash", () => {
    const m = calcularFunnel(base(), octubre, null, NY);
    expect(m.totalLeads).toBe(4); // «fuera» es de septiembre
    expect(m.agendados).toBe(2); // c0 reagendada no cuenta
    expect(m.ventas).toBe(2);
    expect(m.facturacion).toBe(2044);
    expect(m.cash).toBe(500 + 47 + 300); // incluye la cuota cobrada
    expect(m.noShow).toBe(1);
    expect(m.llamadasCaller).toBe(2);
    expect(m.citasHechas).toBe(1);
  });
  it("el filtro por producto solo cambia ventas, facturación y cash", () => {
    const m = calcularFunnel(base(), octubre, null, NY, "grupal");
    expect(m.ventas).toBe(1);
    expect(m.facturacion).toBe(1997);
    expect(m.cash).toBe(800);
    expect(m.totalLeads).toBe(4);
  });
  it("arreglo 5: el cash resta las devoluciones del periodo (como Finanzas); la facturación no cambia", () => {
    const b = base();
    b.ventas[0] = { ...b.ventas[0], devuelto: 200, devuelto_en: "2026-10-25T15:00:00Z" };
    b.ventas[1] = { ...b.ventas[1], devuelto: 47, devuelto_en: "2026-11-02T15:00:00Z" }; // devuelta en noviembre: no resta en octubre
    const m = calcularFunnel(b, octubre, null, NY);
    expect(m.cash).toBe(500 + 47 + 300 - 200);
    expect(m.facturacion).toBe(2044);
    expect(calcularFunnel(b, octubre, null, NY, "low").cash).toBe(47); // con filtro de producto, solo las suyas
    expect(calcularFunnel(b, rangoDe("rango", NY, "2026-11-01", "2026-11-30"), null, NY).cash).toBe(-47); // el mes de la devolución
  });
  it("arreglo 6: Agendado → Venta = de las personas que agendaron en el periodo, cuántas compraron desde ese día", () => {
    const b = base();
    // l3: agenda el 10 oct a las 15:00 y compra ese día con fecha puesta a mano (12:00) → cuenta
    b.citas.push({ id: "c3", lead_id: "l3", closer_id: "ana", agendada_por: "carla", fecha: "2026-10-12T14:00:00Z", estado: "pendiente", creado_en: "2026-10-10T19:00:00Z" });
    b.ventas.push({ id: "v3", lead_id: "l3", vendedor_id: "ana", facturacion: 1997, cash_collected: 0, fecha: "2026-10-10T16:00:00Z", producto_id: "grupal" });
    // l4: agenda en octubre y compra en noviembre → cuenta para octubre
    b.citas.push({ id: "c4", lead_id: "l4", closer_id: "ana", agendada_por: "carla", fecha: "2026-10-30T14:00:00Z", estado: "seguimiento", creado_en: "2026-10-28T16:00:00Z" });
    b.ventas.push({ id: "v4", lead_id: "l4", vendedor_id: "ana", facturacion: 4997, cash_collected: 0, fecha: "2026-11-03T16:00:00Z", producto_id: "vip" });
    // «fuera»: compra sin ninguna cita («Nuevo cliente») → no cuenta
    b.ventas.push({ id: "v5", lead_id: "fuera", vendedor_id: "ana", facturacion: 1000, cash_collected: 1000, fecha: "2026-10-15T16:00:00Z", producto_id: "grupal" });
    // l2 compró el low ticket ANTES de agendar → esa compra no cuenta
    b.ventas[1] = { ...b.ventas[1], fecha: "2026-10-03T15:00:00Z" };
    const m = calcularFunnel(b, octubre, null, NY);
    expect(m.tasas.agendadoVenta).toBe(75); // l1, l3 y l4 de 4 personas (l1, l2, l3, l4)
    expect(calcularFunnel(b, octubre, null, NY, "vip").tasas.agendadoVenta).toBe(25); // solo l4 compró el VIP
    // Vista del caller: cuentan sus agendas aunque la venta la cierre el closer
    expect(calcularFunnel(b, octubre, caller, NY).tasas.agendadoVenta).toBe(75);
    // Antes salía 100 % o más: nunca pasa del 100 %
    expect(calcularFunnel(base(), octubre, null, NY).tasas.agendadoVenta).toBeLessThanOrEqual(100);
  });
  it("el filtro por vendedor", () => {
    const m = calcularFunnel(base(), octubre, caller, NY);
    expect(m.totalLeads).toBe(2);
    expect(m.ventas).toBe(1);
    expect(m.facturacion).toBe(47);
  });
  it("media lead → venta en días", () => {
    // l1: 2 oct 15:00 → 6 oct 15:00 = 4 días; l2: 3 oct → 8 oct = 5 días
    expect(calcularFunnel(base(), octubre, null, NY).mediaDias).toBe(4.5);
  });
  it("la serie diaria suma lo mismo que los totales", () => {
    const m = calcularFunnel(base(), octubre, null, NY);
    expect(m.serie.leads.reduce((s, p) => s + p.valor, 0)).toBe(4);
    expect(m.serie.facturacion.reduce((s, p) => s + p.valor, 0)).toBe(2044);
  });
});

describe("calcularVendedores", () => {
  it("callers: agendas sin contar reagendadas; closers: % de cierre sobre asistidas", () => {
    const v = calcularVendedores(base(), octubre);
    const carla = v.callers.find((c) => c.perfil.id === "carla")!;
    expect(carla.llamadas).toBe(2);
    expect(carla.contactos).toBe(2); // 14 nov: contactado = llamada (l1 y el WhatsApp a l2); antes 1, solo los que avanzan
    expect(carla.agendas).toBe(2);
    expect(carla.ventas).toBe(1);
    const ana = v.closers.find((c) => c.perfil.id === "ana")!;
    expect(ana.asistidas).toBe(1);
    expect(ana.noShow).toBe(1);
    expect(ana.tasaCierre).toBe(100);
  });
  it("arreglo 7: el cash del closer en el Ranking cuenta cuotas y resta devoluciones, igual que el Funnel", () => {
    const b = base();
    b.ventas[0] = { ...b.ventas[0], devuelto: 100, devuelto_en: "2026-10-28T15:00:00Z" };
    const ana = calcularVendedores(b, octubre).closers.find((c) => c.perfil.id === "ana")!;
    expect(ana.cash).toBe(500 + 300 - 100); // al vender + cuota de octubre − devolución
    expect(ana.cash).toBe(calcularFunnel(b, octubre, null, NY, "grupal").cash); // misma cifra que el Funnel de su venta
    // Una cuota de octubre de una venta de septiembre también cuenta en octubre
    b.ventas.push({ id: "vs", lead_id: "l3", vendedor_id: "ana", facturacion: 1000, cash_collected: 200, fecha: "2026-09-10T15:00:00Z", producto_id: "grupal" });
    b.pagos.push({ importe: 250, fecha: "2026-10-12T15:00:00Z", venta_id: "vs" });
    expect(calcularVendedores(b, octubre).closers.find((c) => c.perfil.id === "ana")!.cash).toBe(500 + 300 - 100 + 250);
  });
});
