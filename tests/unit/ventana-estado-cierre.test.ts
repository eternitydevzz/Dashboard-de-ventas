// 21 nov 2026 (auditoría): la ventana de resultado (venta, agendar, llamar luego) se cerraba antes de que respondiera
// el servidor y, si fallaba, se perdía lo escrito. Ahora se cierra solo si se guardó. Sin DOM: se llama como función.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

const h = vi.hoisted(() => ({ slots: [] as unknown[], i: 0 }));
vi.mock("react", async (original) => {
  const r = await original<typeof import("react")>();
  const slot = (ini: () => unknown) => {
    const i = h.i++;
    if (!(i in h.slots)) h.slots[i] = ini();
    return i;
  };
  return {
    ...r,
    useState: (ini: unknown) => {
      const i = slot(() => ini);
      return [h.slots[i], (v: unknown) => (h.slots[i] = v)];
    },
    useRef: (v: unknown) => h.slots[slot(() => ({ current: v }))],
  };
});
const FormVenta = () => null;
vi.mock("@/components/acciones-lead", () => ({ FormVenta }));
vi.mock("@/components/modal", () => ({ Modal: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/estrellas", () => ({ SelectorEstrellas: () => null }));
vi.mock("@/components/campos-cita", () => ({ CamposCita: () => null }));
vi.mock("@/components/calendario-agenda", () => ({ CalendarioAgenda: () => null }));
vi.mock("@/components/mini-calendario", () => ({ MiniCalendario: () => null }));
vi.mock("@/app/(panel)/leads/acciones", () => ({ agendarCita: vi.fn(), registrarLlamada: vi.fn(), registrarVenta: vi.fn() }));

const { VentanaEstado } = await import("@/app/(panel)/crm/ventanas-estado");

afterEach(() => {
  h.slots = [];
});

function enviarVenta(onGuardar: () => Promise<boolean>, onCerrar: () => void) {
  h.i = 0;
  const modal = VentanaEstado({ lead: { id: "l1", nombre: "Ana" }, destino: "vendido", closers: [], productos: [], moneda: "EUR", esCaller: true, onCerrar, onGuardar }) as ReactElement<{ children: ReactElement<{ onEnviar: (fd: FormData) => void }> }>;
  const form = modal.props.children;
  expect(form.type).toBe(FormVenta);
  form.props.onEnviar(new FormData());
}

describe("ventana de resultado", () => {
  it("si el servidor falla, no se cierra (lo escrito se queda)", async () => {
    const onCerrar = vi.fn();
    enviarVenta(async () => false, onCerrar);
    await new Promise((r) => setTimeout(r, 0));
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it("si se guarda, se cierra", async () => {
    const onCerrar = vi.fn();
    enviarVenta(async () => true, onCerrar);
    await new Promise((r) => setTimeout(r, 0));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it("dos envíos seguidos mientras guarda: un solo guardado", async () => {
    let soltar: (ok: boolean) => void = () => {};
    const onGuardar = vi.fn(() => new Promise<boolean>((r) => (soltar = r)));
    const onCerrar = vi.fn();
    enviarVenta(onGuardar, onCerrar);
    enviarVenta(onGuardar, onCerrar); // segundo clic (mismo estado: h.slots no se borra)
    soltar(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(onGuardar).toHaveBeenCalledTimes(1);
  });
});
