// Cristian, 15 nov: «sí, arréglalo». Desde el 13 nov, 4 envíos de la web llegaron 2 veces idénticos (mismo event_id y
// mismo contenido) en 1-5 s. Se ignora el repetido; el formulario por pasos (mismo event_id, contenido distinto) sigue.
import { beforeEach, describe, expect, it, vi } from "vitest";

let filas: { payload: unknown; recibido_en: string }[] = [];
let filtros: [string, unknown][] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "order", "limit"]) q[m] = (...a: unknown[]) => (filtros.push([m, a]), q);
      q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: filas, error: null }).then(r);
      return q;
    },
  }),
}));
const { envioRepetido, mismoEnvio } = await import("@/lib/entrada-evento");

const envio = { event_id: "ev-1", lead: { email: "lead-a@ejemplo.test", nombre: "Lead A" }, respuestas: [{ pregunta: "P", respuesta: "R" }] };

describe("mismoEnvio", () => {
  it("igual aunque las claves vengan en otro orden (la base las reordena)", () => {
    expect(mismoEnvio(envio, { respuestas: [{ respuesta: "R", pregunta: "P" }], lead: { nombre: "Lead A", email: "lead-a@ejemplo.test" }, event_id: "ev-1" })).toBe(true);
  });
  it("distinto si cambia algo (p. ej. el paso siguiente del formulario trae el email)", () => {
    expect(mismoEnvio(envio, { ...envio, lead: { ...envio.lead, telefono: "+34 600 000 000" } })).toBe(false);
  });
});

describe("envioRepetido", () => {
  beforeEach(() => {
    filas = [];
    filtros = [];
  });
  it("mismo event_id y mismo contenido en el último minuto en esa Entrada: repetido", async () => {
    filas = [{ payload: envio, recibido_en: new Date().toISOString() }];
    expect(await envioRepetido("entrada-1", envio)).toBe(true);
    expect(filtros).toContainEqual(["eq", ["entrada_id", "entrada-1"]]);
    expect(filtros).toContainEqual(["eq", ["payload->>event_id", "ev-1"]]);
    expect(filtros.some(([m]) => m === "gte")).toBe(true);
  });
  it("mismo event_id con contenido distinto (formulario por pasos): no es repetido", async () => {
    filas = [{ payload: { ...envio, lead: { telefono: "+34 600 000 000" } }, recibido_en: new Date().toISOString() }];
    expect(await envioRepetido("entrada-1", envio)).toBe(false);
  });
  it("sin event_id: nunca se considera repetido (no hay con qué compararlo)", async () => {
    expect(await envioRepetido("entrada-1", { lead: { email: "x@ejemplo.test" } })).toBe(false);
    expect(filtros).toHaveLength(0);
  });
});
