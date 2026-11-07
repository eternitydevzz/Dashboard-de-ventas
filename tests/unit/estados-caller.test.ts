// C11 (plan Callers, 7 nov): 12 columnas del pipeline «Callers», una por estado, y sus reglas.
import { describe, expect, it } from "vitest";
import { ESTADOS_CALLER, BOTONES_RESULTADO, AVANZAN, CON_ESTRELLAS, esContacto, etiquetaEstado } from "@/lib/estados-caller";

describe("C11 · estados del caller", () => {
  it("12 columnas en el orden decidido (punto 12)", () => {
    expect(ESTADOS_CALLER.map((e) => e.t)).toEqual(["Leads", "Llamado", "Wsp enviado", "No responde", "No interesa", "Seguimiento", "Llamar luego", "Agendado", "Confirma Agenda", "Reagendado", "Descartado", "Cerrados"]);
    expect(ESTADOS_CALLER.map((e) => e.v)).not.toContain("no_contesta");
    expect(ESTADOS_CALLER.map((e) => e.v)).not.toContain("link_enviado");
  });
  it("9 botones de resultado (7c.1): sin Leads, Reagendado ni Cerrados", () => {
    expect(BOTONES_RESULTADO).toEqual(["llamado", "wsp_enviado", "no_responde", "no_interesa", "seguimiento", "llamar_luego", "agendado", "confirma_agenda", "descartado"]);
  });
  it("contacto = los que avanzan (punto 16); Llamado, Wsp enviado y No responde no cuentan", () => {
    expect([...AVANZAN].sort()).toEqual(["agendado", "confirma_agenda", "llamar_luego", "no_interesa", "reagendado", "seguimiento", "vendido"]);
    expect(esContacto({ tipo: "cambio_etapa", resultado: "seguimiento" })).toBe(true);
    expect(esContacto({ tipo: "llamada", resultado: "llamado" })).toBe(false);
    expect(esContacto({ tipo: "whatsapp", resultado: "wsp_enviado" })).toBe(false);
    expect(esContacto({ tipo: "cambio_etapa", resultado: "no_responde" })).toBe(false);
    expect(esContacto({ tipo: "cambio_etapa", resultado: null })).toBe(false); // mover a mano en el CRM
  });
  it("historial de antes del 7 nov: una llamada contestada sigue contando como contacto", () => {
    expect(esContacto({ tipo: "llamada", resultado: "llamar_luego" })).toBe(true);
    expect(esContacto({ tipo: "llamada", resultado: "no_contesta" })).toBe(false);
  });
  it("piden estrellas como hoy (Cristian, 7 nov): Llamar luego, No interesa, Seguimiento y Agendado", () => {
    expect([...CON_ESTRELLAS].sort()).toEqual(["agendado", "llamar_luego", "no_interesa", "seguimiento"]);
  });
  it("nombres: también los estados viejos del historial", () => {
    expect(etiquetaEstado("confirma_agenda")).toBe("Confirma Agenda");
    expect(etiquetaEstado("no_contesta")).toBe("No contesta");
    expect(etiquetaEstado("raro")).toBe("raro");
  });
});
