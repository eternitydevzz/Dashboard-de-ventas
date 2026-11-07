// Ventana de «Agendado» como la maqueta (7c.3, Cristian 7 nov): calendario con las horas libres del closer de la
// rotación (su horario, sus citas, la duración, el aviso mínimo y el máximo del día, como libreA).
import { describe, expect, it } from "vitest";
import { huecosLibres } from "@/lib/huecos";
import { validarRotacion } from "@/lib/rotacion";

const zona = "Europe/Madrid";
const horario = { semana: { 1: [{ desde: "09:00", hasta: "11:00" }], 2: [{ desde: "16:00", hasta: "17:00" }] }, fechas: {} };
const ajustes = { duracion: 30, descanso: 0, aviso: 0, max_dia: null };
// Lunes 9 nov 2026, 08:00 en Madrid (07:00 UTC)
const ahora = new Date("2026-11-09T07:00:00Z");

describe("Huecos libres del closer", () => {
  it("cada 30 min dentro de su horario; sin horario ese día, nada", () => {
    const h = huecosLibres({ horario, ajustes, citas: [], ahora, zona, dias: 2 });
    expect(h).toEqual([
      { ymd: "2026-11-09", horas: ["09:00", "09:30", "10:00", "10:30"] },
      { ymd: "2026-11-10", horas: ["16:00", "16:30"] },
    ]);
  });
  it("quita las horas que se pisan con otra cita", () => {
    const h = huecosLibres({ horario, ajustes, citas: ["2026-11-09T09:00:00Z"], ahora, zona, dias: 1 }); // 10:00 Madrid
    expect(h[0].horas).toEqual(["09:00", "09:30", "10:30"]);
  });
  it("respeta el aviso mínimo y el máximo del día", () => {
    expect(huecosLibres({ horario, ajustes: { ...ajustes, aviso: 120 }, citas: [], ahora, zona, dias: 1 })[0].horas).toEqual(["10:00", "10:30"]);
    expect(huecosLibres({ horario, ajustes: { ...ajustes, max_dia: 1 }, citas: ["2026-11-09T08:00:00Z"], ahora, zona, dias: 1 })).toEqual([]);
  });
  it("sin horario puesto, ningún hueco", () => {
    expect(huecosLibres({ horario: null, ajustes, citas: [], ahora, zona, dias: 7 })).toEqual([]);
  });
});

describe("Rotación: los % de los closers", () => {
  it("suman 100 o todos a 0; cada uno de 0 a 100", () => {
    expect(validarRotacion({ a: 100, b: 0 })).toEqual({ a: 100, b: 0 });
    expect(validarRotacion({ a: 50.5, b: 49.5 })).toEqual({ a: 50.5, b: 49.5 });
    expect(validarRotacion({ a: 0, b: 0 })).toEqual({ a: 0, b: 0 });
    expect(() => validarRotacion({ a: 60, b: 30 })).toThrow(/suman 90/);
    expect(() => validarRotacion({ a: 120 })).toThrow(/0 a 100/);
  });
});
