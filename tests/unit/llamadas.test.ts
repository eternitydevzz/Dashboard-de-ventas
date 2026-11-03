import { describe, expect, it } from "vitest";
import { celdasMes, coincide, diaEnZona, enPostcall, esPrecall, porRecuperar, quienLlevaba, ventasPostcall } from "@/lib/llamadas";

const ahora = new Date("2026-10-09T15:00:00Z").getTime();
const c = (estado: string, fecha: string) => ({ id: estado + fecha, lead_id: "L", estado, fecha });

describe("pestañas de Llamadas", () => {
  it("pre-call: abiertas y no califica que aún no han pasado", () => {
    expect(esPrecall(c("pendiente", "2026-10-10T10:00:00Z"), ahora)).toBe(true);
    expect(esPrecall(c("confirmacion_pendiente", "2026-10-10T10:00:00Z"), ahora)).toBe(true);
    expect(esPrecall(c("no_califica", "2026-10-10T10:00:00Z"), ahora)).toBe(true);
    expect(esPrecall(c("pendiente", "2026-10-08T10:00:00Z"), ahora)).toBe(false); // ya pasó → post-call
    expect(esPrecall(c("cerrada", "2026-10-10T10:00:00Z"), ahora)).toBe(false);
  });
  it("post-call por estado", () => {
    expect(enPostcall(c("confirmada", "2026-10-08T10:00:00Z"), "pendientes", ahora)).toBe(true);
    expect(enPostcall(c("confirmada", "2026-10-10T10:00:00Z"), "pendientes", ahora)).toBe(false);
    expect(enPostcall(c("no_show", "2026-10-08T10:00:00Z"), "no_show", ahora)).toBe(true);
    expect(enPostcall(c("reagendada", "2026-10-08T10:00:00Z"), "reagendadas", ahora)).toBe(true);
    expect(ventasPostcall([{ id: "1", lead_id: "L", tipo_pago: "reserva", pendiente: 1497 }, { id: "2", lead_id: "L", tipo_pago: "reserva", pendiente: 0 }], "reserva")).toHaveLength(1);
  });
  it("calendario: octubre de 2026 empieza en jueves y tiene 31 días", () => {
    const cel = celdasMes("2026-10-15");
    expect(cel.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(cel.filter(Boolean)).toHaveLength(31);
    expect(cel.length % 7).toBe(0);
  });
  it("el día se cuenta en la hora del proyecto", () => {
    expect(diaEnZona("2026-10-10T02:00:00Z", "America/New_York")).toBe("2026-10-09");
    expect(diaEnZona("2026-10-10T02:00:00Z", "Europe/Madrid")).toBe("2026-10-10");
  });
  it("Cerradas (Paso H6): solo las ventas pagadas del todo y vendidas desde el día 1 del mes", () => {
    const v = (id: string, pendiente: number, fecha: string, tipo_pago = "completo") => ({ id, lead_id: "L", tipo_pago, pendiente, fecha });
    const inicio = Date.parse("2026-10-01T04:00:00Z");
    const lista = [v("pagada", 0, "2026-10-05T15:00:00Z"), v("reserva", 1497, "2026-10-05T15:00:00Z", "reserva"), v("septiembre", 0, "2026-09-20T15:00:00Z"), v("reserva-pagada", 0, "2026-10-06T15:00:00Z", "reserva")];
    expect(ventasPostcall(lista, "cerradas", inicio).map((x) => x.id)).toEqual(["pagada", "reserva-pagada"]);
    expect(ventasPostcall(lista, "reserva").map((x) => x.id)).toEqual(["reserva"]); // la pagada ya no está en Reserva
  });
  it("buscar por nombre sin acentos o por teléfono con otro formato", () => {
    expect(coincide("adrian vargas", "Adrián Vargas Jiménez", null)).toBe(true);
    expect(coincide("595 961", "Otro", "+595961103570")).toBe(true);
    expect(coincide("pepe", "Adrián", "a@b.c")).toBe(false);
  });
});

// 3 nov (Cristian): citas sin closer del equipo, en rojo hasta tener resultado
describe("citas sin closer del equipo", () => {
  const nombre = (id: string | null) => (id === "J" ? "Junior" : "—");
  it("en rojo solo si no tiene closer y está abierta", () => {
    expect(porRecuperar({ closer_id: null, estado: "confirmada" })).toBe(true);
    expect(porRecuperar({ closer_id: null, closer_antes: "Felipe", estado: "pendiente" })).toBe(true);
    expect(porRecuperar({ closer_id: null, estado: "cancelada" })).toBe(false); // ya tiene resultado
    expect(porRecuperar({ closer_id: null, estado: "cerrada" })).toBe(false);
    expect(porRecuperar({ closer_id: "J", estado: "confirmada" })).toBe(false);
  });
  it("quién la llevaba", () => {
    expect(quienLlevaba({ closer_id: "J", estado: "confirmada" }, nombre)).toBe("Junior");
    expect(quienLlevaba({ closer_id: null, closer_antes: "Felipe Gaspar Fernández", estado: "perdida" }, nombre)).toBe("Felipe Gaspar Fernández (ya no está)");
    expect(quienLlevaba({ closer_id: null, closer_antes: null, estado: "confirmada" }, nombre)).toBe("Sin llamar");
  });
});
