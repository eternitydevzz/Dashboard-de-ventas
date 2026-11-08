// Plan GHL F2: email diario del CEO. En lugar de Resend, un servidor local guarda lo que recibe (nunca sale un email real).
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";
import { enviarDiario } from "@/lib/avisos-diario";
import { POST } from "@/app/api/avisos/diario/[proyectoId]/route";
import { reiniciarLimites } from "@/lib/limite";

let e: Escenario;
let servidor: Server;
let secreto: string;
const recibidos: Record<string, unknown>[] = [];
const antes = { url: process.env.RESEND_API_URL, clave: process.env.RESEND_API_KEY };

beforeAll(async () => {
  e = await crearEscenario();
  secreto = (await db.from("proyectos").select("webhook_secreto").eq("id", e.proyecto.id).single()).data!.webhook_secreto;
  await reiniciarLimites();
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

describe("Email diario del CEO", () => {
  it("a las 8 de Madrid manda 1 email a info@eternity.llc y guarda la fecha; la segunda llamada no manda otro", async () => {
    const ocho = new Date("2026-11-09T07:00:00Z");
    expect((await enviarDiario(e.proyecto.id, ocho)).estado).toBe("enviado");
    expect((await enviarDiario(e.proyecto.id, new Date("2026-11-09T07:20:00Z"))).estado).toBe("ya_enviado");
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0]).toMatchObject({ to: ["info@eternity.llc"] });
    const { data } = await db.from("avisos_diario").select("fecha").eq("proyecto_id", e.proyecto.id);
    expect(data).toEqual([{ fecha: "2026-11-09" }]);
  });

  it("a otra hora no manda ni guarda nada", async () => {
    expect((await enviarDiario(e.proyecto.id, new Date("2026-11-10T08:00:00Z"))).estado).toBe("fuera_de_hora");
    expect(recibidos).toHaveLength(1);
    expect((await db.from("avisos_diario").select("fecha").eq("proyecto_id", e.proyecto.id)).data).toHaveLength(1);
  });

  it("la ruta sin la clave del proyecto no hace nada", async () => {
    const llamar = (clave: string, proyectoId = e.proyecto.id) =>
      POST(new NextRequest(`http://localhost/api/avisos/diario/${proyectoId}`, { method: "POST", body: "{}", headers: { "x-eternity-secreto": clave } }), { params: Promise.resolve({ proyectoId }) } as never);
    expect((await llamar("mala")).status).toBe(401);
    expect((await llamar(secreto, "no-es-un-id")).status).toBe(404);
    expect(recibidos).toHaveLength(1);
  });
});
