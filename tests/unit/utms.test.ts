// B1 (plan GHL): pestaña «UTMs» de KPIs. Filtros y totales sobre los leads ya cargados.
import { describe, expect, it } from "vitest";
import { SIN_DATO, filaUtm, filtrarUtms, landingDe, totalesPor, type FilaUtm, type FiltroUtm } from "@/lib/utms";

const lead = (id: string, seg: Record<string, string>, etiquetas: string[], creado_en: string, entrada?: string) =>
  filaUtm({ id, nombre: `Lead ${id}`, apellido: null, creado_en, etiquetas, seguimiento: seg }, entrada);

const filas: FilaUtm[] = [
  lead("a", { page_url: "https://codigomaestria.com/agenda?utm_source=yt", utm_source: "yt", utm_campaign: "oct" }, ["Canal: YouTube", "agenda"], "2026-10-20T12:00:00Z"),
  lead("b", { page_url: "https://codigomaestria.com/agenda", utm_source: "yt", utm_campaign: "nov" }, ["agenda"], "2026-11-02T12:00:00Z"),
  lead("c", { utm_source: "ig" }, [], "2026-11-03T12:00:00Z", "Registro Biblioteca"),
  lead("d", {}, ["agenda"], "2026-11-05T12:00:00Z"),
];
const sin: FiltroUtm = { desde: null, hasta: null, landing: "", etiqueta: "", utm_source: "", utm_medium: "", utm_campaign: "", utm_content: "", utm_term: "" };

describe("landing", () => {
  it("es la ruta de page_url (sin dominio ni parámetros); si no hay, la Entrada; si tampoco, «Sin dato»", () => {
    expect(filas.map((f) => f.landing)).toEqual(["/agenda", "/agenda", "Registro Biblioteca", SIN_DATO]);
    expect(landingDe("no es una url", undefined)).toBe(SIN_DATO);
  });
});

describe("filtros", () => {
  const ids = (f: Partial<FiltroUtm>) => filtrarUtms(filas, { ...sin, ...f }).map((x) => x.id);
  it("sin filtros salen todos", () => expect(ids({})).toEqual(["a", "b", "c", "d"]));
  it("fechas: desde incluido, hasta excluido", () => expect(ids({ desde: Date.parse("2026-11-01T00:00:00Z"), hasta: Date.parse("2026-11-05T12:00:00Z") })).toEqual(["b", "c"]));
  it("landing, utm_source, utm_campaign y etiqueta", () => {
    expect(ids({ landing: "/agenda" })).toEqual(["a", "b"]);
    expect(ids({ utm_source: "ig" })).toEqual(["c"]);
    expect(ids({ utm_campaign: "nov" })).toEqual(["b"]);
    expect(ids({ etiqueta: "agenda" })).toEqual(["a", "b", "d"]);
  });
  it("los filtros se suman, y «Sin dato» filtra los que no traen el valor", () => {
    expect(ids({ utm_source: "yt", etiqueta: "agenda", utm_campaign: "oct" })).toEqual(["a"]);
    expect(ids({ utm_source: SIN_DATO })).toEqual(["d"]);
    expect(ids({ etiqueta: SIN_DATO })).toEqual(["c"]);
  });
});

describe("totales", () => {
  it("por utm_source, de más a menos", () => {
    expect(totalesPor(filas, "utm_source")).toEqual([{ t: "yt", n: 2 }, { t: "ig", n: 1 }, { t: SIN_DATO, n: 1 }]);
  });
  it("por etiqueta: un lead cuenta en cada etiqueta que tiene", () => {
    expect(totalesPor(filas, "etiqueta")).toEqual([{ t: "agenda", n: 3 }, { t: "Canal: YouTube", n: 1 }, { t: SIN_DATO, n: 1 }]);
  });
  it("por campaña", () => {
    expect(totalesPor(filas, "utm_campaign").find((x) => x.t === "oct")?.n).toBe(1);
  });
});
