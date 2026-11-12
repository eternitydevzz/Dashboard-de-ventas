// 1.0 Bloque 1 (Cristian, 11 oct 2026): horario como GHL (varios tramos, días sueltos) y «libre a una hora».
import { describe, expect, it } from "vitest";
import { deplantilla, enHorario, horaEnOtraZona, horarioValido, resumenHorario, tramosDelDia, tramosValidos } from "@/lib/horarios";
import { AJUSTES_DEFECTO, ajustesDe, ajustesValidos, libreA } from "@/lib/disponibilidad";

const NY = "America/New_York";
// Lunes a viernes 09:00-13:00 y 14:00-18:00 (comer de 13 a 14); sábado 10-12; 24 dic solo 9-11; 25 dic libre
const h = horarioValido({
  semana: { 1: [{ desde: "14:00", hasta: "18:00" }, { desde: "09:00", hasta: "13:00" }], 2: [{ desde: "09:00", hasta: "13:00" }, { desde: "14:00", hasta: "18:00" }], 6: [{ desde: "10:00", hasta: "12:00" }] },
  fechas: { "2026-12-24": [{ desde: "09:00", hasta: "11:00" }], "2026-12-25": [] },
});
// Hora de Nueva York en octubre = UTC-4; en diciembre = UTC-5
const nyOct = (dia: number, hm: string) => new Date(`2026-10-${String(dia).padStart(2, "0")}T${hm}:00-04:00`);
const nyDic = (dia: number, hm: string) => new Date(`2026-12-${String(dia).padStart(2, "0")}T${hm}:00-05:00`);

describe("Horario con varios tramos y días sueltos", () => {
  it("ordena los tramos, une los que se pisan y rechaza los mal escritos", () => {
    expect(tramosValidos([{ desde: "14:00", hasta: "18:00" }, { desde: "09:00", hasta: "13:00" }, { desde: "12:00", hasta: "13:30" }])).toEqual([{ desde: "09:00", hasta: "13:30" }, { desde: "14:00", hasta: "18:00" }]);
    expect(tramosValidos([{ desde: "18:00", hasta: "09:00" }])).toBeNull();
    expect(tramosValidos([{ desde: "9:00", hasta: "10:00" }])).toBeNull();
    expect(tramosValidos([{ desde: "22:00", hasta: "24:00" }])).toEqual([{ desde: "22:00", hasta: "24:00" }]);
    expect(horarioValido({ semana: {}, fechas: {} })).toBeNull(); // sin ningún tramo = sin horario
    expect(horarioValido({ semana: { 8: [{ desde: "09:00", hasta: "10:00" }] } })).toBeNull();
    expect(horarioValido({ semana: { 1: [{ desde: "09:00", hasta: "10:00" }] }, fechas: { "24/12": [] } })).toBeNull();
  });
  it("el hueco entre tramos es descanso; el sábado tiene su horario; el domingo es libre", () => {
    expect(enHorario(h, nyOct(12, "10:00"), NY)).toBe(true); // lunes
    expect(enHorario(h, nyOct(12, "13:30"), NY)).toBe(false); // lunes, comiendo
    expect(enHorario(h, nyOct(12, "14:00"), NY)).toBe(true);
    expect(enHorario(h, nyOct(12, "18:00"), NY)).toBe(false);
    expect(enHorario(h, nyOct(14, "10:00"), NY)).toBe(false); // miércoles: no trabaja
    expect(enHorario(h, nyOct(17, "11:00"), NY)).toBe(true); // sábado
    expect(enHorario(h, nyOct(18, "11:00"), NY)).toBe(false); // domingo
  });
  it("las fechas sueltas mandan sobre la semana: 24 dic (jueves) solo de 9 a 11; 25 dic libre", () => {
    expect(tramosDelDia(h, "2026-12-24", 4)).toEqual([{ desde: "09:00", hasta: "11:00" }]);
    expect(enHorario(h, nyDic(22, "10:00"), NY)).toBe(true); // martes normal
    expect(enHorario(h, nyDic(25, "10:00"), NY)).toBe(false); // viernes 25: libre
  });
  it("botones rápidos (de lunes a viernes) y resumen en una línea", () => {
    expect(deplantilla("manana")?.semana[1]).toEqual([{ desde: "09:00", hasta: "13:00" }]);
    expect(deplantilla("tarde")?.semana[6]).toBeUndefined();
    expect(resumenHorario(deplantilla("todo"))).toBe("L-V 09:00–18:00");
    expect(resumenHorario(h)).toBe("L-M 09:00–13:00, 14:00–18:00 · S 10:00–12:00");
    expect(resumenHorario(null)).toBe("Sin horario");
  });
  it("la hora de quien mira: 10:00 de Nueva York son las 16:00 en Madrid (en octubre)", () => {
    expect(horaEnOtraZona("10:00", "2026-10-12", NY, "Europe/Madrid")).toBe("16:00");
    expect(horaEnOtraZona("20:00", "2026-10-12", NY, "Europe/Madrid")).toBe("02:00 (+1 día)");
    expect(horaEnOtraZona("10:00", "2026-10-12", NY, NY)).toBeNull(); // misma zona: no se repite
  });
  // 12 nov 2026: al borrar una hora con la tecla de borrar el campo queda vacío y el onboarding entero se rompía
  it("con la hora a medio escribir o una zona que el navegador no reconoce, no hay «tu hora» (y no se rompe)", () => {
    expect(horaEnOtraZona("", "2026-10-12", NY, "Europe/Madrid")).toBeNull();
    expect(horaEnOtraZona("10:00", "2026-10-12", NY, "Etc/Unknown")).toBeNull();
  });
});

