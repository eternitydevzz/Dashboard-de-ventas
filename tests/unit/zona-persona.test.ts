import { describe, expect, it } from "vitest";
import { huecosEnZona, nombreZona, zonaPersona } from "@/lib/zona-persona";
import { localAIso } from "@/lib/formato";

// N2 (Cristian, 13 nov 2026). Datos inventados.
const NY = { zona_horaria: "America/New_York" };

describe("zonaPersona", () => {
  it("caller y closer con zona puesta: la suya", () => {
    expect(zonaPersona({ rol: "caller", zona_horaria: "Europe/Madrid" }, NY)).toBe("Europe/Madrid");
    expect(zonaPersona({ rol: "closer", zona_horaria: "America/Bogota" }, NY)).toBe("America/Bogota");
  });
  it("sin elegir, sin columna o con un valor raro: la del proyecto", () => {
    expect(zonaPersona({ rol: "caller", zona_horaria: null }, NY)).toBe("America/New_York");
    expect(zonaPersona({ rol: "closer" }, NY)).toBe("America/New_York");
    expect(zonaPersona({ rol: "caller", zona_horaria: "Asia/Tokyo" }, NY)).toBe("America/New_York");
  });
  it("los jefes, como hoy: la del proyecto aunque tengan zona", () => {
    expect(zonaPersona({ rol: "ceo", zona_horaria: "Europe/Madrid" }, NY)).toBe("America/New_York");
    expect(zonaPersona({ rol: "director", zona_horaria: "Europe/Madrid" }, NY)).toBe("America/New_York");
  });
});

describe("nombreZona", () => {
  it("nombre corto de las 6 zonas y la zona tal cual si no es una de ellas", () => {
    expect(nombreZona("Europe/Madrid")).toBe("España");
    expect(nombreZona("America/New_York")).toBe("Nueva York");
    expect(nombreZona("Asia/Tokyo")).toBe("Asia/Tokyo");
  });
});

describe("guardar la hora de quien agenda", () => {
  it("caller en Madrid reagenda a las 17:00 del 20 nov → 16:00 UTC", () => {
    const zona = zonaPersona({ rol: "caller", zona_horaria: "Europe/Madrid" }, NY);
    expect(localAIso("2026-11-20T17:00", zona)).toBe("2026-11-20T16:00:00.000Z");
  });
});

describe("huecosEnZona", () => {
  const dias = [{ ymd: "2026-11-20", horas: ["11:00", "19:00"] }];
  it("enseña la hora de Madrid y envía la del proyecto (17:00 Madrid = 11:00 NY = 16:00 UTC)", () => {
    const r = huecosEnZona(dias, "America/New_York", "Europe/Madrid");
    expect(r).toEqual([
      { ymd: "2026-11-20", horas: [{ t: "17:00", v: "2026-11-20T11:00" }] },
      { ymd: "2026-11-21", horas: [{ t: "01:00", v: "2026-11-20T19:00" }] }, // pasa al día siguiente en Madrid
    ]);
    expect(localAIso(r[0].horas[0].v, "America/New_York")).toBe("2026-11-20T16:00:00.000Z");
  });
  it("misma zona: igual que hoy", () => {
    expect(huecosEnZona(dias, "America/New_York", "America/New_York")).toEqual([
      { ymd: "2026-11-20", horas: [{ t: "11:00", v: "2026-11-20T11:00" }, { t: "19:00", v: "2026-11-20T19:00" }] },
    ]);
  });
});
