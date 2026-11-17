import { afterEach, describe, expect, it, vi } from "vitest";
import { dinero, hoyEnZona, iniciales, inicioDia, localAIso, mismoNombre, porcentaje, primeraLetra, proyectoParaMenu, rangoDe } from "@/lib/formato";

const NY = "America/New_York";
const MAD = "Europe/Madrid";

afterEach(() => vi.useRealTimers());

describe("localAIso: hora local del proyecto → UTC", () => {
  it("Nueva York en horario de verano (EDT, -4)", () => {
    expect(localAIso("2026-10-15T16:30", NY)).toBe("2026-10-15T20:30:00.000Z");
  });
  it("Nueva York en horario de invierno (EST, -5)", () => {
    expect(localAIso("2026-11-10T09:00", NY)).toBe("2026-11-10T14:00:00.000Z");
  });
  it("Nueva York el día del cambio de hora (1 nov 2026): a las 9:00 ya es EST", () => {
    expect(localAIso("2026-11-01T09:00", NY)).toBe("2026-11-01T14:00:00.000Z");
  });
  it("Madrid el día del cambio de hora (25 oct 2026): a las 10:00 ya es CET (+1)", () => {
    expect(localAIso("2026-10-25T10:00", MAD)).toBe("2026-10-25T09:00:00.000Z");
  });
  it("solo fecha = medianoche local", () => {
    expect(localAIso("2026-10-09", NY)).toBe("2026-10-09T04:00:00.000Z");
  });
  it("rechaza texto que no es fecha", () => {
    expect(() => localAIso("mañana", NY)).toThrow();
  });
});

describe("inicioDia", () => {
  it("medianoche de Nueva York y de Madrid en UTC", () => {
    expect(inicioDia("2026-10-09", NY).toISOString()).toBe("2026-10-09T04:00:00.000Z");
    expect(inicioDia("2026-10-09", MAD).toISOString()).toBe("2026-10-08T22:00:00.000Z");
  });
});

describe("rangoDe (periodos del filtro)", () => {
  it("«hoy» usa el día de Nueva York aunque en UTC ya sea mañana", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T02:00:00Z")); // 9 oct, 22:00 en NY
    expect(hoyEnZona(NY)).toBe("2026-10-09");
    const r = rangoDe("hoy", NY);
    expect(r.desde?.toISOString()).toBe("2026-10-09T04:00:00.000Z");
    expect(r.hasta?.toISOString()).toBe("2026-10-10T04:00:00.000Z");
  });
  it("«semana» va de lunes a lunes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T15:00:00Z")); // viernes
    const r = rangoDe("semana", NY);
    expect(r.desde?.toISOString()).toBe("2026-10-05T04:00:00.000Z");
    expect(r.hasta?.toISOString()).toBe("2026-10-12T04:00:00.000Z");
  });
  // A5-07 en el Funnel (Cristian, 17 nov): el periodo anterior de un mes es el mes anterior entero, no «la misma duración»
  it.each([
    ["octubre (31) → septiembre (30)", "2026-10-09T15:00:00Z", "2026-10-01T04:00:00.000Z", "2026-11-01T04:00:00.000Z", "2026-09-01T04:00:00.000Z"],
    ["noviembre (30) → octubre (31), con el día 1", "2026-11-17T15:00:00Z", "2026-11-01T04:00:00.000Z", "2026-12-01T05:00:00.000Z", "2026-10-01T04:00:00.000Z"],
    ["marzo (31) → febrero (28)", "2027-03-10T15:00:00Z", "2027-03-01T05:00:00.000Z", "2027-04-01T04:00:00.000Z", "2027-02-01T05:00:00.000Z"],
    ["enero → diciembre del año anterior", "2027-01-10T15:00:00Z", "2027-01-01T05:00:00.000Z", "2027-02-01T05:00:00.000Z", "2026-12-01T05:00:00.000Z"],
  ])("«mes» %s", (_n, ahora, desde, hasta, previoDesde) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(ahora));
    const r = rangoDe("mes", NY);
    expect(r.desde?.toISOString()).toBe(desde);
    expect(r.hasta?.toISOString()).toBe(hasta);
    expect(r.previo!.desde.toISOString()).toBe(previoDesde);
    expect(r.previo!.hasta.getTime()).toBe(r.desde!.getTime());
  });
  it("«rango» incluye el día final completo", () => {
    const r = rangoDe("rango", NY, "2026-10-01", "2026-10-03");
    expect(r.desde?.toISOString()).toBe("2026-10-01T04:00:00.000Z");
    expect(r.hasta?.toISOString()).toBe("2026-10-04T04:00:00.000Z");
  });
  it("«todo» no tiene límites", () => {
    const r = rangoDe("todo", NY);
    expect(r.desde).toBeNull();
    expect(r.hasta).toBeNull();
    expect(r.previo).toBeNull();
  });
});

