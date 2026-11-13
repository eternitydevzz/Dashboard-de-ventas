// 13 nov: el MCP guardaba y respondía «Algo ha fallado» porque refresh() falla fuera de una acción del servidor
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ refresh: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/cache", () => m);
import { refrescarPantalla } from "@/lib/refrescar";

describe("refrescarPantalla", () => {
  it("en una acción del servidor solo recarga la pantalla actual", () => {
    m.refresh.mockImplementation(() => undefined);
    refrescarPantalla();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
  it("desde una ruta (MCP) no lanza error: recarga todo", () => {
    m.refresh.mockImplementation(() => { throw new Error("refresh can only be called from within a Server Action."); });
    expect(() => refrescarPantalla()).not.toThrow();
    expect(m.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
