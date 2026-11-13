// 1.0 Bloque 1 (Cristian, 11 oct 2026): horario y «Mi perfil». Cada uno cambia su horario; un administrador, el de
// cualquiera. Los ajustes de las llamadas de los closers solo los pone el administrador. «Libre a una hora» con citas reales.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, falla, ok, PASSWORD, type Escenario } from "../apoyo/escenario";
import { cambiarMiPassword, guardarHorario, guardarMiPerfil } from "@/app/(panel)/perfil/acciones";
import { guardarCalendario } from "@/app/(panel)/admin/acciones";
import { closerLibreA } from "@/lib/agenda-libre";
import type { Proyecto } from "@/lib/tipos";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

const LV = { semana: { 1: [{ desde: "09:00", hasta: "13:00" }, { desde: "14:00", hasta: "18:00" }] }, fechas: { "2026-10-19": [] } };
const horarioDe = async (id: string) => (await db.from("miembros_proyecto").select("horario").eq("proyecto_id", e.proyecto.id).eq("perfil_id", id).single()).data!.horario;
const proyecto = async () => (await db.from("proyectos").select("*").eq("id", e.proyecto.id).single()).data as Proyecto;

describe("Horario: quién lo cambia", () => {
  it("cada caller y closer cambia el suyo; no el de otro", async () => {
    como(e, e.p.callerA);
    await ok(guardarHorario(e.p.callerA.id, LV));
    expect(await horarioDe(e.p.callerA.id)).toEqual(LV);
    await falla(guardarHorario(e.p.callerB.id, LV), /tu propio horario/);
    como(e, e.p.closerA);
    await ok(guardarHorario(e.p.closerA.id, LV));
    await falla(guardarHorario(e.p.callerA.id, LV), /tu propio horario/);
  });
  it("un administrador cambia el de cualquiera; un director sin Administración, no", async () => {
    como(e, e.p.directorAdmin);
    await ok(guardarHorario(e.p.callerB.id, LV));
    como(e, e.p.director);
    await falla(guardarHorario(e.p.callerB.id, LV), /tu propio horario/);
    como(e, e.p.ceo);
    await ok(guardarHorario(e.p.closerB.id, LV));
    await falla(guardarHorario(e.p.ceo.id, LV), /callers y closers/); // el CEO no tiene horario
  });
  it("sin tramos o mal escrito, no se guarda", async () => {
    como(e, e.p.callerC);
    await falla(guardarHorario(e.p.callerC.id, { semana: {}, fechas: {} }), /al menos un tramo/);
    await falla(guardarHorario(e.p.callerC.id, { semana: { 1: [{ desde: "18:00", hasta: "09:00" }] } }), /al menos un tramo/);
    expect(await horarioDe(e.p.callerC.id)).toBeNull();
  });
});

describe("Ajustes de las llamadas de los closers (solo el administrador)", () => {
  it("los del proyecto y los de un closer; un closer no puede ponérselos", async () => {
    como(e, e.p.closerA);
    await falla(guardarCalendario(e.p.closerA.id, { duracion: 15, descanso: 0, aviso: 0, max_dia: 50 }), /permiso/);
    como(e, e.p.directorAdmin);
    await falla(guardarCalendario(null, { duracion: 2, descanso: 0, aviso: 0, max_dia: null }), /duración/);
    await ok(guardarCalendario(null, { duracion: 45, descanso: 15, aviso: 60, max_dia: null }));
    expect((await proyecto()).calendario).toEqual({ duracion: 45, descanso: 15, aviso: 60, max_dia: null });
    await falla(guardarCalendario(e.p.callerA.id, { duracion: 30, descanso: 0, aviso: 0, max_dia: 1 }), /para closers/);
    await ok(guardarCalendario(e.p.closerB.id, { duracion: 30, descanso: 0, aviso: 0, max_dia: 1 }));
  });
  it("un caller con «También closer» (Facu) también tiene sus ajustes (9 nov)", async () => {
    await db.from("perfiles").update({ tambien_closer: true }).eq("id", e.p.callerA.id);
    como(e, e.p.directorAdmin);
    await ok(guardarCalendario(e.p.callerA.id, { duracion: 30, descanso: 0, aviso: 0, max_dia: 2 }));
    await db.from("perfiles").update({ tambien_closer: false }).eq("id", e.p.callerA.id);
  });
});