describe("dinero y porcentaje", () => {
  it("USD con formato americano", () => {
    expect(dinero(1997, { moneda: "USD" })).toBe("$1,997");
  });
  it("EUR con símbolo de euro", () => {
    const t = dinero(1997, { moneda: "EUR" });
    expect(t).toContain("€");
    expect(t.replace(/\D/g, "")).toBe("1997");
  });
  it("porcentaje con un decimal y sin dividir entre cero", () => {
    expect(porcentaje(1, 3)).toBe(33.3);
    expect(porcentaje(5, 0)).toBe(0);
  });
});

describe("proyectoParaMenu", () => {
  it("no deja pasar el secreto del webhook ni la URL de avisos al navegador", () => {
    const p = proyectoParaMenu({
      id: "1", nombre: "Maestria", color: "#2f55d4", moneda: "USD", zona_horaria: "America/New_York",
      reparto_auto: false, reparto_solo_horario: false, webhook_secreto: "SECRETO", aviso_webhook_url: "https://avisos",
    });
    expect(p).toEqual({ id: "1", nombre: "Maestria", color: "#2f55d4" });
    expect(JSON.stringify(p)).not.toContain("SECRETO");
  });
});

describe("Arreglo 28: fecha mal escrita", () => {
  it("localAIso lanza un ErrorUsuario y el usuario ve «Fecha no válida» (no «Algo ha fallado»)", async () => {
    const { localAIso } = await import("@/lib/formato");
    const { ErrorUsuario, seguro } = await import("@/lib/resultado");
    expect(() => localAIso("mañana", "Europe/Madrid")).toThrow(ErrorUsuario);
    expect(await seguro(async () => localAIso("31/12/2026", "Europe/Madrid"))).toEqual({ error: "Fecha no válida." });
  });
});

describe("mismoNombre (pipelines como en GHL)", () => {
  it("vale sin el número, sin tildes y sin mayúsculas", () => {
    expect(mismoNombre("1. Biblioteca Recursos", "Biblioteca Recursos")).toBe(true);
    expect(mismoNombre("0. Agendas orgánico", "0. Agendas órganico")).toBe(true);
    expect(mismoNombre("2. Webinar 1", "webinar 1")).toBe(true);
  });
  it("no confunde nombres distintos", () => {
    expect(mismoNombre("2. Webinar 1", "Webinar 2")).toBe(false);
    expect(mismoNombre("Nuevos", "")).toBe(false);
  });
});

describe("Iniciales con letras especiales (13 nov, error #418)", () => {
  it("no corta una letra de 2 unidades UTF-16 por la mitad", () => {
    expect(iniciales("𝙹-𝚊𝚗𝚍𝚛𝚢 𝚁𝚎𝚢𝚎𝚜")).toBe("𝙹𝚁");
    expect(iniciales("😀 Ana")).toBe("😀A");
    expect(iniciales("Ariel Gómez")).toBe("AG");
    expect(primeraLetra("")).toBe("");
  });
});

// A2-01 (fases 5-6): rangoDe es la pieza común de ranking, ventas, KPIs y el MCP. Una fecha imposible en ?desde/?hasta
// tumbaba la pantalla («2026-13-01») o se iba a otro mes («2026-02-31» → 3 de marzo). Ahora vale como «Mes».
describe("rangoDe con fechas imposibles", () => {
  it("2026-13-01 o 2026-02-31 no rompen: cae en el mes actual", async () => {
    const { rangoDe } = await import("@/lib/formato");
    const mes = rangoDe("mes", "Europe/Madrid");
    for (const [d, h] of [["2026-13-01", "2026-13-05"], ["2026-02-31", "2026-03-02"], ["2026-02-01", "2026-02-31"], ["hola", "2026-02-02"]]) {
      const r = rangoDe("rango", "Europe/Madrid", d, h);
      expect(r.etiqueta, `${d}..${h}`).toBe(mes.etiqueta);
      expect(r.desde?.getTime()).toBe(mes.desde?.getTime());
    }
    expect(rangoDe("rango", "Europe/Madrid", "2026-02-01", "2026-02-28").etiqueta).toBe("Del 2026-02-01 al 2026-02-28");
  });
});
