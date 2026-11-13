// Reagendar una cita hecha a mano (antes en rotacion.test.ts; la rotación de closers se quitó el 11 oct, 4.4):
// el mismo closer y tiene que estar libre a la nueva hora; un closer sin horario solo choca con sus otras citas.
// Al agendar a mano, la ventana avisa si el closer no está libre (y deja agendar igual).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, falla, ok, type Escenario } from "../apoyo/escenario";
import { agendarCita } from "@/app/(panel)/leads/acciones";
import { consultarAgenda } from "@/app/(panel)/leads/agenda";
import { reagendarCita } from "@/app/(panel)/closer/acciones";

let e: Escenario;
let leadC: string; // Fase 3: un lead tiene una sola cita abierta, así que la de las 20:00 va en otro
// Lunes 4 de enero de 2038 (Nueva York), de 9 a 18, para los dos closers
const LUNES = { semana: { 1: [{ desde: "09:00", hasta: "18:00" }] }, fechas: {} };
beforeAll(async () => {
  e = await crearEscenario();
  await db.from("miembros_proyecto").update({ horario: LUNES }).eq("proyecto_id", e.proyecto.id).in("perfil_id", [e.p.closerA.id, e.p.closerB.id]);
  // Citas hechas a mano por un jefe: A a las 11:00; B a las 13:00 y a las 15:00; A a las 20:00 (fuera de horario, LeadC)
  como(e, e.p.director);
  await ok(agendarCita(e.leads.LeadLibre, e.p.closerA.id, "2038-01-04T11:00", ""));
  await ok(agendarCita(e.leads.LeadA, e.p.closerB.id, "2038-01-04T13:00", ""));
  await ok(agendarCita(e.leads.LeadB, e.p.closerB.id, "2038-01-04T15:00", ""));
  leadC = (await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre: "LeadC" }).select("id").single()).data!.id;
  await ok(agendarCita(leadC, e.p.closerA.id, "2038-01-04T20:00", ""));
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

const closerDe = async (leadId: string, fecha: string) => (await db.from("citas").select("closer_id").eq("lead_id", leadId).eq("fecha", new Date(`${fecha}:00-05:00`).toISOString()).single()).data!.closer_id;

describe("Agendar a mano", () => {
  it("avisa si el closer no está libre, pero deja agendar", async () => {
    como(e, e.p.ceo);
    expect(await consultarAgenda("2038-01-04T20:00", e.p.closerA.id)).toMatchObject({ aviso: expect.stringMatching(/fuera de su horario/) });
    expect(await consultarAgenda("2038-01-04T10:00", e.p.closerA.id)).toEqual({ aviso: null });
    expect(await closerDe(leadC, "2038-01-04T20:00")).toBe(e.p.closerA.id);
  });
});

describe("Reagendar", () => {
  it("mismo closer; si no está libre a la nueva hora, no deja", async () => {
    como(e, e.p.ceo);
    const { data: cita } = await db.from("citas").select("id, closer_id").eq("lead_id", e.leads.LeadB).eq("fecha", new Date("2038-01-04T15:00:00-05:00").toISOString()).single();
    await falla(reagendarCita(cita!.id, "2038-01-04T13:00"), /No está libre/); // B ya tiene la de las 13:00
    await falla(reagendarCita(cita!.id, "2038-01-05T10:00"), /No está libre/); // martes no trabaja
    await ok(reagendarCita(cita!.id, "2038-01-04T16:30"));
    expect(await closerDe(e.leads.LeadB, "2038-01-04T16:30")).toBe(e.p.closerB.id);
  });
  it("closer sin horario: solo se comprueba que no choque con otra cita", async () => {
    await db.from("miembros_proyecto").update({ horario: null }).eq("proyecto_id", e.proyecto.id).eq("perfil_id", e.p.closerA.id);
    const { data: cita } = await db.from("citas").select("id").eq("lead_id", leadC).eq("fecha", new Date("2038-01-04T20:00:00-05:00").toISOString()).single();
    await falla(reagendarCita(cita!.id, "2038-01-04T11:15"), /No está libre/); // A tiene la de las 11:00 (30 min)
    await ok(reagendarCita(cita!.id, "2038-01-05T22:00"));
    // 1.1: al agendar con un closer sin horario, el aviso lo dice claro
    expect((await consultarAgenda("2038-01-06T10:00", e.p.closerA.id)) as { aviso: string }).toMatchObject({ aviso: expect.stringMatching(/no tiene horario puesto/) });
    expect((await consultarAgenda("2038-01-06T10:00", e.p.closerB.id)) as { aviso: string }).toMatchObject({ aviso: expect.stringMatching(/fuera de su horario/) }); // miércoles: B no trabaja
  });
});

describe("Citas que vienen de GHL (4.4, 11 oct)", () => {
  it("también se reagendan en la app, y la sincronización ya no les cambia la hora", async () => {
    const { data: c } = await db.from("citas").insert({ proyecto_id: e.proyecto.id, lead_id: e.leads.LeadA, closer_id: e.p.closerA.id, fecha: "2038-01-11T15:00:00Z", origen: "ghl", ghl_cita_id: `${e.pref}-ghl1` }).select("id").single();
    como(e, e.p.ceo);
    await ok(reagendarCita(c!.id, "2038-01-11T12:00"));
    expect((await db.from("citas").select("estado").eq("id", c!.id).single()).data!.estado).toBe("reagendada");
    const { data: nueva } = await db.from("citas").select("estado, ghl_cita_id").eq("lead_id", e.leads.LeadA).eq("fecha", new Date("2038-01-11T12:00:00-05:00").toISOString()).single();
    expect(nueva).toEqual({ estado: "pendiente", ghl_cita_id: null }); // sin id de GHL: la sincronización no la toca
  });
});