describe("¿Está libre el closer? (con sus citas de verdad)", () => {
  it("mira su horario, sus citas vivas (no las canceladas), su duración y descanso, y su máximo por día", async () => {
    const p = await proyecto(); // 45 min + 15 de descanso; aviso 60 min
    const lunes = (hm: string) => new Date(`2026-10-12T${hm}:00-04:00`); // Nueva York
    const ahora = lunes("07:00");
    expect(await closerLibreA(p, e.p.closerA.id, lunes("10:00"), { ahora })).toEqual({ libre: true });
    expect(await closerLibreA(p, e.p.closerA.id, lunes("07:30"), { ahora })).toEqual({ libre: false, motivo: "aviso" });
    expect(await closerLibreA(p, e.p.closerA.id, lunes("12:30"), { ahora })).toEqual({ libre: false, motivo: "fuera_horario" }); // acabaría 13:15
    const { data: cita } = await db.from("citas").insert({ proyecto_id: e.proyecto.id, lead_id: e.leads.LeadA, closer_id: e.p.closerA.id, fecha: lunes("10:00").toISOString() }).select("id").single();
    expect(await closerLibreA(p, e.p.closerA.id, lunes("10:30"), { ahora })).toEqual({ libre: false, motivo: "ocupado" });
    expect(await closerLibreA(p, e.p.closerA.id, lunes("10:50"), { ahora })).toEqual({ libre: false, motivo: "ocupado" }); // su descanso
    expect(await closerLibreA(p, e.p.closerA.id, lunes("11:00"), { ahora })).toEqual({ libre: true });
    expect(await closerLibreA(p, e.p.closerA.id, lunes("10:00"), { sinCita: cita!.id, ahora })).toEqual({ libre: true }); // al mover esa misma cita
    await db.from("citas").update({ estado: "cancelada" }).eq("id", cita!.id);
    expect(await closerLibreA(p, e.p.closerA.id, lunes("10:30"), { ahora })).toEqual({ libre: true });
    // closerB: máximo 1 al día (sus propios ajustes)
    await db.from("citas").insert({ proyecto_id: e.proyecto.id, lead_id: e.leads.LeadB, closer_id: e.p.closerB.id, fecha: lunes("09:00").toISOString() });
    expect(await closerLibreA(p, e.p.closerB.id, lunes("15:00"), { ahora })).toEqual({ libre: false, motivo: "maximo" });
    // El 19 oct es día libre de los dos
    expect(await closerLibreA(p, e.p.closerA.id, new Date("2026-10-19T10:00:00-04:00"), { ahora })).toEqual({ libre: false, motivo: "fuera_horario" });
  });
});

describe("Mi perfil", () => {
  it("cada uno cambia sus datos y su contraseña", async () => {
    como(e, e.p.callerA);
    await falla(guardarMiPerfil({ nombre: " ", telefono: "", whatsapp: "" }), /obligatorio/);
    await ok(guardarMiPerfil({ nombre: "Test callera nuevo", telefono: "+1 555", whatsapp: "" }));
    const { data } = await db.from("perfiles").select("nombre, telefono, whatsapp").eq("id", e.p.callerA.id).single();
    expect(data).toEqual({ nombre: "Test callera nuevo", telefono: "+1 555", whatsapp: null });
    await falla(cambiarMiPassword(PASSWORD, "corta", "corta"), /8 caracteres/);
    await falla(cambiarMiPassword(PASSWORD, "Nueva-clave-1", "Nueva-clave-2"), /no coinciden/);
    // D43: pide la actual y la comprueba
    await falla(cambiarMiPassword("", "Nueva-clave-1", "Nueva-clave-1"), /contraseña actual/);
    await falla(cambiarMiPassword("No-es-la-mia-1", "Nueva-clave-1", "Nueva-clave-1"), /no es correcta/);
    await ok(cambiarMiPassword(PASSWORD, "Nueva-clave-1", "Nueva-clave-1"));
    await falla(cambiarMiPassword(PASSWORD, "Otra-clave-22", "Otra-clave-22"), /no es correcta/); // ya cambió
    await ok(cambiarMiPassword("Nueva-clave-1", PASSWORD, PASSWORD)); // la deja como estaba para el resto de tests
  });
});
