// Plan GHL, B3b (Cristian, 8 nov 2026): etiquetas de la location en GHL (listar, renombrar, borrar y unir).
// Rutas de la documentación oficial, Version 2021-07-28 (informes-agentes/api-etiquetas-ghl.txt). GHL se simula:
// cada test mira qué peticiones exactas se mandaron.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GhlEsperar, borrarEtiquetaGhl, buscarEtiquetaGhl, etiquetasGhl, renombrarEtiquetaGhl, unirEtiquetasGhl } from "@/lib/ghl";

// Parte 2 (la acción de Administración → Etiquetas): la base se simula como en workflows-cita-acciones.test.ts
let proyectoGhl: { ghl_token: string | null; ghl_location_id: string | null } | null;
let rpcs: unknown[][];
let entradas: { nombre: string; ghl_etiqueta_base: string | null }[];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (...a: unknown[]) => (rpcs.push(a), Promise.resolve({ data: null, error: null })),
    from: (tabla: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "single", "maybeSingle", "insert", "limit"]) q[m] = () => q;
      // 1.7: ¿es la base de alguna Entrada? (ilike sin comodines = igual sin mayúsculas)
      let base: string | undefined;
      q.ilike = (_c: string, v: string) => ((base = v.toLowerCase()), q);
      const filas = () => (base === undefined ? entradas : entradas.filter((e) => e.ghl_etiqueta_base?.toLowerCase() === base));
      q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: tabla === "entradas" ? filas() : proyectoGhl, error: null }).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/memoria", () => ({ olvidarTodo: () => undefined, enMemoria: <T,>(_k: string, _ms: number, f: () => T) => f(), UN_MINUTO: 60_000 }));
vi.mock("@/lib/auth", () => ({ exigir: async () => ({ proyecto: { id: "p1" } }), puedeAdmin: {}, puedeCrearProyectos: {}, exigirCambiarComisionRol: {} }));
vi.mock("@/lib/cifrado", () => ({ cifrar: (x: string) => x, descifrar: () => "tok" }));
const { renombrarEtiqueta } = await import("@/app/(panel)/admin/acciones");

type Llamada = { url: URL; metodo: string; cabeceras: Record<string, string>; cuerpo: unknown };
// Responde según método y ruta (así el orden de las llamadas no rompe el test)
function falso(responder: (l: Llamada) => Response | undefined) {
  const llamadas: Llamada[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const l = { url: new URL(url), metodo: init?.method ?? "GET", cabeceras: (init?.headers ?? {}) as Record<string, string>, cuerpo: init?.body ? JSON.parse(String(init.body)) : null };
    llamadas.push(l);
    return responder(l) ?? new Response("{}", { status: 500 });
  }) as unknown as typeof fetch;
  return { f, llamadas, resumen: () => llamadas.map((l) => `${l.metodo} ${l.url.pathname}`) };
}
const TAGS = [
  { id: "t1", name: "agenda vieja", locationId: "loc" },
  { id: "t2", name: "agenda nueva", locationId: "loc" },
];
const lista = (l: Llamada) => (l.metodo === "GET" && l.url.pathname === "/locations/loc/tags" ? Response.json({ tags: TAGS }) : undefined);
const ok = (l: Llamada) => (["PUT", "DELETE"].includes(l.metodo) || l.url.pathname.endsWith("/tags") ? Response.json({}) : undefined);

describe("etiquetasGhl y buscarEtiquetaGhl", () => {
  it("lista las etiquetas de la location con la Version 2021-07-28", async () => {
    const { f, llamadas } = falso(lista);
    expect(await etiquetasGhl({ token: "tok", locationId: "loc", fetchImpl: f })).toEqual([
      { id: "t1", name: "agenda vieja" },
      { id: "t2", name: "agenda nueva" },
    ]);
    expect(llamadas[0].cabeceras).toMatchObject({ Authorization: "Bearer tok", Version: "2021-07-28" });
  });

  it("busca por nombre en minúsculas y sin espacios de sobra", () => {
    expect(buscarEtiquetaGhl(TAGS, "  Agenda VIEJA ")?.id).toBe("t1");
    expect(buscarEtiquetaGhl(TAGS, "otra")).toBeUndefined();
  });

  it("un 429 es GhlEsperar, como el resto de ghl.ts", async () => {
    const { f } = falso(() => new Response("{}", { status: 429 }));
    await expect(etiquetasGhl({ token: "t", locationId: "loc", fetchImpl: f })).rejects.toBeInstanceOf(GhlEsperar);
  });
});

