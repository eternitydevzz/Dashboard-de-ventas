// Cristian (10 nov 2026): cambiar el closer o borrar una cita también en GHL. Según la especificación oficial
// (apps/calendars.json): PUT /calendars/events/appointments/{id} y DELETE /calendars/events/{id}, Version 2021-04-15.
import { describe, expect, it } from "vitest";
import { borrarCitaGhl, cambiarUsuarioCitaGhl } from "@/lib/ghl";

function falso(status: number, cuerpo: unknown = {}) {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    return new Response(JSON.stringify(cuerpo), { status });
  }) as unknown as typeof fetch;
  return { f, llamadas };
}

describe("cambiarUsuarioCitaGhl", () => {
  it("manda assignedUserId e ignoreFreeSlotValidation con PUT a la cita", async () => {
    const { f, llamadas } = falso(200, { id: "c1" });
    await cambiarUsuarioCitaGhl({ token: "tok", citaId: "c 1", usuarioId: "usr", fetchImpl: f });
    expect(llamadas[0].url).toBe("https://services.leadconnectorhq.com/calendars/events/appointments/c%201");
    expect(llamadas[0].init.method).toBe("PUT");
    expect((llamadas[0].init.headers as Record<string, string>).Version).toBe("2021-04-15");
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({ assignedUserId: "usr", ignoreFreeSlotValidation: true });
  });
  it("si GHL falla, lanza (la app no cambia)", async () => {
    const { f } = falso(400, { message: "malo" });
    await expect(cambiarUsuarioCitaGhl({ token: "tok", citaId: "c1", usuarioId: "u", fetchImpl: f })).rejects.toThrow("GHL respondió 400: malo");
  });
});

describe("borrarCitaGhl", () => {
  it("DELETE con cuerpo {} y devuelve true", async () => {
    const { f, llamadas } = falso(201, { succeeded: true });
    expect(await borrarCitaGhl({ token: "tok", citaId: "c1", fetchImpl: f })).toBe(true);
    expect(llamadas[0].url).toBe("https://services.leadconnectorhq.com/calendars/events/c1");
    expect(llamadas[0].init.method).toBe("DELETE");
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({});
  });
  it("404 = ya no está en GHL: devuelve false sin lanzar", async () => {
    const { f } = falso(404, { message: "not found" });
    expect(await borrarCitaGhl({ token: "tok", citaId: "c1", fetchImpl: f })).toBe(false);
  });
  it("400 «already been deleted» (lo que GHL contesta de verdad) = ya no está: devuelve false", async () => {
    const { f } = falso(400, { message: "The event id is invalid or it has already been deleted." });
    expect(await borrarCitaGhl({ token: "tok", citaId: "c1", fetchImpl: f })).toBe(false);
  });
  it("otro 400 lanza", async () => {
    const { f } = falso(400, { message: "algo distinto" });
    await expect(borrarCitaGhl({ token: "tok", citaId: "c1", fetchImpl: f })).rejects.toThrow("GHL respondió 400");
  });
  it("otro error lanza", async () => {
    const { f } = falso(401);
    await expect(borrarCitaGhl({ token: "tok", citaId: "c1", fetchImpl: f })).rejects.toThrow("calendars/events.write");
  });
});
