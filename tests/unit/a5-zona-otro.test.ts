import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ZONAS, horaEnZona, paisValido, todasLasZonas, zonaValida } from "@/app/(panel)/perfil/foto-zona";

// A5 (17 nov 2026): «Otro» en la zona horaria de cada caller y closer. Datos inventados.
const SEIS = ["America/Bogota", "America/Mexico_City", "America/Chicago", "America/New_York", "America/Argentina/Buenos_Aires", "Europe/Madrid"];

describe("zonaValida con «Otro»", () => {
  it("las 6 de siempre pasan", () => {
    for (const z of SEIS) expect(zonaValida(z)).toBe(z);
    expect(ZONAS.map((z) => z.v)).toEqual(SEIS);
  });
  it("una zona real fuera de las 6 pasa", () => {
    expect(zonaValida("America/Lima")).toBe("America/Lima");
  });
  it("lo que no es una zona no pasa", () => {
    expect(zonaValida("Marte/Base")).toBeNull();
    expect(zonaValida("")).toBeNull();
    expect(zonaValida(5)).toBeNull();
  });
});

describe("horaEnZona", () => {
  it("HH:MM en 24 h", () => {
    expect(horaEnZona("Europe/Madrid", new Date("2026-11-17T20:00:00Z"))).toBe("21:00");
    expect(horaEnZona("America/New_York", new Date("2026-11-18T02:00:00Z"))).toBe("21:00");
  });
});

describe("paisValido", () => {
  it("recorta y deja de 1 a 80 caracteres", () => {
    expect(paisValido("  Perú ")).toBe("Perú");
    expect(paisValido("x".repeat(81))).toBeNull();
  });
});

describe("todasLasZonas", () => {
  it("incluye las 6 aunque el sistema no las liste", () => {
    const todas = todasLasZonas();
    for (const z of SEIS) expect(todas).toContain(z);
  });
});

describe("paso de entrada", () => {
  it("ofrece «Otro»", () => {
    expect(readFileSync("src/app/onboarding/zona/page.tsx", "utf8")).toContain("Otro");
  });
});