describe("renombrarEtiquetaGhl (PUT /locations/{id}/tags/{tagId})", () => {
  it("manda el nombre nuevo en minúsculas", async () => {
    const { f, llamadas, resumen } = falso((l) => lista(l) ?? ok(l));
    expect(await renombrarEtiquetaGhl({ token: "t", locationId: "loc", de: "Agenda Vieja", a: "Agenda Llamada", fetchImpl: f })).toEqual({ hecho: "renombrada", faltan: 0 });
    expect(resumen()).toEqual(["GET /locations/loc/tags", "PUT /locations/loc/tags/t1"]);
    expect(llamadas[1].cuerpo).toEqual({ name: "agenda llamada" });
  });

  it("si no existe en GHL, nada que hacer (no es error)", async () => {
    const { f, resumen } = falso(lista);
    expect(await renombrarEtiquetaGhl({ token: "t", locationId: "loc", de: "no está", a: "x", fetchImpl: f })).toEqual({ hecho: "nada", faltan: 0 });
    expect(await renombrarEtiquetaGhl({ token: "t", locationId: "loc", de: "agenda vieja", a: "AGENDA VIEJA", fetchImpl: f })).toEqual({ hecho: "nada", faltan: 0 });
    expect(resumen()).toEqual(["GET /locations/loc/tags", "GET /locations/loc/tags"]);
  });

  it("si el nombre nuevo ya existe, une las dos", async () => {
    const { f, resumen } = falso((l) => lista(l) ?? (l.url.pathname === "/contacts/search" ? Response.json({ contacts: [] }) : ok(l)));
    expect(await renombrarEtiquetaGhl({ token: "t", locationId: "loc", de: "agenda vieja", a: "Agenda Nueva", pausaMs: 0, fetchImpl: f })).toEqual({ hecho: "unida", faltan: 0 });
    expect(resumen()).toContain("DELETE /locations/loc/tags/t1");
    expect(resumen()).not.toContain("PUT /locations/loc/tags/t1");
  });
});

describe("borrarEtiquetaGhl (DELETE /locations/{id}/tags/{tagId})", () => {
  it("borra por id; si no existe, no llama", async () => {
    const { f, resumen } = falso((l) => lista(l) ?? ok(l));
    expect(await borrarEtiquetaGhl({ token: "t", locationId: "loc", nombre: "Agenda Nueva", fetchImpl: f })).toBe(true);
    expect(await borrarEtiquetaGhl({ token: "t", locationId: "loc", nombre: "no está", fetchImpl: f })).toBe(false);
    expect(resumen()).toEqual(["GET /locations/loc/tags", "DELETE /locations/loc/tags/t2", "GET /locations/loc/tags"]);
  });
});

