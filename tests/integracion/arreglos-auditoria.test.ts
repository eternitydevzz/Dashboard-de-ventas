// Arreglos 8 a 36 de la auditoría (Arreglar-dashboard.md, 10 oct 2026): un test por arreglo que toca la base.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agendaPorLink, borrarEscenario, como, crearEscenario, db, falla, formulario, ok, type Escenario } from "../apoyo/escenario";
import { agendarCita, anadirNota, registrarLlamada, registrarVenta } from "@/app/(panel)/leads/acciones";
import { guardarPrograma, type DatosPrograma } from "@/app/(panel)/programas/acciones";
import { asignarLeads, crearLeadManual } from "@/app/(panel)/crm/acciones";
import { cambiarEstadoCita, reagendarCita } from "@/app/(panel)/closer/acciones";
import { enviarReporte } from "@/app/(panel)/reportes/acciones";
import { getSesion } from "@/lib/sesion";
import { calcularLiquidaciones } from "@/app/(panel)/finanzas/acciones";
import { borrarVenta, registrarCobro } from "@/app/(panel)/ventas/acciones";
import { actualizarMiembro, quitarDelProyecto } from "@/app/(panel)/admin/acciones";
import { guardarComisionRol } from "@/app/(panel)/equipo/acciones";
import { cargarEquipo } from "@/lib/equipo";
import { cargarBase, calcularVendedores } from "@/lib/metricas";
import { hoyEnZona, rangoDe } from "@/lib/formato";
import { guardarLeads, repartoAutomatico } from "@/lib/leads";
import type { LeadEntrada } from "@/lib/csv";
import type { Proyecto } from "@/lib/tipos";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});
const lead = async (id: string) => (await db.from("leads").select("*").eq("id", id).single()).data!;
const citaDe = async (leadId: string) => (await db.from("citas").select("*").eq("lead_id", leadId).order("creado_en", { ascending: false }).limit(1).single()).data!;
const nuevoLead = async (nombre: string, extra: Record<string, unknown> = {}) =>
  (await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre, email: `${e.pref}-${nombre.toLowerCase()}@x.test`, ...extra }).select("id").single()).data!.id as string;

