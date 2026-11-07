// V2-2: crear/importar llamadas, «confirmación pendiente» y citas de GHL sin duplicar.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { borrarEscenario, como, crearEscenario, db, falla, ok, type Escenario } from "../apoyo/escenario";
import { agendarCita } from "@/app/(panel)/leads/acciones";
import { buscarLeadsParaLlamada, cambiarEstadoCita, importarCitas } from "@/app/(panel)/closer/acciones";
import { POST } from "@/app/api/webhooks/ghl/[proyectoId]/route";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});
const citasDe = async (leadId: string) => (await db.from("citas").select("*").eq("lead_id", leadId).order("creado_en")).data!;

describe("Crear llamada", () => {
  it("un jefe agenda sin estrellas (son opcionales); un caller agenda con la rotación (C11, 7 nov; sin closers en ella, avisa)", async () => {
    como(e, e.p.director);
    await ok(agendarCita(e.leads.LeadLibre, e.p.closerA.id, "2026-10-20T10:00", ""));
    expect((await citasDe(e.leads.LeadLibre))[0].estrellas_caller).toBeNull();
    como(e, e.p.callerA);
    await falla(agendarCita(e.leads.LeadA, e.p.closerA.id, "2026-10-20T11:00", "", 4), /rotación/);
  });
  it("buscar: el jefe encuentra en todo el proyecto; el closer solo entre sus leads; un caller no puede", async () => {
    como(e, e.p.director);
    expect(((await ok(buscarLeadsParaLlamada("LeadA"))) as { id: string }[]).map((l) => l.id)).toEqual([e.leads.LeadA]);
    como(e, e.p.closerA);
    expect(((await ok(buscarLeadsParaLlamada("Lead"))) as { id: string }[]).map((l) => l.id)).toEqual([e.leads.LeadLibre]); // el único con closer A
    como(e, e.p.callerA);
    await falla(buscarLeadsParaLlamada("Lead"), /Sin permiso|No tienes acceso/);  // H5: sin la sección, «No tienes acceso»
  });
  it("«confirmación pendiente» es un estado válido", async () => {
    como(e, e.p.closerA);
    const c = (await citasDe(e.leads.LeadLibre))[0];
    await ok(cambiarEstadoCita(c.id, "confirmacion_pendiente", ""));
    expect((await citasDe(e.leads.LeadLibre))[0].estado).toBe("confirmacion_pendiente");
  });
});

describe("Importar llamadas (CSV)", () => {
  it("solo jefes; crea las que encuentra y explica las que no", async () => {
    como(e, e.p.closerA);
    await falla(importarCitas("email,fecha,closer_email\n"), /director o el CEO/);
    como(e, e.p.ceo);
    await db.from("leads").update({ telefono: "+34 600 11 22 33" }).eq("id", e.leads.LeadB);
    const csv = [
      "email,telefono,fecha,closer_email,nota",
      `${e.pref}-la@x.test,,2026-10-21 17:00,${e.p.closerB.email},Desde CSV`,
      `,34600112233,2026-10-22 09:30,${e.p.closerA.email},`,
      `nadie@x.test,,2026-10-22 09:30,${e.p.closerA.email},`,
      `${e.pref}-la@x.test,,mañana,${e.p.closerA.email},`,
      `${e.pref}-la@x.test,,2026-10-22 09:30,noexiste@x.test,`,
    ].join("\n");
    const r = (await ok(importarCitas(csv))) as { creadas: number; fallos: string[] };
    expect(r.creadas).toBe(2);
    expect(r.fallos).toEqual(["Fila 4: no hay ningún lead con ese email", "Fila 5: fecha no válida («mañana»)", "Fila 6: closer no encontrado"]);
    const a = (await citasDe(e.leads.LeadA)).find((c) => c.nota === "Desde CSV")!;
    expect(a.closer_id).toBe(e.p.closerB.id);
    expect(new Date(a.fecha).toISOString()).toBe("2026-10-21T21:00:00.000Z"); // 17:00 en Nueva York
    expect((await citasDe(e.leads.LeadB)).some((c) => c.closer_id === e.p.closerA.id)).toBe(true); // por teléfono
  });
  it("arreglo 25: importar el mismo CSV otra vez no duplica; el teléfono sin prefijo encuentra al lead", async () => {
    como(e, e.p.ceo);
    const antes = (await citasDe(e.leads.LeadA)).length + (await citasDe(e.leads.LeadB)).length;
    const csv = ["email,telefono,fecha,closer_email,nota", `${e.pref}-la@x.test,,2026-10-21 17:00,${e.p.closerB.email},Desde CSV`, `,600112233,2026-10-22 09:30,${e.p.closerA.email},`].join("\n");
    const r = (await ok(importarCitas(csv))) as { creadas: number; fallos: string[] };
    expect(r.creadas).toBe(0);
    expect(r.fallos).toEqual(["Fila 2: esa cita ya existe (mismo lead, closer y hora); no se duplica", "Fila 3: esa cita ya existe (mismo lead, closer y hora); no se duplica"]);
    expect((await citasDe(e.leads.LeadA)).length + (await citasDe(e.leads.LeadB)).length).toBe(antes);
    // Otra hora con el teléfono sin prefijo: se crea
    const r2 = (await ok(importarCitas(["email,telefono,fecha,closer_email", `,600112233,2026-10-23 09:30,${e.p.closerA.email}`].join("\n")))) as { creadas: number };
    expect(r2.creadas).toBe(1);
  });
});

describe("Webhook de GHL: la misma cita dos veces", () => {
  it("se actualiza, no se duplica", async () => {
    const secreto = (await db.from("proyectos").select("webhook_secreto").eq("id", e.proyecto.id).single()).data!.webhook_secreto;
    const enviar = (cuerpo: unknown) =>
      POST(new NextRequest(`http://localhost/api/webhooks/ghl/${e.proyecto.id}`, { method: "POST", body: JSON.stringify(cuerpo), headers: { "content-type": "application/json", "x-eternity-secreto": secreto } }), { params: Promise.resolve({ proyectoId: e.proyecto.id }) } as never);
    const base = { tipo: "cita_agendada", contact_id: `${e.pref}-ghlx`, email: `${e.pref}-ghlx@x.test`, first_name: "Dup", appointment_id: `${e.pref}-cita-1`, closer_email: e.p.closerA.email };
    expect((await enviar({ ...base, fecha: "2026-10-25T10:00:00-04:00" })).status).toBe(200);
    expect((await enviar({ ...base, fecha: "2026-10-26T11:00:00-04:00" })).status).toBe(200);
    const { data } = await db.from("citas").select("fecha").eq("proyecto_id", e.proyecto.id).eq("ghl_cita_id", `${e.pref}-cita-1`);
    expect(data).toHaveLength(1);
    expect(new Date(data![0].fecha).toISOString()).toBe("2026-10-26T15:00:00.000Z");
  });
});
