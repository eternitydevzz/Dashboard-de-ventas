// Encargo de Callers (C11 punto 15 y F21, con el OK de Cristian, 7 nov 2026): el webhook de citas de GHL respeta
// «vendido» y pasa a «reagendado» (con la etiqueta «Reagendado») a quien estaba en confirma agenda o descartado.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";
import { POST } from "@/app/api/webhooks/ghl/[proyectoId]/route";

let e: Escenario;
let secreto: string;
beforeAll(async () => {
  e = await crearEscenario();
  secreto = (await db.from("proyectos").select("webhook_secreto").eq("id", e.proyecto.id).single()).data!.webhook_secreto;
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

const enviar = (cuerpo: unknown) =>
  POST(
    new NextRequest(`http://localhost/api/webhooks/ghl/${e.proyecto.id}?secreto=${secreto}`, { method: "POST", body: JSON.stringify(cuerpo), headers: { "content-type": "application/json" } }),
    { params: Promise.resolve({ proyectoId: e.proyecto.id }) } as never
  );
const nuevoLead = async (nombre: string, estado: string) =>
  (await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre, email: `${e.pref}-${nombre}@x.test`, estado_caller: estado, etiquetas: ["otra"] }).select("id").single()).data!.id as string;
const lead = async (id: string) => (await db.from("leads").select("estado_caller, etiquetas").eq("id", id).single()).data!;

describe("cita de GHL por el webhook", () => {
  it("F21: un lead vendido sigue vendido (y sin etiqueta nueva)", async () => {
    const id = await nuevoLead("vendido1", "vendido");
    expect((await enviar({ tipo: "cita_agendada", email: `${e.pref}-vendido1@x.test`, fecha: "2026-12-05T15:00:00Z" })).status).toBe(200);
    expect(await lead(id)).toEqual({ estado_caller: "vendido", etiquetas: ["otra"] });
  });
  it("confirma agenda → reagendado con la etiqueta «Reagendado» (sin quitar las demás)", async () => {
    const id = await nuevoLead("conf1", "confirma_agenda");
    expect((await enviar({ tipo: "cita_agendada", email: `${e.pref}-conf1@x.test`, fecha: "2026-12-06T15:00:00Z" })).status).toBe(200);
    expect(await lead(id)).toEqual({ estado_caller: "reagendado", etiquetas: ["otra", "Reagendado"] });
  });
  it("descartado → reagendado", async () => {
    const id = await nuevoLead("desc1", "descartado");
    await enviar({ tipo: "cita_agendada", email: `${e.pref}-desc1@x.test`, fecha: "2026-12-07T15:00:00Z" });
    expect((await lead(id)).estado_caller).toBe("reagendado");
  });
  it("cualquier otro → agendado (como hasta ahora)", async () => {
    const id = await nuevoLead("seg1", "seguimiento");
    await enviar({ tipo: "cita_agendada", email: `${e.pref}-seg1@x.test`, fecha: "2026-12-08T15:00:00Z" });
    expect(await lead(id)).toEqual({ estado_caller: "agendado", etiquetas: ["otra"] });
  });
});
