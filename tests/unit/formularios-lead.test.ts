// Fase B (17 nov): la ficha y el popup del lead enseñan cada formulario que llegó, sin pisar respuestas. La base se simula.
import { describe, expect, it, vi } from "vitest";

let respuesta: { data: unknown; error: { message: string } | null } = { data: [], error: null };
const pedido: { metodo: string; args: unknown[] }[] = [];
const consulta = () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"])
    q[m] = (...args: unknown[]) => {
      pedido.push({ metodo: m, args });
      return q;
    };
  q.then = (r: (v: unknown) => unknown) => Promise.resolve(respuesta).then(r);
  return q;
};
vi.mock("@/lib/datos", () => ({ db: () => ({ from: consulta }) }));

const { enviosDelLead, cargarEnviosLead } = await import("@/lib/formularios-lead");

const fila = (id: string, recibido_en: string, payload: unknown, entrada: string | null = "Web", tipo: string | null = null) => ({
  id,
  recibido_en,
  tipo,
  payload,
  entradas: entrada ? { nombre: entrada } : null,
});

describe("enviosDelLead", () => {
  it("ordena del más nuevo al más viejo", () => {
    const r = enviosDelLead([
      fila("b", "2026-11-10T10:00:00Z", { email: "a@a.com" }),
      fila("c", "2026-11-15T10:00:00Z", { email: "a@a.com" }),
      fila("a", "2026-11-01T10:00:00Z", { email: "a@a.com" }),
    ]);
    expect(r.map((e) => e.id)).toEqual(["c", "b", "a"]);
    expect(r[0].fecha).toBe("2026-11-15T10:00:00Z");
  });

  it("payload {} → vaciado y sin respuestas", () => {
    const [e] = enviosDelLead([fila("a", "2025-01-01T10:00:00Z", {})]);
    expect(e.vaciado).toBe(true);
    expect(e.respuestas).toEqual([]);
  });

  it("payload que no es un objeto → vaciado", () => {
    const r = enviosDelLead([fila("a", "2025-01-01T10:00:00Z", null), fila("b", "2025-01-02T10:00:00Z", [1, 2])]);
    expect(r.every((e) => e.vaciado && e.respuestas.length === 0)).toBe(true);
  });

  it("sin Entrada → usa el tipo; sin tipo → «Sin Entrada»", () => {
    const r = enviosDelLead([
      fila("a", "2026-11-02T10:00:00Z", { email: "a@a.com" }, null, "entrada: Quiz"),
      fila("b", "2026-11-01T10:00:00Z", { email: "a@a.com" }, null, null),
      fila("c", "2026-11-03T10:00:00Z", { email: "a@a.com" }, "Landing VSL", "entrada: Otra"),
    ]);
    expect(r.map((e) => e.entrada)).toEqual(["Landing VSL", "entrada: Quiz", "Sin Entrada"]);
  });

  it("dos envíos con la misma pregunta conservan cada uno su respuesta", () => {
    const r = enviosDelLead([
      fila("viejo", "2026-11-01T10:00:00Z", { email: "a@a.com", "¿Cuánto inviertes?": "Menos de 1.000 €" }),
      fila("nuevo", "2026-11-05T10:00:00Z", { email: "a@a.com", "¿Cuánto inviertes?": "Más de 5.000 €" }),
    ]);
    expect(r.map((e) => [e.id, e.respuestas])).toEqual([
      ["nuevo", [{ pregunta: "¿Cuánto inviertes?", respuesta: "Más de 5.000 €" }]],
      ["viejo", [{ pregunta: "¿Cuánto inviertes?", respuesta: "Menos de 1.000 €" }]],
    ]);
    expect(r.every((e) => !e.vaciado)).toBe(true);
  });
});

describe("cargarEnviosLead", () => {
  it("pide los envíos del lead en su proyecto, del más nuevo, hasta 50", async () => {
    pedido.length = 0;
    respuesta = { data: [fila("a", "2026-11-01T10:00:00Z", { quiz_objetivo: "Vender" })], error: null };
    const r = await cargarEnviosLead("p1", "l1");
    expect(r).toEqual([{ id: "a", fecha: "2026-11-01T10:00:00Z", entrada: "Web", respuestas: [{ pregunta: "Objetivo", respuesta: "Vender" }], vaciado: false }]);
    expect(pedido).toEqual([
      { metodo: "select", args: ["id, recibido_en, tipo, payload, entradas(nombre)"] },
      { metodo: "eq", args: ["proyecto_id", "p1"] },
      { metodo: "eq", args: ["lead_id", "l1"] },
      { metodo: "order", args: ["recibido_en", { ascending: false }] },
      { metodo: "limit", args: [50] },
    ]);
  });

  it("si la consulta falla, lanza con el mensaje", async () => {
    respuesta = { data: null, error: { message: "la base no responde" } };
    await expect(cargarEnviosLead("p1", "l1")).rejects.toThrow(/la base no responde/);
  });
});
