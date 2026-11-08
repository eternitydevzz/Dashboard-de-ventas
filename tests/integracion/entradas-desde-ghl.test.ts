// Plan GHL, sección 5 (forma B, Cristian 8 nov 2026): Entradas «Desde un workflow de GHL». La base acepta «ghl» y
// no deja una Entrada «ghl» con «Mandar a GHL» encendido; el endpoint avisa por email si un lead vuelve desde GHL
// menos de 10 min después de que lo escribiéramos (servidor local en lugar de Resend: nunca un email real).
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { crearEscenario, borrarEscenario, db, type Escenario } from "../apoyo/escenario";
import { POST } from "@/app/api/webhooks/entrada/[token]/route";

let e: Escenario;
let servidor: Server;
const recibidos: Record<string, unknown>[] = [];
const antes = { url: process.env.RESEND_API_URL, clave: process.env.RESEND_API_KEY };

beforeAll(async () => {
  e = await crearEscenario();
  servidor = createServer((req, res) => {
    let cuerpo = "";
    req.on("data", (c) => (cuerpo += c));
    req.on("end", () => {
      recibidos.push(JSON.parse(cuerpo));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: "email-falso" }));
    });
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", () => r()));
  process.env.RESEND_API_URL = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  process.env.RESEND_API_KEY = "re_prueba_falsa";
});
afterAll(async () => {
  servidor?.close();
  process.env.RESEND_API_URL = antes.url;
  process.env.RESEND_API_KEY = antes.clave;
  if (e) await borrarEscenario(e);
});

