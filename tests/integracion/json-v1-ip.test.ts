// Plan GHL, punto 3 (Cristian, 7 nov 2026): un envío con el JSON v1 llega bien a la Entrada y la IP de la persona queda
// en el seguimiento del lead (la que manda la landing, o la de la petición si la Entrada envía desde el navegador).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";
import { POST } from "@/app/api/webhooks/entrada/[token]/route";
import { jsonEjemplo } from "@/lib/entradas-panel";

let e: Escenario;
const tokens: Record<string, string> = {};
beforeAll(async () => {
  e = await crearEscenario();
  for (const desde of ["navegador", "servidor"]) {
    const { data } = await db.from("entradas").insert({ proyecto_id: e.proyecto.id, nombre: `v1 ${desde}`, pipeline_id: e.pipeline.id, envia_desde: desde }).select("token").single();
    tokens[desde] = data!.token;
  }
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

const enviar = (token: string, cuerpo: Record<string, unknown>, ipCabecera = "198.51.100.9") =>
  POST(new NextRequest(`http://localhost/api/webhooks/entrada/${token}`, { method: "POST", body: JSON.stringify(cuerpo), headers: { "content-type": "application/json", "x-forwarded-for": `${ipCabecera}, 10.0.0.1` } }), { params: Promise.resolve({ token }) } as never);
const lead = async (email: string) => (await db.from("leads").select("nombre, apellido, telefono, fuente, seguimiento, datos").eq("proyecto_id", e.proyecto.id).eq("email", email).single()).data!;
const v1 = (email: string, extra: Record<string, unknown> = {}) => ({ ...jsonEjemplo({ landing: "codigomaestria", formulario: "agenda" }), email, utm_source: "youtube", ...extra });

describe("JSON v1 en la dirección de una Entrada", () => {
  it("desde el navegador: se guarda el lead y la IP de la petición", async () => {
    expect((await enviar(tokens.navegador, v1(`${e.pref}-v1a@x.test`))).status).toBe(200);
    const l = await lead(`${e.pref}-v1a@x.test`);
    expect(l).toMatchObject({ nombre: "Ana", apellido: "Prueba", fuente: "codigomaestria" });
    expect(l.seguimiento).toMatchObject({ utm_source: "youtube", ip: "198.51.100.9" });
    expect(l.datos).toMatchObject({ template: "v1", form: "agenda" });
  });
  it("desde un servidor con `ip`: esa", async () => {
    await enviar(tokens.servidor, v1(`${e.pref}-v1b@x.test`, { ip: "203.0.113.7" }));
    expect((await lead(`${e.pref}-v1b@x.test`)).seguimiento).toMatchObject({ ip: "203.0.113.7" });
  });
  it("desde un servidor sin `ip`: ninguna (no se guarda la del servidor)", async () => {
    await enviar(tokens.servidor, v1(`${e.pref}-v1c@x.test`));
    expect((await lead(`${e.pref}-v1c@x.test`)).seguimiento).not.toHaveProperty("ip");
  });
});
