// Ola única, carril C (Cristian, 14 nov): cada manual dice qué mercados lo ven (España, Latam o los 2) y quién lo ha
// visto. Datos inventados («Lead A», «caller-1»); la base se simula.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Perfil = { id: string; rol: string };
const est = {
  perfil: { id: "caller-1", rol: "caller" } as Perfil,
  mercado: null as "es" | "latam" | null,
  manual: null as null | { archivo_path: string; mercados: string[] },
  upserts: [] as Record<string, unknown>[],
  errorUpsert: null as null | { message: string },
  updates: [] as Record<string, unknown>[],
};
const sesion = () => ({ perfil: est.perfil, proyecto: { id: "p1", zona_horaria: "Europe/Madrid" } });

vi.mock("@/lib/auth", () => ({ getSesion: async () => sesion(), esJefe: (p: Perfil) => p.rol === "ceo" || p.rol === "director" }));
vi.mock("@/lib/permisos", () => ({ puedeSeccion: async () => true, exigirSeccion: async () => sesion() }));
vi.mock("@/lib/mercado-datos", () => ({ miMercado: async () => est.mercado }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => {} }));
vi.mock("@/lib/subidas", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/datos", () => {
  const cadena = (fin: () => unknown) => {
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "in", "order"]) c[k] = () => c;
    c.maybeSingle = async () => ({ data: fin(), error: null });
    c.then = (r: (x: unknown) => unknown) => Promise.resolve({ data: [{ id: "m1" }], error: null }).then(r);
    return c;
  };
  return {
    db: () => ({
      from: (t: string) => {
        const c = cadena(() => est.manual);
        c.upsert = async (fila: Record<string, unknown>) => (t === "manuales_vistos" && est.upserts.push(fila), { error: est.errorUpsert });
        c.update = (fila: Record<string, unknown>) => (est.updates.push(fila), c);
        return c;
      },
      storage: { from: () => ({ download: async () => ({ data: new Blob(["<html><head></head><body>Manual</body></html>"]), error: null }) }) },
    }),
    escribir: async <T,>(p: PromiseLike<T>) => p,
  };
});

const { GET } = await import("@/app/api/manuales/[id]/route");
const { guardarMercadosManual } = await import("@/app/(panel)/manuales/acciones");
const { VisorManuales } = await import("@/app/(panel)/manuales/cliente");
const { manualesDeMercado, mercadosValidos, quienLoHaVisto } = await import("@/lib/manuales");

const abrir = () => GET(new Request("https://x.test/api/manuales/m1"), { params: Promise.resolve({ id: "m1" }) });

beforeEach(() => {
  est.perfil = { id: "caller-1", rol: "caller" };
  est.mercado = null;
  est.manual = { archivo_path: "p1/a.html", mercados: ["latam"] };
  est.upserts = [];
  est.errorUpsert = null;
  est.updates = [];
});

describe("filtro por mercado", () => {
  const filas = [
    { id: "solo-latam", mercados: ["latam"] },
    { id: "los-2", mercados: ["latam", "es"] },
  ];
  it("España ve solo los marcados para España, sin caer en los de Latam", () => {
    expect(manualesDeMercado(filas, "es").map((f) => f.id)).toEqual(["los-2"]);
    expect(manualesDeMercado([filas[0]], "es")).toEqual([]);
  });
  it("Latam (o sin elegir) ve los marcados para Latam", () => {
    expect(manualesDeMercado(filas, "latam").map((f) => f.id)).toEqual(["solo-latam", "los-2"]);
    expect(manualesDeMercado(filas, null).map((f) => f.id)).toEqual(["solo-latam", "los-2"]);
  });
  it("mercados: solo «latam» y «es», al menos uno", () => {
    expect(mercadosValidos(["es", "x", "latam"])).toEqual(["latam", "es"]);
    expect(() => mercadosValidos([])).toThrow(/al menos/);
    expect(() => mercadosValidos(["x"])).toThrow(/al menos/);
  });
});

describe("ruta del .html", () => {
  it("un caller de España no abre uno solo de Latam aunque sepa el id (404) y no cuenta como visto", async () => {
    est.mercado = "es";
    const r = await abrir();
    expect(r.status).toBe(404);
    expect(est.upserts).toEqual([]);
  });
  it("uno de Latam lo abre y se guarda su visto; al volver a abrirlo, se actualiza la hora", async () => {
    expect((await abrir()).status).toBe(200);
    expect(est.upserts[0]).toMatchObject({ manual_id: "m1", perfil_id: "caller-1" });
    await new Promise((r) => setTimeout(r, 5));
    await abrir();
    expect(est.upserts).toHaveLength(2);
    expect(Date.parse(est.upserts[1].visto_en as string)).toBeGreaterThan(Date.parse(est.upserts[0].visto_en as string));
  });
  it("si falla guardar el visto, el manual se enseña igual", async () => {
    est.errorUpsert = { message: "caída" };
    const r = await abrir();
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("Manual");
  });
  it("un jefe abre los de cualquier mercado (para mirarlos con el selector)", async () => {
    est.perfil = { id: "dir-1", rol: "director" };
    est.manual = { archivo_path: "p1/a.html", mercados: ["es"] };
    expect((await abrir()).status).toBe(200);
  });
});

describe("quién lo ha visto", () => {
  it("cada persona de esos mercados, con su hora o sin ver", () => {
    const personas = [{ id: "caller-1", nombre: "Caller 1" }, { id: "caller-2", nombre: "Caller 2" }, { id: "closer-1", nombre: "Closer 1" }];
    const lista = quienLoHaVisto(["es"], personas, { "caller-1": "es", "closer-1": "es" }, [{ perfil_id: "caller-1", visto_en: "2026-11-14T10:00:00Z" }]);
    expect(lista).toEqual([
      { id: "caller-1", nombre: "Caller 1", visto_en: "2026-11-14T10:00:00Z" },
      { id: "closer-1", nombre: "Closer 1", visto_en: null },
    ]);
  });
});

describe("ajuste del manual (solo jefes)", () => {
  it("un caller no cambia los mercados", async () => {
    const r = await guardarMercadosManual("m1", ["es"]);
    expect(r).toMatchObject({ error: expect.stringMatching(/CEO y los directores/) });
    expect(est.updates).toEqual([]);
  });
  it("un director sí", async () => {
    est.perfil = { id: "dir-1", rol: "director" };
    expect(await guardarMercadosManual("m1", ["es", "latam"])).toBeUndefined();
    expect(est.updates).toEqual([{ mercados: ["latam", "es"] }]);
  });
  it("un no jefe no ve el botón de ajustes; un jefe sí", () => {
    const m = { id: "m1", titulo: "Lead A", actualizado_en: "2026-11-14T10:00:00Z", por: null, mercados: ["latam" as const], vistos: [] };
    const pinta = (editor: boolean) => renderToStaticMarkup(createElement(VisorManuales, { manuales: [m], elegido: m, editor, zona: "Europe/Madrid" }));
    expect(pinta(false)).not.toContain("Ajustes del manual");
    expect(pinta(true)).toContain("Ajustes del manual");
  });
});
