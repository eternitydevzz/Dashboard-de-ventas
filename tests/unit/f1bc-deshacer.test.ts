// Fase 1b · zona c: «Deshacer» (botón y Ctrl+Z) en Clientes (estado, seguimiento, onboarding) y en el onboarding de
// los closers. Datos inventados ("l1", "p1"), sin nombres reales.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { enviarSinVaciar } from "../apoyo/enviar-sin-vaciar";
import { isValidElement, type ReactElement, type ReactNode } from "react";

// Los componentes se llaman como funciones: hooks mínimos con estado entre «pintados» (como f1b-zona-b.test.ts)
const h = vi.hoisted(() => ({ slots: [] as unknown[], i: 0, tareas: [] as Promise<unknown>[] }));
vi.mock("react", async (original) => {
  const r = await original<typeof import("react")>();
  return {
    ...r,
    useState: (ini: unknown) => {
      const i = h.i++;
      if (!(i in h.slots)) h.slots[i] = typeof ini === "function" ? (ini as () => unknown)() : ini;
      return [h.slots[i], (v: unknown) => (h.slots[i] = typeof v === "function" ? (v as (x: unknown) => unknown)(h.slots[i]) : v)];
    },
    useEffect: () => {},
    useRef: (v: unknown) => ({ current: v }),
    useTransition: () => [false, (f: () => unknown) => void h.tareas.push(Promise.resolve(f()))],
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const avisos = vi.hoisted(() => ({ toast: vi.fn((..._a: unknown[]) => 1) }));
vi.mock("@/components/toasts", () => ({ useToast: () => avisos.toast, useQuitarToast: () => () => {} }));
vi.mock("@/components/dialogos", () => ({ confirmar: async () => true, pedirTexto: async () => null }));
const cli = vi.hoisted(() => ({
  cambiarEstadoCliente: vi.fn(async (..._a: unknown[]) => undefined),
  anotarSeguimiento: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ seguimientoId: "s1", actividadId: "a1" })),
  borrarSeguimiento: vi.fn(async (..._a: unknown[]) => undefined),
  marcarPasoOnboarding: vi.fn(async (..._a: unknown[]) => undefined),
  guardarCasoExito: vi.fn(),
  guardarPasoOnboarding: vi.fn(),
  borrarPasoOnboarding: vi.fn(),
  nuevoCliente: vi.fn(),
}));
vi.mock("@/app/(panel)/clientes/acciones", () => cli);
const clo = vi.hoisted(() => ({ marcarPasoCloser: vi.fn(async (..._a: unknown[]) => undefined), guardarPasoCloser: vi.fn(), borrarPasoCloser: vi.fn() }));
vi.mock("@/app/(panel)/onboarding-closers/acciones", () => clo);
vi.mock("@/app/(panel)/leads/acciones", () => ({ anadirNota: vi.fn(), confirmarAgenda: vi.fn(), deshacerResultado: vi.fn(), registrarLlamada: vi.fn(), registrarVenta: vi.fn() }));

const { GestionarCliente } = await import("@/app/(panel)/clientes/cliente");
const { ChecklistCliente } = await import("@/app/(panel)/onboarding-closers/cliente");

type El = ReactElement<Record<string, unknown>>;
function buscar(nodo: ReactNode, si: (el: El) => boolean, fuera: El[] = []) {
  if (Array.isArray(nodo)) nodo.forEach((n) => buscar(n, si, fuera));
  else if (isValidElement(nodo)) {
    const el = nodo as El;
    if (si(el)) fuera.push(el);
    buscar(el.props.children as ReactNode, si, fuera);
  }
  return fuera;
}
const texto = (n: ReactNode): string => (Array.isArray(n) ? n.map(texto).join("") : isValidElement(n) ? texto((n.props as { children?: ReactNode }).children) : typeof n === "string" ? n : "");
const esperar = async () => {
  while (h.tareas.length) await h.tareas.shift();
};
// El último aviso con «Deshacer»
const pasoDeshacer = () => {
  const c = avisos.toast.mock.calls.filter((a) => (a[2] as { deshacer?: unknown } | undefined)?.deshacer).at(-1);
  return (c?.[2] as { deshacer: { texto: string; deshacer: () => unknown } } | undefined)?.deshacer;
};

const ficha = { lead_id: "l1", estado: "activo" as const, proximo_contacto: "2026-11-20", caso_exito: false, caso_resultado: null, caso_enlace: null, caso_fecha: null, onboarding: { pa: "2026-11-10T10:00:00Z" } as Record<string, string> };
function gestionar(pestana: "seguimiento" | "onboarding" = "seguimiento") {
  h.i = 0;
  h.slots[0] = true; // modal abierto
  return GestionarCliente({ leadId: "l1", nombre: "Cliente", ficha, pasos: [{ id: "pa", nombre: "Paso A" }, { id: "pb", nombre: "Paso B" }], notas: [], pestana }) as ReactNode;
}

beforeEach(() => {
  h.slots = [];
  h.tareas = [];
  avisos.toast.mockClear();
  for (const f of [...Object.values(cli), ...Object.values(clo)]) f.mockClear();
});

