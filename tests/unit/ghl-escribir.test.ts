// Plan GHL, fase 1 (Cristian, 6 nov 2026): escribir en GHL por la API. Rutas, versión y cuerpos comprobados en la
// especificación oficial (github.com/GoHighLevel/highlevel-api-docs, apps/contacts.json y apps/opportunities.json).
// GHL se simula: cada test mira qué petición exacta se mandó.
import { describe, expect, it } from "vitest";
import { anadirEtiquetasGhl, crearOActualizarContactoGhl, crearOportunidadGhl, oportunidadesContactoGhl, quitarEtiquetasGhl } from "@/lib/ghl";

type Llamada = { url: URL; metodo: string; cabeceras: Record<string, string>; cuerpo: unknown };
function falso(respuestas: ((l: Llamada) => Response)[]) {
  const llamadas: Llamada[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const l = { url: new URL(url), metodo: init?.method ?? "GET", cabeceras: (init?.headers ?? {}) as Record<string, string>, cuerpo: init?.body ? JSON.parse(String(init.body)) : null };
    llamadas.push(l);
    const r = respuestas[llamadas.length - 1];
    return r ? r(l) : new Response("{}", { status: 500 });
  }) as unknown as typeof fetch;
  return { f, llamadas };
}

describe("crearOActualizarContactoGhl (POST /contacts/upsert)", () => {
  it("manda contacto y campos, NUNCA tags, y devuelve el id y sus etiquetas", async () => {
    const { f, llamadas } = falso([() => Response.json({ new: true, contact: { id: "c1", tags: ["a"] } })]);
    const r = await crearOActualizarContactoGhl({
      token: "tok",
      locationId: "loc",
      contacto: { firstName: "Ana", email: "a@x.test", tags: ["peligro"] } as never,
      customFields: [{ id: "f1", field_value: "v" }],
      fetchImpl: f,
    });
    expect(r).toEqual({ id: "c1", nuevo: true, etiquetas: ["a"] });
    expect(llamadas[0].url.pathname).toBe("/contacts/upsert");
    expect(llamadas[0].metodo).toBe("POST");
    expect(llamadas[0].cabeceras).toMatchObject({ Authorization: "Bearer tok", Version: "2021-07-28" });
    expect(llamadas[0].cuerpo).toEqual({ locationId: "loc", firstName: "Ana", email: "a@x.test", customFields: [{ id: "f1", field_value: "v" }] });
  });

  it("sin campos no manda customFields; sin etiquetas en la respuesta, null", async () => {
    const { f, llamadas } = falso([() => Response.json({ new: false, contact: { id: "c2" } })]);
    const r = await crearOActualizarContactoGhl({ token: "t", locationId: "loc", contacto: { email: "b@x.test" }, customFields: [], fetchImpl: f });
    expect(r).toEqual({ id: "c2", nuevo: false, etiquetas: null });
    expect(llamadas[0].cuerpo).toEqual({ locationId: "loc", email: "b@x.test" });
  });

  it("los errores de GHL se explican (token, límite, datos) e incluyen el mensaje de GHL", async () => {
    const r401 = falso([() => new Response("{}", { status: 401 })]);
    await expect(crearOActualizarContactoGhl({ token: "malo", locationId: "l", contacto: { email: "a@x.test" }, customFields: [], fetchImpl: r401.f })).rejects.toThrow(/token/);
    const r422 = falso([() => Response.json({ message: ["email must be an email"] }, { status: 422 })]);
    await expect(crearOActualizarContactoGhl({ token: "t", locationId: "l", contacto: { email: "mal" }, customFields: [], fetchImpl: r422.f })).rejects.toThrow(/422.*email must be an email/);
    const sinId = falso([() => Response.json({ contact: {} })]);
    await expect(crearOActualizarContactoGhl({ token: "t", locationId: "l", contacto: { email: "a@x.test" }, customFields: [], fetchImpl: sinId.f })).rejects.toThrow(/sin id/);
  });
});

describe("etiquetas (POST y DELETE /contacts/{id}/tags)", () => {
  it("añadir y quitar mandan solo las etiquetas indicadas", async () => {
    const { f, llamadas } = falso([() => Response.json({ tags: ["x"] }, { status: 201 }), () => Response.json({ tags: [] })]);
    await anadirEtiquetasGhl({ token: "t", contactId: "c/1", etiquetas: ["Biblioteca-form-completo"], fetchImpl: f });
    await quitarEtiquetasGhl({ token: "t", contactId: "c/1", etiquetas: ["Biblioteca-form-incompleto"], fetchImpl: f });
    expect(llamadas.map((l) => [l.metodo, l.url.pathname, l.cabeceras.Version])).toEqual([
      ["POST", "/contacts/c%2F1/tags", "2021-07-28"],
      ["DELETE", "/contacts/c%2F1/tags", "2021-07-28"],
    ]);
    expect(llamadas[0].cuerpo).toEqual({ tags: ["Biblioteca-form-completo"] });
    expect(llamadas[1].cuerpo).toEqual({ tags: ["Biblioteca-form-incompleto"] });
  });
  it("sin etiquetas no llama a GHL", async () => {
    const { f, llamadas } = falso([]);
    await anadirEtiquetasGhl({ token: "t", contactId: "c", etiquetas: [], fetchImpl: f });
    await quitarEtiquetasGhl({ token: "t", contactId: "c", etiquetas: [], fetchImpl: f });
    expect(llamadas).toHaveLength(0);
  });
});

