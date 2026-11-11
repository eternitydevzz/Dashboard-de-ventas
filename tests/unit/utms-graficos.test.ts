// Rediseño de KPIs → UTMs (maqueta v1, Cristian 11 nov 2026): leads por día, el corte del pico y el ranking de campañas.
import { describe, expect, it } from "vitest";
import { corteGrafico, filaUtm, porDiaUtm, rankingCampanas, type FilaUtm } from "@/lib/utms";

const MAD = "Europe/Madrid";
const fila = (alta: string, campaign = "", marcas = 0): FilaUtm =>
  filaUtm({ id: alta + campaign, nombre: "x", apellido: null, creado_en: alta, etiquetas: [], seguimiento: campaign ? { utm_campaign: campaign } : {} }, undefined, marcas);

describe("porDiaUtm: leads por día en la hora del proyecto, con los días vacíos a 0", () => {
  it("cuenta cada día del rango", () => {
    const filas = [fila("2026-11-09T10:00:00Z"), fila("2026-11-09T18:00:00Z"), fila("2026-11-11T08:00:00Z")];
    const p = porDiaUtm(filas, Date.parse("2026-11-08T23:00:00Z"), Date.parse("2026-11-11T23:00:00Z"), MAD);
    expect(p).toEqual([
      { d: "09/11", n: 2 },
      { d: "10/11", n: 0 },
      { d: "11/11", n: 1 },
    ]);
  });
  it("sin desde, empieza el día del primer lead", () => {
    const p = porDiaUtm([fila("2026-11-10T10:00:00Z")], null, Date.parse("2026-11-11T23:00:00Z"), MAD);
    expect(p.map((x) => x.d)).toEqual(["10/11", "11/11"]);
  });
  it("sin leads no hay puntos", () => {
    expect(porDiaUtm([], null, Date.parse("2026-11-11T23:00:00Z"), MAD)).toEqual([]);
  });
});

describe("corteGrafico: dónde cortar un pico que aplasta el resto (decisión de Cristian, 11 nov 2026)", () => {
  it("un día con más del triple que el segundo se corta un 15 % por encima del segundo", () => {
    expect(corteGrafico([10, 12, 2182, 9])).toBe(14);
  });
  it("sin pico, no se corta", () => {
    expect(corteGrafico([10, 12, 13])).toBeNull();
    expect(corteGrafico([5])).toBeNull();
    expect(corteGrafico([])).toBeNull();
  });
});

describe("rankingCampanas: de más a menos, sin «Sin dato» (va aparte)", () => {
  it("ordena y calcula el % sobre los que tienen campaña", () => {
    const filas = [fila("2026-11-01T10:00:00Z", "A"), fila("2026-11-02T10:00:00Z", "A"), fila("2026-11-03T10:00:00Z", "A"), fila("2026-11-04T10:00:00Z", "B"), fila("2026-11-05T10:00:00Z"), fila("2026-11-06T10:00:00Z")];
    expect(rankingCampanas(filas, 3)).toEqual([
      { t: "A", n: 3, pct: 75 },
      { t: "B", n: 1, pct: 25 },
    ]);
  });
  it("corta en `max`", () => {
    const filas = ["A", "A", "B", "C"].map((c, i) => fila(`2026-11-0${i + 1}T10:00:00Z`, c));
    expect(rankingCampanas(filas, 1).map((x) => x.t)).toEqual(["A"]);
  });
});

describe("filaUtm guarda las marcas del embudo (para el embudo por utm_source)", () => {
  it("sin marcas, 0", () => {
    expect(fila("2026-11-01T10:00:00Z").marcas).toBe(0);
    expect(fila("2026-11-01T10:00:00Z", "A", 5).marcas).toBe(5);
  });
});
