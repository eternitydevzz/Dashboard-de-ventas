// Fase 8 zona B · S2-20: el coach de IA tiene límite de uso por persona (como el login, con limite.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ bloqueado: false, anotados: [] as string[] }));
vi.mock("@/lib/limite", () => ({
  bloqueado: async () => h.bloqueado,
  anotar: async (clave: string) => void h.anotados.push(clave),
}));
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => ({}) }));
vi.mock("@/lib/auth", () => ({ getSesion: async () => ({ perfil: { id: "u1", rol: "caller" }, proyecto: { id: "p1", nombre: "Eternity" } }), esJefe: () => false }));
vi.mock("@/lib/datos", () => ({ db: () => ({}) }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => {} }));
vi.mock("@/lib/ia", () => ({
  configPara: async () => ({ contexto: "" }),
  peticion: (x: unknown) => x,
  pedirJson: async () => ({ json: { idea: "i", frases: ["f"], pregunta: "p" } }),
}));

const { coachIa } = await import("@/app/(panel)/leads/coach");

beforeEach(() => {
  h.bloqueado = false;
  h.anotados = [];
});

describe("S2-20 · coach de IA con límite", () => {
  it("dentro del límite responde y apunta el uso de esa persona", async () => {
    expect(await coachIa(null, "es muy caro")).toMatchObject({ idea: "i" });
    expect(h.anotados).toEqual(["coach:u1"]);
  });
  it("pasado el límite no llama a la IA", async () => {
    h.bloqueado = true;
    expect(await coachIa(null, "es muy caro")).toMatchObject({ error: expect.stringMatching(/Demasiadas/) });
    expect(h.anotados).toEqual([]);
  });
});