const nueva = (nombre: string, extra: Record<string, unknown> = {}) => db.from("entradas").insert({ proyecto_id: e.proyecto.id, nombre, ...extra }).select("id, token").single();
function enviar(token: string, cuerpo: unknown) {
  const req = new NextRequest(`http://localhost/api/webhooks/entrada/${token}`, { method: "POST", body: JSON.stringify(cuerpo), headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.1" } });
  return POST(req, { params: Promise.resolve({ token }) } as never);
}

describe("la base: envia_desde = 'ghl'", () => {
  it("una Entrada nueva «ghl» se guarda (y navegador, servidor y null siguen valiendo)", async () => {
    for (const v of ["ghl", "navegador", "servidor", null]) {
      const { error } = await nueva(`Desde ${v}`, { envia_desde: v });
      expect(error).toBeNull();
    }
  });
  it("otro valor sigue sin valer", async () => {
    expect((await nueva("Desde otra", { envia_desde: "otra" })).error?.message).toMatch(/check/i);
  });
  it("una «ghl» no puede encender «Mandar a GHL», ni nacer con él encendido", async () => {
    const { data } = await nueva("GHL bucle", { envia_desde: "ghl" });
    const { error } = await db.from("entradas").update({ ghl_activo: true }).eq("id", data!.id);
    expect(error?.message).toMatch(/check/i);
    expect((await nueva("GHL bucle 2", { envia_desde: "ghl", ghl_activo: true })).error?.message).toMatch(/check/i);
  });
  it("con «Mandar a GHL» encendido no se puede pasar a «ghl»", async () => {
    const { data } = await nueva("Manda a GHL", { envia_desde: "navegador", ghl_activo: true });
    expect((await db.from("entradas").update({ envia_desde: "ghl" }).eq("id", data!.id)).error?.message).toMatch(/check/i);
  });
});

describe("el endpoint de una Entrada «ghl»", () => {
  it("no guarda la IP (sería la de GHL)", async () => {
    const { data: en } = await nueva("GHL sin IP", { envia_desde: "ghl" });
    const email = `${e.pref}-ip@x.test`;
    expect((await enviar(en!.token, { email, ip: "203.0.113.7" })).status).toBe(200);
    const { data: lead } = await db.from("leads").select("seguimiento").eq("proyecto_id", e.proyecto.id).eq("email", email).single();
    expect(lead!.seguimiento ?? {}).not.toHaveProperty("ip");
  });

  it("si el lead vuelve <10 min después de escribirlo nosotros en GHL: lo guarda y manda UN email por hora", async () => {
    const { data: en } = await nueva("GHL vuelve", { envia_desde: "ghl" });
    const { data: otra } = await nueva("La que manda", { envia_desde: "navegador" });
    const email = `${e.pref}-vuelve@x.test`;
    const { data: lead } = await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre: "Vuelve", email }).select("id").single();
    // Hace 2 min lo mandamos a GHL desde otra Entrada
    await db.from("webhook_eventos").insert({ proyecto_id: e.proyecto.id, entrada_id: otra!.id, lead_id: lead!.id, tipo: "entrada: La que manda", payload: { email }, procesado: true, ghl_estado: "ok", ghl_enviar_en: new Date(Date.now() - 2 * 60_000).toISOString() });
    const n = recibidos.length;
    expect((await enviar(en!.token, { email, name: "Vuelve" })).status).toBe(200);
    expect((await enviar(en!.token, { email, name: "Vuelve" })).status).toBe(200);
    const nuevos = recibidos.slice(n);
    expect(nuevos).toHaveLength(1);
    expect(nuevos[0]).toMatchObject({ to: ["info@eternity.llc"], subject: expect.stringContaining("GHL vuelve") });
    // El lead se guardó igual: los dos envíos quedan unidos a él
    const { count } = await db.from("webhook_eventos").select("id", { count: "exact", head: true }).eq("entrada_id", en!.id).eq("lead_id", lead!.id).eq("procesado", true);
    expect(count).toBe(2);
  });

  it("un workflow en real a mitad (tramo 1 ya escrito en GHL, aún «esperando») cuenta; uno en prueba, no", async () => {
    const { data: otra } = await nueva("La del workflow", { envia_desde: "navegador" });
    const { data: wf } = await db.from("workflows").insert({ proyecto_id: e.proyecto.id, nombre: "wf", disparador: { tipo: "entrada" }, entrada_id: otra!.id }).select("id").single();
    for (const modo of ["prueba", "real"]) {
      const { data: en } = await nueva(`GHL tramo ${modo}`, { envia_desde: "ghl" });
      const email = `${e.pref}-tramo-${modo}@x.test`;
      const { data: lead } = await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre: modo, email }).select("id").single();
      const { error } = await db.from("workflow_ejecuciones").insert({ workflow_id: wf!.id, version: 1, pasos: [], proyecto_id: e.proyecto.id, lead_id: lead!.id, entrada_id: otra!.id, estado: "esperando", tramo: 1, siguiente_en: new Date(Date.now() + 3_600_000).toISOString(), registro: [{ tipo: "tramo", tramo: 0, modo }] });
      expect(error).toBeNull();
      const n = recibidos.length;
      expect((await enviar(en!.token, { email, name: modo })).status).toBe(200);
      expect(recibidos.length - n).toBe(modo === "real" ? 1 : 0);
    }
  });

  it("sin escritura nuestra en los últimos 10 min: sin email", async () => {
    const { data: en } = await nueva("GHL tranquila", { envia_desde: "ghl" });
    const { data: otra } = await nueva("La que manda 2", { envia_desde: "navegador" });
    const email = `${e.pref}-viejo@x.test`;
    const { data: lead } = await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre: "Viejo", email }).select("id").single();
    await db.from("webhook_eventos").insert({ proyecto_id: e.proyecto.id, entrada_id: otra!.id, lead_id: lead!.id, tipo: "entrada: La que manda 2", payload: { email }, procesado: true, ghl_estado: "ok", ghl_enviar_en: new Date(Date.now() - 30 * 60_000).toISOString() });
    const n = recibidos.length;
    expect((await enviar(en!.token, { email, name: "Viejo" })).status).toBe(200);
    expect(recibidos.length).toBe(n);
  });
});
