// Fase 3 · S4-7 (dos clics mientras sale el permiso = dos grabadoras) y A4-06 (al desmontarse, el micrófono se
// queda abierto). Sin DOM: el proveedor se llama como función y el micrófono es falso.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const h = vi.hoisted(() => ({ slots: [] as unknown[], i: 0, efectos: [] as (() => unknown)[] }));
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
      const i = slot(() => (typeof ini === "function" ? (ini as () => unknown)() : ini));
      return [h.slots[i], (v: unknown) => (h.slots[i] = typeof v === "function" ? (v as (x: unknown) => unknown)(h.slots[i]) : v)];
    },
    useRef: (v: unknown) => h.slots[slot(() => ({ current: v }))],
    useEffect: (fn: () => unknown) => void h.efectos.push(fn),
    useCallback: (fn: unknown) => fn,
  };
});
vi.mock("@/components/toasts", () => ({ useToast: () => vi.fn() }));
vi.mock("@/app/(panel)/grabaciones/acciones", () => ({ guardarGrabacion: vi.fn(), prepararSubidaGrabacion: vi.fn(), anotarFalloGrabadora: vi.fn(async () => ({ ok: true })) }));

const { ProveedorGrabadora } = await import("@/components/grabadora");

type Api = { empezar: (l: string, n: string) => Promise<void> };
const pintar = () => {
  h.i = 0;
  h.efectos = [];
  const el = ProveedorGrabadora({ children: null }) as ReactElement<{ value: Api }>;
  return el.props.value;
};

const pista = { stop: vi.fn() };
const stream = { getTracks: () => [pista] };
const esperando: ((s: unknown) => void)[] = [];
const soltar = (s: unknown) => esperando.splice(0).forEach((r) => r(s));
const getUserMedia = vi.fn(() => new Promise((r) => esperando.push(r)));
const creadas: unknown[] = [];
class FalsoRecorder {
  mimeType = "audio/webm";
  stream: unknown;
  start = vi.fn();
  stop = vi.fn();
  constructor(s: unknown) {
    this.stream = s;
    creadas.push(this);
  }
  static isTypeSupported = () => true;
}
vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
vi.stubGlobal("MediaRecorder", FalsoRecorder);
vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });

afterEach(() => {
  h.slots = [];
  creadas.length = 0;
  getUserMedia.mockClear();
  pista.stop.mockClear();
});

describe("grabadora", () => {
  it("dos «empezar» seguidos mientras sale el permiso: un solo getUserMedia y una sola grabadora", async () => {
    const g = pintar();
    const uno = g.empezar("l1", "Lead 1");
    const dos = g.empezar("l1", "Lead 1"); // «Grabar» + «Empezar a grabar» del guion
    soltar(stream);
    await Promise.all([uno, dos]);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(creadas).toHaveLength(1);
  });

  it("al desmontarse con una grabación en curso, cierra el micrófono", async () => {
    const g = pintar();
    const limpiezas = h.efectos.map((f) => f()).filter((x): x is () => void => typeof x === "function");
    const p = g.empezar("l1", "Lead 1");
    soltar(stream);
    await p;
    expect(pista.stop).not.toHaveBeenCalled();
    limpiezas.forEach((f) => f()); // React quita el proveedor (p. ej. al cerrar sesión)
    expect(pista.stop).toHaveBeenCalled();
  });
});