describe("Arreglo 8: venta con la cita en «confirmación pendiente»", () => {
  it("la cita pasa a «cerrada», la venta es del closer de la cita y se guardan sus estrellas", async () => {
    const l = await nuevoLead("Arreglo8", { caller_id: e.p.callerA.id });
    await agendaPorLink(e, l, e.p.callerA, e.p.closerB.id, "2026-10-21T10:00", 4);
    await db.from("citas").update({ estado: "confirmacion_pendiente" }).eq("lead_id", l);
    como(e, e.p.ceo);
    await ok(registrarVenta(l, formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1997", cash: "1997", tipo_pago: "completo", metodo: "stripe", desde_cita: "1", estrellas: "5" })));
    expect(await citaDe(l)).toMatchObject({ estado: "cerrada", estrellas_closer: 5 });
    expect((await db.from("ventas").select("vendedor_id").eq("lead_id", l).single()).data!.vendedor_id).toBe(e.p.closerB.id);
  });
});

describe("Arreglo 9: agendar como jefe o closer no borra las estrellas del caller", () => {
  it("sin estrellas se quedan las del caller; con estrellas, se cambian", async () => {
    const l = await nuevoLead("Arreglo9", { caller_id: e.p.callerA.id });
    como(e, e.p.callerA);
    await ok(registrarLlamada(l, "llamar_luego", "", 4));
    como(e, e.p.director);
    await ok(agendarCita(l, e.p.closerA.id, "2026-10-22T10:00", ""));
    expect((await lead(l)).estrellas_caller).toBe(4);
    await ok(agendarCita(l, e.p.closerA.id, "2026-10-23T10:00", "", 2));
    expect((await lead(l)).estrellas_caller).toBe(2);
  });
});

describe("Arreglos 10 y 11: quien se va a mitad de mes", () => {
  it("cobra la comisión de ese mes y sigue en el Ranking como «(baja)», aunque se desactive y se quite del proyecto", async () => {
    await cargarEquipo(e.proyecto.id);
    await db.from("miembros_equipo").update({ comision_modo: "propio" }).eq("proyecto_id", e.proyecto.id).eq("perfil_id", e.p.closerA.id); // bloque 4: con su % propio
    como(e, e.p.ceo);
    await ok(guardarComisionRol("closer", "10", ""));
    const l = await nuevoLead("Arreglo10");
    await ok(registrarVenta(l, formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1000", cash: "1000", tipo_pago: "completo", metodo: "stripe", vendedor: e.p.closerA.id })));
    // Se va: desactivado y quitado del proyecto
    await db.from("perfiles").update({ activo: false }).eq("id", e.p.closerA.id);
    await db.from("miembros_proyecto").delete().eq("proyecto_id", e.proyecto.id).eq("perfil_id", e.p.closerA.id);
    try {
      const mes = hoyEnZona(e.proyecto.zona_horaria).slice(0, 7);
      await ok(calcularLiquidaciones(mes));
      const { data: liq } = await db.from("liquidaciones").select("comision_cobrado").eq("proyecto_id", e.proyecto.id).eq("perfil_id", e.p.closerA.id).eq("mes", mes).single();
      expect(Number(liq!.comision_cobrado)).toBe(100);
      const base = await cargarBase(e.proyecto);
      const hoy = hoyEnZona(e.proyecto.zona_horaria);
      const fila = calcularVendedores(base, rangoDe("rango", e.proyecto.zona_horaria, `${mes}-01`, hoy)).closers.find((c) => c.perfil.id === e.p.closerA.id);
      expect(fila?.perfil.nombre).toMatch(/\(baja\)$/);
      expect(fila?.cash).toBe(1000);
      // En un periodo sin actividad suya, no sale
      expect(calcularVendedores(base, rangoDe("rango", e.proyecto.zona_horaria, "2020-01-01", "2020-01-31")).closers.some((c) => c.perfil.id === e.p.closerA.id)).toBe(false);
    } finally {
      await db.from("perfiles").update({ activo: true }).eq("id", e.p.closerA.id);
      await db.from("miembros_proyecto").insert({ proyecto_id: e.proyecto.id, perfil_id: e.p.closerA.id, orden: 9 });
    }
  });
});

describe("Arreglo 13: fecha real del cobro", () => {
  it("se guarda la fecha elegida (a las 12:00 del proyecto); sin fecha, ahora; ni futura ni anterior a la venta", async () => {
    como(e, e.p.ceo);
    const l = await nuevoLead("Arreglo13");
    await ok(registrarVenta(l, formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1000", cash: "100", tipo_pago: "reserva", metodo: "stripe", fecha: "2026-09-01" })));
    const { data: v } = await db.from("ventas").select("id").eq("lead_id", l).single();
    await ok(registrarCobro(v!.id, "200", "transferencia", "2026-09-15"));
    const { data: p1 } = await db.from("pagos").select("fecha").eq("venta_id", v!.id).single();
    expect(new Date(p1!.fecha).toISOString()).toBe("2026-09-15T16:00:00.000Z"); // 12:00 en Nueva York
    await falla(registrarCobro(v!.id, "10", "stripe", "2099-01-01"), /futura/);
    await falla(registrarCobro(v!.id, "10", "stripe", "2026-08-31"), /anterior a la venta/);
    await falla(registrarCobro(v!.id, "10", "bitcoin"), /método/);
    const antes = Date.now();
    await ok(registrarCobro(v!.id, "50", "stripe"));
    const { data: ps } = await db.from("pagos").select("fecha, importe").eq("venta_id", v!.id).order("fecha", { ascending: false });
    expect(Number(ps![0].importe)).toBe(50);
    expect(new Date(ps![0].fecha).getTime()).toBeGreaterThanOrEqual(antes - 5000);
  });
});

const entrada = (x: Partial<LeadEntrada>): LeadEntrada => ({ ghl_contact_id: null, nombre: "", apellido: "", email: null, telefono: null, etiquetas: [], respuestas: [], creado_en: null, ...x });
const opcs = { pipelineId: null, origen: "ghl" as const, perfilId: null, repartir: false };

describe("Arreglo 15: con un solo lead se busca por sus claves", () => {
  it("reconoce por contacto de GHL, por email (sin mayúsculas) y, sin email, por las últimas 9 cifras del teléfono", async () => {
    const id = await nuevoLead("Arreglo15", { telefono: "+34 611 222 333", ghl_contact_id: `${e.pref}-g15` });
    expect(await guardarLeads(e.proyecto, [entrada({ telefono: "611222333", nombre: "Por tel" })], opcs)).toMatchObject({ insertados: 0, actualizados: 1 });
    expect(await guardarLeads(e.proyecto, [entrada({ email: `${e.pref}-arreglo15@x.test`.toUpperCase() })], opcs)).toMatchObject({ insertados: 0, actualizados: 1 });
    expect(await guardarLeads(e.proyecto, [entrada({ ghl_contact_id: `${e.pref}-g15` })], opcs)).toMatchObject({ insertados: 0, actualizados: 1 });
    expect((await lead(id)).nombre).toBe("Por tel");
    expect(await guardarLeads(e.proyecto, [entrada({ telefono: "+34 699 000 111" })], opcs)).toMatchObject({ insertados: 1 }); // otro teléfono: nuevo
  });
});

describe("Arreglo 16: dos envíos del mismo email a la vez", () => {
  it("los dos terminan bien y queda un solo lead", async () => {
    const email = `${e.pref}-a-la-vez@x.test`;
    const r = await Promise.all([1, 2, 3].map(() => guardarLeads(e.proyecto, [entrada({ email, nombre: "Doble" })], opcs)));
    expect(r.reduce((s, x) => s + x.insertados + x.actualizados, 0)).toBe(3);
    expect((await db.from("leads").select("id").eq("proyecto_id", e.proyecto.id).eq("email", email)).data).toHaveLength(1);
  });
});

describe("Arreglo 17 (con el reparto con % del bloque 2): leads a la vez", () => {
  it("9 leads a la vez entre 3 callers al mismo %: 3 a cada uno", async () => {
    await db.from("miembros_proyecto").update({ reparto_pct: 33.34, reparto_cuenta: 0 }).eq("proyecto_id", e.proyecto.id).in("perfil_id", [e.p.callerA.id, e.p.callerB.id, e.p.callerC.id]);
    const proyecto = { ...e.proyecto, reparto_auto: true } as Proyecto;
    const turnos = (await Promise.all(Array.from({ length: 9 }, () => repartoAutomatico(proyecto, 1)))).flat();
    const cuenta = new Map<string, number>();
    turnos.forEach((t) => cuenta.set(t!, (cuenta.get(t!) ?? 0) + 1));
    expect([...cuenta.values()]).toEqual([3, 3, 3]);
    const { data } = await db.from("miembros_proyecto").select("reparto_cuenta").eq("proyecto_id", e.proyecto.id).in("perfil_id", [e.p.callerA.id, e.p.callerB.id, e.p.callerC.id]);
    expect(data!.map((m) => m.reparto_cuenta)).toEqual([3, 3, 3]);
  });
});

describe("Arreglo 22: una escritura que falla no acaba en «Guardado»", () => {
  it("escribir() corta con el error de la base y deja pasar lo que va bien", async () => {
    const { escribir } = await import("@/lib/datos");
    await expect(escribir(db.from("leads").insert({ proyecto_id: "00000000-0000-0000-0000-000000000000", nombre: "Fantasma" }), "leads")).rejects.toThrow(/No se pudo guardar en «leads»/);
    const ok1 = await escribir(db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre: "Bien", email: `${e.pref}-bien22@x.test` }).select("id").single(), "leads");
    expect(ok1.data!.id).toBeTruthy();
  });
});

describe("Arreglos 23 y 24: Administración", () => {
  it("23: al quitar a alguien del proyecto, sus leads quedan sin asignar y se dice cuántos", async () => {
    const a = await nuevoLead("Arreglo23a", { caller_id: e.p.callerC.id });
    const b = await nuevoLead("Arreglo23b", { closer_id: e.p.callerC.id });
    como(e, e.p.directorAdmin);
    const r = await ok(quitarDelProyecto(e.p.callerC.id));
    expect(r).toEqual({ sinAsignar: 2 });
    expect((await lead(a)).caller_id).toBeNull();
    expect((await lead(b)).closer_id).toBeNull();
    await db.from("miembros_proyecto").insert({ proyecto_id: e.proyecto.id, perfil_id: e.p.callerC.id, orden: 9 });
  });
  it("24: cambiar el rol o desactivar solo lo hace el CEO (un director con Administración, no)", async () => {
    como(e, e.p.directorAdmin);
    await falla(actualizarMiembro(e.p.callerB.id, { rol: "closer" }), /Solo el CEO cambia el rol o desactiva/);
    await falla(actualizarMiembro(e.p.callerB.id, { activo: false }), /Solo el CEO cambia el rol o desactiva/);
    expect((await db.from("perfiles").select("rol, activo").eq("id", e.p.callerB.id).single()).data).toEqual({ rol: "caller", activo: true });
    como(e, e.p.ceo);
    await ok(actualizarMiembro(e.p.callerB.id, { activo: false }));
    await ok(actualizarMiembro(e.p.callerB.id, { activo: true }));
  });
});

describe("Arreglo 26: borrar una venta", () => {
  it("la cita vuelve a «seguimiento», el lead deja de estar vendido y avisa si hay comisiones calculadas", async () => {
    const l = await nuevoLead("Arreglo26", { caller_id: e.p.callerA.id });
    await agendaPorLink(e, l, e.p.callerA, e.p.closerA.id, "2026-10-21T10:00", 3);
    como(e, e.p.ceo);
    await ok(registrarVenta(l, formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1000", cash: "1000", tipo_pago: "completo", metodo: "stripe", desde_cita: "1", estrellas: "4" })));
    expect((await citaDe(l)).estado).toBe("cerrada");
    const { data: v } = await db.from("ventas").select("id, fecha").eq("lead_id", l).single();
    const mes = hoyEnZona(e.proyecto.zona_horaria).slice(0, 7);
    await ok(calcularLiquidaciones(mes));
    const r = await ok(borrarVenta(v!.id));
    expect(r.aviso).toMatch(new RegExp(`comisiones de ${mes} ya estaban calculadas`));
    expect((await citaDe(l)).estado).toBe("seguimiento");
    expect((await lead(l)).estado_caller).toBe("agendado");
    // Venta desde la ficha (sin cita): el lead vuelve a «nuevo»
    const sinCita = await nuevoLead("Arreglo26b");
    await ok(registrarVenta(sinCita, formulario({ producto: e.productos["Low ticket"], facturacion: "47", cash: "47", tipo_pago: "completo", metodo: "stripe" })));
    const { data: v2 } = await db.from("ventas").select("id").eq("lead_id", sinCita).single();
    await ok(borrarVenta(v2!.id));
    expect((await lead(sinCita)).estado_caller).toBe("nuevo");
  });
});

describe("Arreglo 29: validaciones en la app, no solo en la base", () => {
  it("venta: tipo de pago, método, vendedor del proyecto y máximo 60 cuotas; CRM: asignación y pipeline del proyecto", async () => {
    como(e, e.p.ceo);
    const l = await nuevoLead("Arreglo29");
    const venta = (x: Record<string, string>) => formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1000", cash: "100", tipo_pago: "cuotas", num_cuotas: "3", metodo: "stripe", ...x });
    await falla(registrarVenta(l, venta({ tipo_pago: "trueque" })), /cómo paga/);
    await falla(registrarVenta(l, venta({ metodo: "bitcoin" })), /método de pago/);
    await falla(registrarVenta(l, venta({ num_cuotas: "999" })), /60 cuotas/);
    await falla(registrarVenta(l, venta({ vendedor: "00000000-0000-0000-0000-000000000000" })), /no es de este proyecto/);
    expect((await db.from("ventas").select("id").eq("lead_id", l)).data).toHaveLength(0);
    await falla(asignarLeads([l], e.p.closerA.id), /no es caller de este proyecto/); // un closer no es caller
    await falla(asignarLeads([l], undefined, e.p.callerA.id), /no es closer de este proyecto/);
    await ok(asignarLeads([l], e.p.callerA.id, e.p.closerA.id));
    await falla(crearLeadManual(formulario({ nombre: "Ajeno", email: `${e.pref}-ajeno@x.test`, pipeline: "00000000-0000-0000-0000-000000000000" })), /Pipeline no encontrado/);
  });
});

describe("Arreglo 30: errores inesperados sin texto técnico", () => {
  it("un fallo inesperado en una acción antigua no enseña el detalle interno", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getSesion).mockRejectedValueOnce(new Error("relation \"tabla_secreta\" does not exist"));
    const r = await enviarReporte(null, formulario({}));
    expect(r?.error).toMatch(/Algo ha fallado/);
    expect(r?.error).not.toMatch(/tabla_secreta/);
    expect(consola).toHaveBeenCalled(); // el detalle queda en el registro del servidor
    consola.mockRestore();
  });
});

describe("Arreglos 31 y 32: estados de las citas", () => {
  it("31: «cerrada» no se puede poner a mano; 32 (quitado por Cristian el 10 oct 2026): se reagenda cualquier cita menos la cerrada", async () => {
    const l = await nuevoLead("Arreglo31", { caller_id: e.p.callerA.id });
    como(e, e.p.director); // 4.4: cita hecha a mano (las de GHL se reagendan en GHL)
    await ok(agendarCita(l, e.p.closerA.id, "2037-10-24T10:00", "", 3));
    const c = await citaDe(l);
    como(e, e.p.closerA);
    await falla(cambiarEstadoCita(c.id, "cerrada" as never, ""), /Estado no válido/);
    await ok(reagendarCita(c.id, "2037-10-25T10:00")); // abierta: sí
    await ok(reagendarCita(c.id, "2037-10-26T10:00")); // la vieja, ya reagendada: ahora también
    let dia = 27;
    for (const [estado, estrellas] of [["cancelada", undefined], ["perdida", 2], ["no_califica", undefined]] as const) {
      const viva = await citaDe(l);
      await ok(cambiarEstadoCita(viva.id, estado, "", estrellas));
      await ok(reagendarCita(viva.id, `2037-10-${dia++}T10:00`));
    }
    const ultima = await citaDe(l);
    await db.from("citas").update({ estado: "cerrada" }).eq("id", ultima.id);
    await falla(reagendarCita(ultima.id, "2037-10-31T10:00"), /«Cerrada»: no se puede reagendar/);
  });
});

describe("Arreglo 35: detalles", () => {
  it("las notas tienen un máximo de 4.000 caracteres y el link de pago de Programas solo admite https", async () => {
    como(e, e.p.ceo);
    const l = await nuevoLead("Arreglo35");
    await falla(anadirNota(l, "x".repeat(4001)), /máximo 4.000 caracteres/);
    await ok(anadirNota(l, "x".repeat(4000)));
    await falla(registrarVenta(l, formulario({ producto: e.productos["Low ticket"], facturacion: "47", cash: "47", tipo_pago: "completo", metodo: "stripe", nota: "y".repeat(4001) })), /demasiado larga/);
    const programa = (link_pago: string): DatosPrograma => ({ id: null, nombre: "Arreglo35", descripcion: "", categoria: "", color: "#7c3aed", activo: true, backend_offer: false, vende_caller: false, modo_pago: "unico", num_cuotas: null, precio: "10", precios_divisa: {}, comisiones: {}, link_pago });
    await falla(guardarPrograma(programa("http://pago.test/x")), /https/);
    await ok(guardarPrograma(programa("https://pago.test/x")));
  });
});
