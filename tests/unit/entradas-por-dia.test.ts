// Rediseño de Entradas (Cristian, 11 nov 2026): el gráfico pequeño de cada tarjeta = envíos por día de los últimos días.
import { describe, expect, it } from "vitest";
import { porDia } from "@/lib/entradas-panel";

const MAD = "Europe/Madrid";

describe("porDia: envíos de cada Entrada por día, del más antiguo a hoy", () => {
  it("cuenta cada día y deja a 0 los días sin envíos", () => {
    const m = porDia(
      [
        { entrada_id: "A", recibido_en: "2026-11-11T09:00:00Z" },
        { entrada_id: "A", recibido_en: "2026-11-11T20:00:00Z" },
        { entrada_id: "A", recibido_en: "2026-11-09T10:00:00Z" },
      ],
      3,
      "2026-11-11",
      MAD
    );
    expect(m.get("A")).toEqual([1, 0, 2]);
  });
  it("una Entrada sin envíos no sale (quien llama pone ceros)", () => {
    expect(porDia([], 3, "2026-11-11", MAD).get("B")).toBeUndefined();
  });
  it("un envío anterior a la ventana no cuenta", () => {
    expect(porDia([{ entrada_id: "A", recibido_en: "2026-11-06T10:00:00Z" }], 3, "2026-11-11", MAD).get("A")).toBeUndefined();
  });
  it("el día se cuenta en la hora del proyecto: las 23:30 UTC del 10 son ya el 11 en Madrid", () => {
    expect(porDia([{ entrada_id: "A", recibido_en: "2026-11-10T23:30:00Z" }], 2, "2026-11-11", MAD).get("A")).toEqual([0, 1]);
  });
});
