// Plan GHL, B3b (Cristian, 8 nov 2026): etiquetas de la location en GHL (listar, renombrar, borrar y unir).
// Rutas de la documentación oficial, Version 2021-07-28 (informes-agentes/api-etiquetas-ghl.txt). GHL se simula:
// cada test mira qué peticiones exactas se mandaron.
import { describe, expect, it } from "vitest";
import { GhlEsperar, borrarEtiquetaGhl, buscarEtiquetaGhl, etiquetasGhl, renombrarEtiquetaGhl, unirEtiquetasGhl } from "@/lib/ghl";

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
    expect(await renombrarEtiquetaGhl({ token: "t", locationId: "loc", de: "Agenda Vieja", a: "Agenda Llamada", fetchImpl: f })).toBe("renombrada");
    expect(resumen()).toEqual(["GET /locations/loc/tags", "PUT /locations/loc/tags/t1"]);
    expect(llamadas[1].cuerpo).toEqual({ name: "agenda llamada" });
  });

  it("si no existe en GHL, nada que hacer (no es error)", async () => {
    const { f, resumen } = falso(lista);
    expect(await renombrarEtiquetaGhl({ token: "t", locationId: "loc", de: "no está", a: "x", fetchImpl: f })).toBe("nada");
    expect(await renombrarEtiquetaGhl({ token: "t", locationId: "loc", de: "agenda vieja", a: "AGENDA VIEJA", fetchImpl: f })).toBe("nada");
    expect(resumen()).toEqual(["GET /locations/loc/tags", "GET /locations/loc/tags"]);
  });

  it("si el nombre nuevo ya existe, une las dos", async () => {
    const { f, resumen } = falso((l) => lista(l) ?? (l.url.pathname === "/contacts/search" ? Response.json({ contacts: [] }) : ok(l)));
    expect(await renombrarEtiquetaGhl({ token: "t", locationId: "loc", de: "agenda vieja", a: "Agenda Nueva", pausaMs: 0, fetchImpl: f })).toBe("unida");
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
    expect(await unirEtiquetasGhl({ token: "t", locationId: "loc", de: "Agenda Vieja", a: "Agenda Nueva", pausaMs: 0, fetchImpl: f })).toBe(2);
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
    expect(await unirEtiquetasGhl({ token: "t", locationId: "loc", de: "agenda vieja", a: "agenda nueva", pausaMs: 0, fetchImpl: f })).toBe(503);
    const busquedas = llamadas.map((l, i) => (l.url.pathname === "/contacts/search" ? i : -1)).filter((i) => i >= 0);
    expect(busquedas).toEqual([1, 2]);
  });

  it("si A no existe o es la misma que B, no toca nada", async () => {
    const { f, resumen } = falso(lista);
    expect(await unirEtiquetasGhl({ token: "t", locationId: "loc", de: "no está", a: "agenda nueva", pausaMs: 0, fetchImpl: f })).toBe(0);
    expect(await unirEtiquetasGhl({ token: "t", locationId: "loc", de: "agenda vieja", a: " AGENDA VIEJA", pausaMs: 0, fetchImpl: f })).toBe(0);
    expect(resumen()).toEqual(["GET /locations/loc/tags", "GET /locations/loc/tags"]);
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
