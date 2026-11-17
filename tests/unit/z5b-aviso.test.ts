// Fases 5-6 · zona B · A4-07: con cambios sin guardar en Workflows o Entradas, un clic en el menú (un enlace de la app)
// pide confirmación con `confirmar`; sin cambios, no se escucha nada. Navegador simulado (sin jsdom).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), useEffect: (f: () => void) => f() }));
const d = vi.hoisted(() => ({ push: vi.fn(), confirmar: vi.fn(async () => true) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: d.push }) }));
vi.mock("@/components/dialogos", () => ({ confirmar: d.confirmar }));
vi.mock("@/app/(panel)/admin/acciones", () => ({}));

class Elemento {
  closest() {
    return this;
  }
}
class Enlace extends Elemento {
  href = "https://app.test/kpis";
  origin = "https://app.test";
  target = "";
  hasAttribute() {
    return false;
  }
  getAttribute() {
    return "/kpis";
  }
}
const escuchas: Record<string, (e: unknown) => void> = {};
Object.assign(globalThis, {
  Element: Elemento,
  HTMLAnchorElement: Enlace,
  location: { origin: "https://app.test" },
  window: { addEventListener: (t: string, f: (e: unknown) => void) => (escuchas[`w:${t}`] = f), removeEventListener: () => {} },
  document: { addEventListener: (t: string, f: (e: unknown) => void) => (escuchas[`d:${t}`] = f), removeEventListener: () => {} },
});

const { useAvisoSinGuardar } = await import("@/app/(panel)/admin/cliente");
const evento = (target: unknown = new Enlace()) => ({ target, defaultPrevented: false, button: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() });
const esperar = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  for (const k of Object.keys(escuchas)) delete escuchas[k];
  d.push.mockClear();
  d.confirmar.mockClear();
});

describe("A4-07 · aviso de cambios sin guardar al usar el menú", () => {
  it("sin cambios, no escucha nada", () => {
    useAvisoSinGuardar(false);
    expect(escuchas).toEqual({});
  });
  it("con cambios: para el clic, pregunta y, si dice que sí, va a la sección", async () => {
    useAvisoSinGuardar(true);
    expect(escuchas["w:beforeunload"]).toBeTypeOf("function");
    const e = evento();
    escuchas["d:click"](e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
    await esperar();
    expect(d.confirmar).toHaveBeenCalledWith(expect.stringMatching(/sin guardar/), { boton: "Salir" });
    expect(d.push).toHaveBeenCalledWith("https://app.test/kpis");
  });
  it("si dice que no, se queda", async () => {
    d.confirmar.mockResolvedValueOnce(false);
    useAvisoSinGuardar(true);
    escuchas["d:click"](evento());
    await esperar();
    expect(d.push).not.toHaveBeenCalled();
  });
  it("un clic que no es en un enlace no pregunta", () => {
    useAvisoSinGuardar(true);
    const e = evento({});
    escuchas["d:click"](e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(d.confirmar).not.toHaveBeenCalled();
  });
});
