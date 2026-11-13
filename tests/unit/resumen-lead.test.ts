// D43 (13 nov): en el popup del lead, un fallo de la base no puede salir como «No puedes ver este lead». La base se simula.
import { beforeEach, describe, expect, it, vi } from "vitest";

let lead: { data: unknown; error: { message: string } | null };
const consulta = () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "maybeSingle"]) q[m] = () => q;
  q.then = (r: (v: unknown) => unknown) => Promise.resolve(lead).then(r);
  return q;
};
vi.mock("@/lib/datos", () => ({ db: () => ({ from: consulta }), equipo: async () => [] }));
vi.mock("@/lib/auth", () => ({ getSesion: async () => ({ perfil: { id: "u1", rol: "caller" }, proyecto: { id: "p1" } }), esJefe: () => false }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => {} }));

const { resumenLead } = await import("@/app/(panel)/leads/resumen");

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

describe("resumenLead: error de la base ≠ sin permiso", () => {
  it("si la lectura falla, error genérico (no «No puedes ver este lead»)", async () => {
    lead = { data: null, error: { message: "la base no responde" } };
    const r = (await resumenLead("l1")) as { error: string };
    expect(r.error).not.toMatch(/No puedes ver/);
    expect(r.error).toMatch(/Algo ha fallado/);
  });
  it("si el lead no es suyo, «No puedes ver este lead»", async () => {
    lead = { data: { id: "l1", caller_id: "otro", closer_id: null }, error: null };
    expect(await resumenLead("l1")).toEqual({ error: "No puedes ver este lead." });
  });
});
