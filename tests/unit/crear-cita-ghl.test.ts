// Encargo de Callers (C11 punto 13, con el OK de Cristian, 7 nov 2026): crear la cita también en el calendario de GHL.
// La llamada, según la especificación oficial (apps/calendars.json): POST /calendars/events/appointments, Version
// 2021-04-15, obligatorios calendarId, locationId, contactId y startTime; permiso calendars/events.write; devuelve `id`.
import { describe, expect, it } from "vitest";
import { crearCitaGhl } from "@/lib/ghl";

function falso(respuesta: { status: number; cuerpo: unknown }) {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    return new Response(JSON.stringify(respuesta.cuerpo), { status: respuesta.status });
  }) as unknown as typeof fetch;
  return { f, llamadas };
}

describe("crearCitaGhl", () => {
  it("manda lo obligatorio, la hora de fin (inicio + minutos), el closer y devuelve el id", async () => {
    const { f, llamadas } = falso({ status: 201, cuerpo: { id: "cita-123", calendarId: "cal" } });
    const id = await crearCitaGhl({ token: "tok", locationId: "loc", calendarId: "cal", contactId: "con", inicio: new Date("2026-12-03T15:00:00Z"), minutos: 30, titulo: "Llamada con Ana", usuarioId: "usr", fetchImpl: f });
    expect(id).toBe("cita-123");
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe("https://services.leadconnectorhq.com/calendars/events/appointments");
    expect(llamadas[0].init.method).toBe("POST");
    expect((llamadas[0].init.headers as Record<string, string>).Version).toBe("2021-04-15");
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({
      calendarId: "cal",
      locationId: "loc",
      contactId: "con",
      startTime: "2026-12-03T15:00:00.000Z",
      endTime: "2026-12-03T15:30:00.000Z",
      title: "Llamada con Ana",
      appointmentStatus: "confirmed",
      assignedUserId: "usr",
    });
  });
  it("sin usuario del closer no manda assignedUserId; los avisos de GHL no se apagan (sin toNotify)", async () => {
    const { f, llamadas } = falso({ status: 201, cuerpo: { id: "x" } });
    await crearCitaGhl({ token: "tok", locationId: "loc", calendarId: "cal", contactId: "con", inicio: new Date("2026-12-03T15:00:00Z"), minutos: 45, titulo: "t", fetchImpl: f });
    const b = JSON.parse(String(llamadas[0].init.body));
    expect(b).not.toHaveProperty("assignedUserId");
    expect(b).not.toHaveProperty("toNotify");
    expect(b.endTime).toBe("2026-12-03T15:45:00.000Z");
  });
  it("sin permiso lo dice (calendars/events.write); sin id, error", async () => {
    await expect(crearCitaGhl({ token: "t", locationId: "l", calendarId: "c", contactId: "x", inicio: new Date(), minutos: 30, titulo: "t", fetchImpl: falso({ status: 401, cuerpo: {} }).f })).rejects.toThrow(/calendars\/events\.write/);
    await expect(crearCitaGhl({ token: "t", locationId: "l", calendarId: "c", contactId: "x", inicio: new Date(), minutos: 30, titulo: "t", fetchImpl: falso({ status: 201, cuerpo: {} }).f })).rejects.toThrow(/id/);
  });
});