describe("Clientes · estado", () => {
  it("cambiar de estado enseña «Deshacer» y deshace volviendo al estado de antes con la misma acción", async () => {
    const boton = buscar(gestionar(), (e) => e.type === "button" && texto(e.props.children as ReactNode) === "Pausado")[0];
    (boton.props.onClick as () => void)();
    await esperar();
    expect(cli.cambiarEstadoCliente).toHaveBeenCalledWith("l1", "pausado");
    const paso = pasoDeshacer()!;
    expect(paso.texto).toBe("Ahora está «Pausado»");
    await paso.deshacer();
    await esperar();
    expect(cli.cambiarEstadoCliente).toHaveBeenLastCalledWith("l1", "activo");
  });

  it("si falla, no hay «Deshacer»", async () => {
    cli.cambiarEstadoCliente.mockResolvedValueOnce({ error: "No" } as never);
    const boton = buscar(gestionar(), (e) => e.type === "button" && texto(e.props.children as ReactNode) === "Pausado")[0];
    (boton.props.onClick as () => void)();
    await esperar();
    expect(pasoDeshacer()).toBeUndefined();
  });
});

describe("Clientes · seguimiento", () => {
  const enviar = async (nota: string, proximo: string) => {
    const form = buscar(gestionar(), (e) => e.type === "form")[0];
    const fd = new FormData();
    fd.set("nota", nota);
    fd.set("proximo", proximo);
    enviarSinVaciar(form.props.onSubmit, fd); // A4-03: el formulario usa sinVaciar (onSubmit), ya no action={…}
    await esperar();
  };

  it("deshacer borra ese seguimiento (por su id) y, si cambió, vuelve a la fecha de antes", async () => {
    await enviar("Hablamos", "2026-11-25");
    const paso = pasoDeshacer()!;
    expect(paso.texto).toBe("Seguimiento guardado");
    await paso.deshacer();
    await esperar();
    expect(cli.borrarSeguimiento).toHaveBeenCalledWith("s1", "a1");
    expect(cli.anotarSeguimiento).toHaveBeenLastCalledWith("l1", "", "2026-11-20");
  });

  it("con la misma fecha, deshacer solo borra el seguimiento", async () => {
    await enviar("Hablamos", "2026-11-20");
    await pasoDeshacer()!.deshacer();
    await esperar();
    expect(cli.borrarSeguimiento).toHaveBeenCalledWith("s1", "a1");
    expect(cli.anotarSeguimiento).toHaveBeenCalledTimes(1);
  });

  it("sin nota, deshacer solo vuelve a la fecha de antes", async () => {
    cli.anotarSeguimiento.mockResolvedValueOnce({ seguimientoId: null, actividadId: null });
    await enviar("", "");
    await pasoDeshacer()!.deshacer();
    await esperar();
    expect(cli.borrarSeguimiento).not.toHaveBeenCalled();
    expect(cli.anotarSeguimiento).toHaveBeenLastCalledWith("l1", "", "2026-11-20");
  });
});

describe("Onboarding · clientes y closers", () => {
  it("Clientes: marcar un paso se deshace desmarcándolo con la misma acción", async () => {
    const cajas = buscar(gestionar("onboarding"), (e) => e.type === "input" && e.props.type === "checkbox");
    (cajas[1].props.onChange as (e: unknown) => void)({ target: { checked: true } });
    await esperar();
    expect(cli.marcarPasoOnboarding).toHaveBeenCalledWith("l1", "pb", true);
    await pasoDeshacer()!.deshacer();
    await esperar();
    expect(cli.marcarPasoOnboarding).toHaveBeenLastCalledWith("l1", "pb", false);
  });

  it("Clientes: la casilla se vuelve a pintar con el valor guardado (key cambia al deshacer)", () => {
    const cajas = buscar(gestionar("onboarding"), (e) => e.type === "input" && e.props.type === "checkbox");
    expect(cajas[0].key).not.toBe(cajas[1].key);
    expect(String(cajas[0].key)).toContain("true");
    expect(String(cajas[1].key)).toContain("false");
  });

  it("Closers: desmarcar un paso se deshace volviéndolo a marcar", async () => {
    h.i = 0;
    const lista = ChecklistCliente({ leadId: "l1", pasos: [{ id: "pa", nombre: "Paso A" }], hechos: { pa: "2026-11-10T10:00:00Z" }, zona: "Europe/Madrid" }) as ReactNode;
    const boton = buscar(lista, (e) => e.type === "button" && e.props["aria-pressed"] === true)[0];
    (boton.props.onClick as () => void)();
    await esperar();
    expect(clo.marcarPasoCloser).toHaveBeenCalledWith("l1", "pa", false);
    expect(pasoDeshacer()!.texto).toBe("Paso A: sin hacer");
    await pasoDeshacer()!.deshacer();
    await esperar();
    expect(clo.marcarPasoCloser).toHaveBeenLastCalledWith("l1", "pa", true);
  });
});
