// D43: los errores de la base no se enseñan tal cual; los de ErrorUsuario, sí.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/errores-app", () => ({ guardarError: vi.fn(async () => {}) }));
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { guardarError } from "@/lib/errores-app";

describe("seguro", () => {
  it("el mensaje de ErrorUsuario llega igual", async () => {
    expect(await seguro(async () => { throw new ErrorUsuario("Pon un nombre."); })).toEqual({ error: "Pon un nombre." });
  });
  it("un error de la base sale genérico y el detalle va al registro del servidor", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await seguro(async () => { throw new Error('duplicate key value violates unique constraint "entradas_pkey"'); });
    expect(r).toEqual({ error: "Algo ha fallado. Inténtalo de nuevo y, si se repite, avisa al director." });
    expect(String(consola.mock.calls[0])).toMatch(/entradas_pkey/);
    expect(vi.mocked(guardarError)).toHaveBeenCalledWith("acción", expect.stringMatching(/entradas_pkey/));
    consola.mockRestore();
  });
  it("lo que sale bien se devuelve tal cual", async () => {
    expect(await seguro(async () => 7)).toBe(7);
  });
});
