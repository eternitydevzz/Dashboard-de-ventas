import { describe, expect, it } from "vitest";
import { elegirCloserParaCaller } from "@/lib/rotacion";
import { entraEnMercado } from "@/lib/mercado";

// Cristian (13 nov 2026): lo que agenda un caller de España va solo a closers de España
const closers = [
  { perfil_id: "thiago", rotacion_pct: 60, rotacion_cuenta: 0, paises_closer: [], mercado: "latam" },
  { perfil_id: "facu", rotacion_pct: 0, rotacion_cuenta: 0, paises_closer: ["AR"], mercado: null },
  { perfil_id: "lucia", rotacion_pct: 20, rotacion_cuenta: 5, paises_closer: [], mercado: "es" },
  { perfil_id: "pablo", rotacion_pct: 20, rotacion_cuenta: 1, paises_closer: ["IT"], mercado: "es" },
];

describe("elegirCloserParaCaller", () => {
  it("caller de España → solo closers de España (país del lead primero, si no la rotación)", () => {
    expect(elegirCloserParaCaller(closers, "IT", "es")).toBe("pablo");
    expect(elegirCloserParaCaller(closers, "ES", "es")).toBe("pablo"); // 1/20 < 5/20
    expect(elegirCloserParaCaller(closers, "AR", "es")).toBe("pablo"); // facu es de Latam: no entra
  });

  it("caller de Latam o sin mercado → como hasta ahora (entre todos)", () => {
    expect(elegirCloserParaCaller(closers, "AR", "latam")).toBe("facu");
    expect(elegirCloserParaCaller(closers, null, null)).toBe("thiago");
    expect(elegirCloserParaCaller(closers, "IT", null)).toBe("pablo");
  });

  it("sin closers de España en la rotación → error claro para el caller", () => {
    const soloLatam = closers.filter((c) => c.mercado !== "es");
    expect(() => elegirCloserParaCaller(soloLatam, "ES", "es")).toThrow("No hay closers de España en la rotación: avisa a tu director.");
    // De España pero al 0 % y sin su país: tampoco
    const alCero = [...soloLatam, { perfil_id: "lucia", rotacion_pct: 0, rotacion_cuenta: 0, paises_closer: [], mercado: "es" }];
    expect(() => elegirCloserParaCaller(alCero, "ES", "es")).toThrow(/closers de España/);
  });
});

describe("entraEnMercado", () => {
  const m = { a: "es" as const, b: "latam" as const };
  it("sin filtro entran todos; sin mercado = Latam", () => {
    expect(entraEnMercado(m, "a", null)).toBe(true);
    expect(entraEnMercado(m, "a", "es")).toBe(true);
    expect(entraEnMercado(m, "b", "es")).toBe(false);
    expect(entraEnMercado(m, "c", "latam")).toBe(true);
    expect(entraEnMercado(m, null, "es")).toBe(false);
  });
});
