// Plan GHL, fase 3 (16 oct): la dirección que llama el programador de Supabase cada 30 s.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { crearEscenario, borrarEscenario, db, type Escenario } from "../apoyo/escenario";
import { POST } from "@/app/api/ghl/leer/[proyectoId]/route";

let e: Escenario;
let secreto: string;
beforeAll(async () => {
  e = await crearEscenario();
  secreto = (await db.from("proyectos").select("webhook_secreto").eq("id", e.proyecto.id).single()).data!.webhook_secreto;
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

function leer(clave = secreto, proyectoId = e.proyecto.id) {
  const req = new NextRequest(`http://localhost/api/ghl/leer/${proyectoId}`, { method: "POST", body: "{}", headers: { "content-type": "application/json", "x-eternity-secreto": clave } });
  return POST(req, { params: Promise.resolve({ proyectoId }) } as never);
}

describe("Leer GHL (programador cada 30 s)", () => {
  it("sin la clave del proyecto no hace nada", async () => {
    expect((await leer("mala")).status).toBe(401);
    expect((await leer(secreto, "00000000-0000-0000-0000-000000000000")).status).toBe(401);
    expect((await leer(secreto, "no-es-un-id")).status).toBe(404);
  });

  it("con la clave lanza la lectura (aquí sin GHL conectado: error genérico, sin detalles) y no deja otra en 25 s", async () => {
    const r = await leer();
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, error: "No se pudo leer GHL" });
    const otra = await leer();
    expect(otra.status).toBe(200);
    expect(await otra.json()).toEqual({ ok: true, saltada: true });
  });
});
