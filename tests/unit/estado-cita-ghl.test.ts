// Encargo de Callers (C11 punto 15 y F21, con el OK de Cristian, 7 nov 2026): qué le pasa al lead cuando llega una cita
// de GHL (webhook o lectura de cada minuto). Vendido no se toca; confirma agenda o descartado → «reagendado» + etiqueta.
import { describe, expect, it } from "vitest";
import { ETIQUETA_REAGENDADO, estadoTrasCitaGhl } from "@/lib/estado-cita-ghl";

describe("estadoTrasCitaGhl", () => {
  it("vendido: no se toca (ni estado ni etiqueta)", () => {
    expect(estadoTrasCitaGhl("vendido")).toBeNull();
  });
  it("confirma agenda o descartado: reagendado, con su etiqueta", () => {
    expect(estadoTrasCitaGhl("confirma_agenda")).toEqual({ estado: "reagendado", etiqueta: ETIQUETA_REAGENDADO });
    expect(estadoTrasCitaGhl("descartado")).toEqual({ estado: "reagendado", etiqueta: ETIQUETA_REAGENDADO });
    expect(ETIQUETA_REAGENDADO).toBe("Reagendado");
  });
  it("el resto (y sin estado): agendado, sin etiqueta", () => {
    for (const x of ["nuevo", "link_enviado", "wsp_enviado", "no_responde", "no_interesa", "seguimiento", "llamar_luego", "agendado", "reagendado", null, undefined])
      expect(estadoTrasCitaGhl(x)).toEqual({ estado: "agendado", etiqueta: null });
  });
});