describe("crearOportunidadGhl (buscar y crear si no hay: decisión de Cristian, 6 nov)", () => {
  const base = { token: "t", locationId: "loc", contactId: "c1", pipelineId: "p1", etapaId: "e1", nombre: "Ana" };

  it("si el contacto ya tiene una en ese pipeline y en esa columna, no hace nada más", async () => {
    const { f, llamadas } = falso([() => Response.json({ opportunities: [{ id: "o9", pipelineId: "p1", pipelineStageId: "e1", contactId: "c1" }] })]);
    expect(await crearOportunidadGhl({ ...base, fetchImpl: f })).toEqual({ id: "o9", nueva: false, movida: false });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url.pathname).toBe("/opportunities/search");
    expect(Object.fromEntries(llamadas[0].url.searchParams)).toMatchObject({ location_id: "loc", contact_id: "c1", pipeline_id: "p1" });
  });

  it("si no tiene, la crea abierta en su pipeline y columna", async () => {
    const { f, llamadas } = falso([() => Response.json({ opportunities: [] }), () => Response.json({ opportunity: { id: "o1" } }, { status: 201 })]);
    expect(await crearOportunidadGhl({ ...base, fetchImpl: f })).toEqual({ id: "o1", nueva: true, movida: false });
    expect(llamadas[1].metodo).toBe("POST");
    expect(llamadas[1].url.pathname).toBe("/opportunities/");
    expect(llamadas[1].cabeceras.Version).toBe("2021-07-28");
    expect(llamadas[1].cuerpo).toEqual({ locationId: "loc", pipelineId: "p1", pipelineStageId: "e1", contactId: "c1", name: "Ana", status: "open" });
  });

  it("una oportunidad de otro pipeline no cuenta; sin columna, GHL elige la primera", async () => {
    const { f, llamadas } = falso([() => Response.json({ opportunities: [{ id: "o5", pipelineId: "otro" }] }), () => Response.json({ opportunity: { id: "o2" } })]);
    expect(await crearOportunidadGhl({ ...base, etapaId: null, fetchImpl: f })).toEqual({ id: "o2", nueva: true, movida: false });
    expect(llamadas[1].cuerpo).not.toHaveProperty("pipelineStageId");
  });

  it("fase 3 (6 nov): si ya existe en otra columna del pipeline, la mueve a la de la Entrada (PUT, como la rama del workflow viejo)", async () => {
    const { f, llamadas } = falso([() => Response.json({ opportunities: [{ id: "o9", pipelineId: "p1", pipelineStageId: "registrados" }] }), () => Response.json({ opportunity: { id: "o9" } })]);
    expect(await crearOportunidadGhl({ ...base, fetchImpl: f })).toEqual({ id: "o9", nueva: false, movida: true });
    expect(llamadas[1].metodo).toBe("PUT");
    expect(llamadas[1].url.pathname).toBe("/opportunities/o9");
    expect(llamadas[1].cabeceras.Version).toBe("2021-07-28");
    expect(llamadas[1].cuerpo).toEqual({ pipelineStageId: "e1" });
  });

  it("sin columna en la Entrada, una que ya existe no se mueve", async () => {
    const { f, llamadas } = falso([() => Response.json({ opportunities: [{ id: "o9", pipelineId: "p1", pipelineStageId: "registrados" }] })]);
    expect(await crearOportunidadGhl({ ...base, etapaId: null, fetchImpl: f })).toEqual({ id: "o9", nueva: false, movida: false });
    expect(llamadas).toHaveLength(1);
  });

  it("sin el permiso de oportunidades, el error lo dice", async () => {
    const { f } = falso([() => Response.json({ opportunities: [] }), () => new Response("{}", { status: 403 })]);
    await expect(crearOportunidadGhl({ ...base, fetchImpl: f })).rejects.toThrow(/Edit Opportunities/);
  });

  // Mejora «menos llamadas a GHL» (Cristian, 7 nov): las oportunidades del contacto se buscan UNA vez para todos sus pipelines
  it("con `existentes` no busca: usa esa lista (ya tiene una en ese pipeline y columna → 0 llamadas)", async () => {
    const { f, llamadas } = falso([]);
    const existentes = [{ id: "o9", pipelineId: "p1", pipelineStageId: "e1", contactId: "c1" }];
    expect(await crearOportunidadGhl({ ...base, existentes, fetchImpl: f })).toEqual({ id: "o9", nueva: false, movida: false });
    expect(llamadas).toHaveLength(0);
  });
  it("con `existentes` sin ese pipeline: solo la crea (1 llamada) y la añade a la lista", async () => {
    const { f, llamadas } = falso([() => Response.json({ opportunity: { id: "o1" } }, { status: 201 })]);
    const existentes = [{ id: "o5", pipelineId: "otro" }];
    expect(await crearOportunidadGhl({ ...base, existentes, fetchImpl: f })).toEqual({ id: "o1", nueva: true, movida: false });
    expect(llamadas.map((l) => [l.metodo, l.url.pathname])).toEqual([["POST", "/opportunities/"]]);
    expect(existentes.map((x) => x.id)).toEqual(["o5", "o1"]);
  });
});

describe("oportunidadesContactoGhl (una sola búsqueda por contacto)", () => {
  it("GET /opportunities/search con el contacto, sin pipeline y con el máximo de GHL (100)", async () => {
    const { f, llamadas } = falso([() => Response.json({ opportunities: [{ id: "a", pipelineId: "p1" }, { id: "b", pipelineId: "p2" }] })]);
    expect((await oportunidadesContactoGhl({ token: "t", locationId: "loc", contactId: "c1", fetchImpl: f })).map((x) => x.id)).toEqual(["a", "b"]);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url.pathname).toBe("/opportunities/search");
    expect(llamadas[0].cabeceras.Version).toBe("2021-07-28");
    const q = Object.fromEntries(llamadas[0].url.searchParams);
    expect(q).toMatchObject({ location_id: "loc", contact_id: "c1", limit: "100" });
    expect(q).not.toHaveProperty("pipeline_id");
  });
});