describe("¿Libre a una hora? (como un calendario de GHL)", () => {
  const ahora = nyOct(12, "08:00"); // lunes 8:00
  const base = { horario: h, ajustes: AJUSTES_DEFECTO, citas: [] as string[], ahora, zona: NY };
  it("libre dentro de su horario, con la llamada entera dentro del tramo", () => {
    expect(libreA({ ...base, inicio: nyOct(12, "09:00") })).toEqual({ libre: true });
    expect(libreA({ ...base, inicio: nyOct(12, "12:30") })).toEqual({ libre: true }); // acaba justo a las 13:00
    expect(libreA({ ...base, inicio: nyOct(12, "12:45") })).toEqual({ libre: false, motivo: "fuera_horario" }); // se come el descanso
    expect(libreA({ ...base, inicio: nyOct(14, "10:00") })).toEqual({ libre: false, motivo: "fuera_horario" }); // miércoles
    expect(libreA({ ...base, horario: null, inicio: nyOct(12, "10:00") })).toEqual({ libre: false, motivo: "fuera_horario" });
  });
  it("no se pisa con otra cita, contando la duración y el descanso tras cada llamada", () => {
    const citas = [nyOct(12, "10:00").toISOString()];
    expect(libreA({ ...base, citas, inicio: nyOct(12, "10:00") })).toEqual({ libre: false, motivo: "ocupado" });
    expect(libreA({ ...base, citas, inicio: nyOct(12, "10:15") })).toEqual({ libre: false, motivo: "ocupado" });
    expect(libreA({ ...base, citas, inicio: nyOct(12, "09:30") })).toEqual({ libre: true }); // acaba a las 10:00
    expect(libreA({ ...base, citas, inicio: nyOct(12, "10:30") })).toEqual({ libre: true });
    const conDescanso = { ...AJUSTES_DEFECTO, descanso: 15 };
    expect(libreA({ ...base, ajustes: conDescanso, citas, inicio: nyOct(12, "10:30") })).toEqual({ libre: false, motivo: "ocupado" });
    expect(libreA({ ...base, ajustes: conDescanso, citas, inicio: nyOct(12, "10:45") })).toEqual({ libre: true });
    expect(libreA({ ...base, ajustes: conDescanso, citas, inicio: nyOct(12, "09:30") })).toEqual({ libre: false, motivo: "ocupado" }); // su descanso choca
  });
  it("aviso mínimo y máximo de llamadas por día", () => {
    const aviso = { ...AJUSTES_DEFECTO, aviso: 120 };
    expect(libreA({ ...base, ajustes: aviso, inicio: nyOct(12, "09:30") })).toEqual({ libre: false, motivo: "aviso" });
    expect(libreA({ ...base, ajustes: aviso, inicio: nyOct(12, "10:00") })).toEqual({ libre: true });
    expect(libreA({ ...base, inicio: nyOct(12, "07:00") })).toEqual({ libre: false, motivo: "aviso" }); // en el pasado
    const max2 = { ...AJUSTES_DEFECTO, max_dia: 2 };
    const dos = [nyOct(12, "09:00").toISOString(), nyOct(12, "15:00").toISOString(), nyOct(13, "09:00").toISOString()];
    expect(libreA({ ...base, ajustes: max2, citas: dos, inicio: nyOct(12, "11:00") })).toEqual({ libre: false, motivo: "maximo" });
    expect(libreA({ ...base, ajustes: max2, citas: dos, inicio: nyOct(13, "11:00") })).toEqual({ libre: true }); // el martes solo tiene 1
  });
  it("ajustes: por defecto 30 min; los del closer mandan sobre los del proyecto", () => {
    expect(ajustesValidos(null)).toEqual({ duracion: 30, descanso: 0, aviso: 0, max_dia: null });
    expect(ajustesValidos({ duracion: 2, descanso: -1, max_dia: 0 })).toEqual(AJUSTES_DEFECTO); // fuera de rango: el de base
    const proyecto = { duracion: 45, descanso: 10, aviso: 60, max_dia: 8 };
    expect(ajustesDe(proyecto, null)).toEqual(proyecto);
    expect(ajustesDe(proyecto, { duracion: 60, descanso: 0, aviso: 0, max_dia: null })).toEqual({ duracion: 60, descanso: 0, aviso: 0, max_dia: null });
  });
});
