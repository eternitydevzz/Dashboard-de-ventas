// D43: la hora que escribe quien agenda se lee en su zona y se envía en hora del proyecto (Nueva York)
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(panel)/leads/agenda", () => ({ consultarAgenda: vi.fn() }));
vi.mock("@/app/(panel)/leads/acciones", () => ({ zonasDeAgendar: vi.fn() }));
import { aHoraProyecto } from "@/components/campos-cita";

const NY = "America/New_York";

describe("aHoraProyecto", () => {
  it("un closer de México escribe 10:00 → 11:00 de Nueva York (invierno)", () => {
    expect(aHoraProyecto("2026-12-01T10:00", "America/Mexico_City", NY)).toBe("2026-12-01T11:00");
  });
  it("España de noche cambia de día en Nueva York", () => {
    expect(aHoraProyecto("2026-12-01T03:00", "Europe/Madrid", NY)).toBe("2026-11-30T21:00");
  });
  it("en la misma zona no cambia (jefes)", () => {
    expect(aHoraProyecto("2026-07-15T16:30", NY, NY)).toBe("2026-07-15T16:30");
  });
  it("respeta el cambio de hora de cada zona (verano en NY, Bogotá sin cambio)", () => {
    expect(aHoraProyecto("2026-07-15T10:00", "America/Bogota", NY)).toBe("2026-07-15T11:00");
    expect(aHoraProyecto("2026-01-15T10:00", "America/Bogota", NY)).toBe("2026-01-15T10:00");
  });
  it("a medio escribir → vacío", () => {
    expect(aHoraProyecto("2026-12-01T", "America/Bogota", NY)).toBe("");
    expect(aHoraProyecto("", "America/Bogota", NY)).toBe("");
  });
});