describe("unirEtiquetasGhl (A → B: poner B y quitar A en cada contacto con A; después DELETE de A)", () => {
  it("busca los contactos con A, cambia cada uno y al final borra A", async () => {
    const { f, llamadas, resumen } = falso((l) => lista(l) ?? (l.url.pathname === "/contacts/search" ? Response.json({ contacts: [{ id: "c1" }, { id: "c2" }], total: 2 }) : ok(l)));
    expect(await unirEtiquetasGhl({ token: "t", locationId: "loc", de: "Agenda Vieja", a: "Agenda Nueva", pausaMs: 0, fetchImpl: f })).toEqual({ cambiados: 2, faltan: 0 });
    expect(resumen()).toEqual([
      "GET /locations/loc/tags",
      "POST /contacts/search",
      "POST /contacts/c1/tags",
      "DELETE /contacts/c1/tags",
      "POST /contacts/c2/tags",
      "DELETE /contacts/c2/tags",
      "DELETE /locations/loc/tags/t1",
    ]);
    expect(llamadas[1].cuerpo).toEqual({ locationId: "loc", page: 1, pageLimit: 500, filters: [{ field: "tags", operator: "eq", value: "agenda vieja" }] });
    expect(llamadas[2].cuerpo).toEqual({ tags: ["agenda nueva"] });
    expect(llamadas[3].cuerpo).toEqual({ tags: ["agenda vieja"] });
  });

  it("lee todas las páginas antes de tocar nada (quitar A movería las páginas)", async () => {
    const pagina = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${n}-${i}` }));
    const { f, llamadas } = falso((l) => {
      if (l.url.pathname !== "/contacts/search") return lista(l) ?? ok(l);
      return Response.json({ contacts: (l.cuerpo as { page: number }).page === 1 ? pagina(500) : pagina(3) });
    });
    expect(await unirEtiquetasGhl({ token: "t", locationId: "loc", de: "agenda vieja", a: "agenda nueva", pausaMs: 0, fetchImpl: f })).toEqual({ cambiados: 503, faltan: 0 });
    const busquedas = llamadas.map((l, i) => (l.url.pathname === "/contacts/search" ? i : -1)).filter((i) => i >= 0);
    expect(busquedas).toEqual([1, 2]);
  });

  it("si A no existe o es la misma que B, no toca nada", async () => {
    const { f, resumen } = falso(lista);
    expect(await unirEtiquetasGhl({ token: "t", locationId: "loc", de: "no está", a: "agenda nueva", pausaMs: 0, fetchImpl: f })).toEqual({ cambiados: 0, faltan: 0 });
    expect(await unirEtiquetasGhl({ token: "t", locationId: "loc", de: "agenda vieja", a: " AGENDA VIEJA", pausaMs: 0, fetchImpl: f })).toEqual({ cambiados: 0, faltan: 0 });
    expect(resumen()).toEqual(["GET /locations/loc/tags", "GET /locations/loc/tags"]);
  });

  it("con `max`, cambia como mucho esos, dice cuántos faltan y NO borra A", async () => {
    const { f, resumen } = falso((l) => lista(l) ?? (l.url.pathname === "/contacts/search" ? Response.json({ contacts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }] }) : ok(l)));
    expect(await unirEtiquetasGhl({ token: "t", locationId: "loc", de: "agenda vieja", a: "agenda nueva", max: 2, pausaMs: 0, fetchImpl: f })).toEqual({ cambiados: 2, faltan: 1 });
    expect(resumen()).not.toContain("POST /contacts/c3/tags");
    expect(resumen()).not.toContain("DELETE /locations/loc/tags/t1");
  });

  it("un 429 a mitad corta sin borrar A (se puede repetir: sigue con los que aún tienen A)", async () => {
    const { f, resumen } = falso((l) => {
      if (l.url.pathname === "/contacts/c2/tags") return new Response("{}", { status: 429 });
      return lista(l) ?? (l.url.pathname === "/contacts/search" ? Response.json({ contacts: [{ id: "c1" }, { id: "c2" }] }) : ok(l));
    });
    await expect(unirEtiquetasGhl({ token: "t", locationId: "loc", de: "agenda vieja", a: "agenda nueva", pausaMs: 0, fetchImpl: f })).rejects.toBeInstanceOf(GhlEsperar);
    expect(resumen()).not.toContain("DELETE /locations/loc/tags/t1");
  });
});

describe("renombrarEtiqueta (acción): primero la base y después GHL", () => {
  beforeEach(() => {
    rpcs = [];
    entradas = [{ nombre: "Agenda YT", ghl_etiqueta_base: "Agenda YT Base" }];
    proyectoGhl = { ghl_token: "cifrado", ghl_location_id: "loc" };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sin GHL conectado, solo la base", async () => {
    proyectoGhl = { ghl_token: null, ghl_location_id: null };
    const { f, llamadas } = falso(lista);
    vi.stubGlobal("fetch", f);
    expect(await renombrarEtiqueta("agenda vieja", "agenda otra")).toEqual({ ok: true, aviso: expect.stringMatching(/no tiene GHL conectado.*sigue «agenda vieja».*puede volver/) });
    expect(rpcs).toEqual([["renombrar_etiqueta", { p_proyecto: "p1", p_de: "agenda vieja", p_a: "agenda otra" }]]);
    expect(llamadas).toEqual([]);
  });

  it("con GHL, renombra y borra también allí", async () => {
    const { f, llamadas, resumen } = falso((l) => lista(l) ?? ok(l));
    vi.stubGlobal("fetch", f);
    expect(await renombrarEtiqueta("Agenda Vieja", "agenda otra")).toEqual({ ok: true });
    expect(await renombrarEtiqueta("agenda nueva", null)).toEqual({ ok: true });
    expect(rpcs).toHaveLength(2);
    expect(resumen()).toEqual(["GET /locations/loc/tags", "PUT /locations/loc/tags/t1", "GET /locations/loc/tags", "DELETE /locations/loc/tags/t2"]);
    expect(llamadas[0].cabeceras.Authorization).toBe("Bearer tok");
  });

  it("unir: como mucho 100 contactos; dice cuántos faltan (se puede volver a pulsar)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const contactos = Array.from({ length: 103 }, (_, i) => ({ id: `c${i}` }));
    const { f, resumen } = falso((l) => lista(l) ?? (l.url.pathname === "/contacts/search" ? Response.json({ contacts: contactos }) : ok(l)));
    vi.stubGlobal("fetch", f);
    const r = renombrarEtiqueta("agenda vieja", "agenda nueva");
    await vi.runAllTimersAsync();
    expect(await r).toEqual({ ok: true, faltan: 3, aviso: expect.stringMatching(/faltan 3 contactos/) });
    expect(resumen().filter((x) => x.startsWith("POST /contacts/c"))).toHaveLength(100);
    expect(resumen()).not.toContain("DELETE /locations/loc/tags/t1");
  });

  it("si GHL falla, la base ya cambió: lo dice sin deshacer", async () => {
    const { f } = falso(() => Response.json({ message: "caído" }, { status: 500 }));
    vi.stubGlobal("fetch", f);
    const r = await renombrarEtiqueta("agenda vieja", "agenda otra");
    // Al unir/renombrar, faltan deja el botón «Seguir uniendo en GHL» para reintentar
    expect(r).toEqual({ ok: true, faltan: 1, aviso: expect.stringMatching(/dashboard[^]*GHL[^]*500: caído[^]*Seguir uniendo[^]*puede volver/) });
    expect(rpcs).toHaveLength(1);
  });

});
