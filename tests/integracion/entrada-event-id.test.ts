// Landing software-demo (Cristian, 7 nov 2026): el formulario manda cada paso a su Entrada con el mismo `event_id`.
// Los primeros pasos solo traen el teléfono y el email llega después. Antes se creaban 2 leads (uno con el teléfono
// y otro con el email); ahora el envío con email completa el lead que ya creó ese mismo `event_id` en esa Entrada.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";
import { POST } from "@/app/api/webhooks/entrada/[token]/route";

let e: Escenario;
let token = "";
let otraEntrada = "";
beforeAll(async () => {
  e = await crearEscenario();
  const a = await db.from("entradas").insert({ proyecto_id: e.proyecto.id, nombre: "event_id", pipeline_id: e.pipeline.id, envia_desde: "servidor" }).select("token").single();
  token = a.data!.token;
  const b = await db.from("entradas").insert({ proyecto_id: e.proyecto.id, nombre: "event_id otra", pipeline_id: e.pipeline.id, envia_desde: "servidor" }).select("token").single();
  otraEntrada = b.data!.token;
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

const enviar = (t: string, cuerpo: Record<string, unknown>) =>
  POST(new NextRequest(`http://localhost/api/webhooks/entrada/${t}`, { method: "POST", body: JSON.stringify({ template: "v1", source: "software-demo", form: "demo", ...cuerpo }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ token: t }) } as never);
const leadsCon = async (tel: string) => (await db.from("leads").select("id, email, nombre, respuestas").eq("proyecto_id", e.proyecto.id).eq("telefono", tel)).data ?? [];

describe("Entrada: envíos con el mismo event_id", () => {
  it("primero solo el teléfono y después el email: 1 solo lead, con el email y las respuestas", async () => {
    const tel = "+12015550161";
    const id = `${e.pref}-ev1`;
    expect((await enviar(token, { step: "paso-1", event_id: id, phone: tel })).status).toBe(200);
    expect((await enviar(token, { step: "paso-2", event_id: id, phone: tel, name: "Prueba Evento" })).status).toBe(200);
    expect((await enviar(token, { step: "paso-3", event_id: id, phone: tel, name: "Prueba Evento", email: `${e.pref}-ev1@x.test` })).status).toBe(200);
    expect((await enviar(token, { step: "paso-5", event_id: id, phone: tel, name: "Prueba Evento", email: `${e.pref}-ev1@x.test`, quiz: { idea: "Una app", capital: "$2,000 - $3,500" }, quiz_completed: true })).status).toBe(200);
    const ls = await leadsCon(tel);
    expect(ls).toHaveLength(1);
    expect(ls[0]).toMatchObject({ email: `${e.pref}-ev1@x.test`, nombre: "Prueba" });
    expect(ls[0].respuestas).toEqual(expect.arrayContaining([expect.objectContaining({ respuesta: "Una app" })]));
    // Todos los envíos quedan unidos a ese lead
    const { data: envios } = await db.from("webhook_eventos").select("lead_id").eq("payload->>event_id", id);
    expect(envios).toHaveLength(4);
    expect(new Set(envios!.map((x) => x.lead_id))).toEqual(new Set([ls[0].id]));
  });

  it("si el email ya es de otro lead, no se toca el lead del teléfono (el email gana, como siempre)", async () => {
    const tel = "+12015550162";
    const email = `${e.pref}-ev2@x.test`;
    await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre: "Ya", apellido: "Existe", email, origen: "ghl" });
    const id = `${e.pref}-ev2`;
    await enviar(token, { event_id: id, phone: tel });
    await enviar(token, { event_id: id, phone: tel, email });
    const delTel = await leadsCon(tel);
    expect(delTel.find((l) => l.email === null)).toBeTruthy(); // el lead del teléfono se queda sin email
    expect((await db.from("leads").select("id").eq("proyecto_id", e.proyecto.id).eq("email", email)).data).toHaveLength(1);
  });

  it("mismo event_id en otra Entrada: no se junta (cada Entrada lo suyo)", async () => {
    const tel = "+12015550163";
    const id = `${e.pref}-ev3`;
    await enviar(token, { event_id: id, phone: tel });
    await enviar(otraEntrada, { event_id: id, phone: tel, email: `${e.pref}-ev3@x.test` });
    expect(await leadsCon(tel)).toHaveLength(2);
  });

  it("sin event_id: como antes (2 leads)", async () => {
    const tel = "+12015550164";
    await enviar(token, { phone: tel });
    await enviar(token, { phone: tel, email: `${e.pref}-ev4@x.test` });
    expect(await leadsCon(tel)).toHaveLength(2);
  });
});
