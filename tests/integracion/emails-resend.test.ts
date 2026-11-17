// Bloque 6 (Cristian, 11 oct 2026): emails con Resend. En lugar de Resend se usa un servidor local que guarda lo
// que recibe (nunca se manda un email de verdad). Cubre: el envío (cabeceras, remitente, destinatarios) y el enlace
// mágico que manda un administrador desde la ficha. (Fase C: fuera el aviso del reporte de fin de día, pantalla quitada.)
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, falla, ok, type Escenario } from "../apoyo/escenario";
import { enviarEmail } from "@/lib/email";
import { enviarEnlaceMagico } from "@/app/(panel)/admin/acciones";

let e: Escenario;
let servidor: Server;
const recibidos: { auth: string; cuerpo: Record<string, unknown> }[] = [];
const antes = { url: process.env.RESEND_API_URL, clave: process.env.RESEND_API_KEY };

beforeAll(async () => {
  e = await crearEscenario();
  servidor = createServer((req, res) => {
    let cuerpo = "";
    req.on("data", (c) => (cuerpo += c));
    req.on("end", () => {
      recibidos.push({ auth: String(req.headers.authorization ?? ""), cuerpo: JSON.parse(cuerpo) });
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: "email-falso" }));
    });
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", () => r()));
  const { port } = servidor.address() as { port: number };
  process.env.RESEND_API_URL = `http://127.0.0.1:${port}`;
  process.env.RESEND_API_KEY = "re_prueba_falsa";
});
afterAll(async () => {
  servidor?.close();
  process.env.RESEND_API_URL = antes.url;
  process.env.RESEND_API_KEY = antes.clave;
  if (e) await borrarEscenario(e);
});

describe("Enviar un email con Resend", () => {
  it("manda la clave, el remitente de Eternity, los destinatarios, el asunto y el texto", async () => {
    const r = await enviarEmail({ para: ["a@x.test"], asunto: "Hola", texto: "Prueba" });
    expect(r).toEqual({ enviado: true, motivo: "" });
    const ultimo = recibidos.at(-1)!;
    expect(ultimo.auth).toBe("Bearer re_prueba_falsa");
    expect(ultimo.cuerpo).toMatchObject({ from: "Eternity <no-reply@eternity.llc>", to: ["a@x.test"], subject: "Hola", text: "Prueba" });
  });

  it("sin clave de Resend no envía nada y lo dice", async () => {
    const clave = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const n = recibidos.length;
    try {
      expect(await enviarEmail({ para: ["a@x.test"], asunto: "Hola", texto: "Prueba" })).toEqual({ enviado: false, motivo: "Falta RESEND_API_KEY" });
    } finally {
      process.env.RESEND_API_KEY = clave;
    }
    expect(recibidos.length).toBe(n);
  });
});

describe("Enlace mágico", () => {
  it("solo un administrador lo manda; el email lleva un enlace a /auth/confirm con el token", async () => {
    como(e, e.p.closerA);
    await falla(enviarEnlaceMagico(e.p.callerA.id));
    como(e, e.p.ceo);
    const n = recibidos.length;
    await ok(enviarEnlaceMagico(e.p.callerA.id));
    const email = recibidos.slice(n)[0];
    expect(email.cuerpo.to).toEqual([e.p.callerA.email]);
    expect(String(email.cuerpo.text)).toMatch(/\/auth\/confirm\?token_hash=[^&\s]+&type=magiclink/);
    expect(String(email.cuerpo.html)).toMatch(/href="[^"]*\/auth\/confirm\?token_hash=[^&"]+&amp;type=magiclink"/);
    expect(String(email.cuerpo.html)).toContain("Entrar en Eternity");
  });

  it("a alguien de otro proyecto no se le manda", async () => {
    como(e, e.p.ceo);
    await falla(enviarEnlaceMagico(crypto.randomUUID()), /no está en este proyecto/);
  });
});
