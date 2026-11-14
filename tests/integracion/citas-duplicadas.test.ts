// Paso H6: un doble clic en «Agendar» creó dos citas iguales (Lázaro, Maestria, 10 oct 2026).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, ok, type Escenario } from "../apoyo/escenario";
import { agendarCita } from "@/app/(panel)/leads/acciones";
import { cambiarEstadoCita } from "@/app/(panel)/closer/acciones";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});
const citas = async () => (await db.from("citas").select("id, estado").eq("lead_id", e.leads.LeadA)).data ?? [];

describe("Agendar no duplica citas", () => {
  it("dos «Agendar» iguales a la vez: solo se crea una y el otro recibe un aviso claro", async () => {
    como(e, e.p.director); // 4.4: los callers ya no agendan a mano
    const r = await Promise.all([1, 2].map(() => agendarCita(e.leads.LeadA, e.p.closerA.id, "2026-11-20T16:00", "", 4)));
    expect(await citas()).toHaveLength(1);
    const errores = r.filter((x) => x && typeof x === "object" && "error" in x).map((x) => (x as { error: string }).error);
    expect(errores).toEqual(["Ese lead ya tiene una cita con ese closer a esa hora."]);
  });
  // Fase 3 (Cristian, 13 nov): una sola agenda por lead, manda la última
  it("otra hora u otro closer con la cita abierta: se junta (1 cita, la última); cancelada, se crea otra", async () => {
    como(e, e.p.director); // 4.4: los callers ya no agendan a mano
    await ok(agendarCita(e.leads.LeadA, e.p.closerA.id, "2026-11-20T17:00", "", 4));
    await ok(agendarCita(e.leads.LeadA, e.p.closerB.id, "2026-11-20T16:00", "", 4));
    const unica = (await db.from("citas").select("id, closer_id").eq("lead_id", e.leads.LeadA)).data!;
    expect(unica).toHaveLength(1);
    expect(unica[0].closer_id).toBe(e.p.closerB.id);
    como(e, e.p.closerB);
    await ok(cambiarEstadoCita(unica[0].id, "cancelada", ""));
    como(e, e.p.director); // 4.4: los callers ya no agendan a mano
    await ok(agendarCita(e.leads.LeadA, e.p.closerA.id, "2026-11-20T16:00", "", 4));
    expect(await citas()).toHaveLength(2);
  });
});
