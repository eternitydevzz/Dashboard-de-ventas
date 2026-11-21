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
vi.mock("@/lib/webm-buscable", () => ({ hacerBuscable: async (b: Blob) => b }));

const { ProveedorGrabadora } = await import("@/components/grabadora");
const acciones = await import("@/app/(panel)/grabaciones/acciones");

type Api = { empezar: (l: string, n: string) => Promise<void>; parar: () => void };
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
  onstop: null | (() => void) = null;
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
const ventana = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
vi.stubGlobal("window", ventana);

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

  // 21 nov (auditoría): tras un resultado o «Siguiente» quedan 30 s de aviso; si llaman al siguiente lead y pulsan
  // Grabar, la anterior se para y se guarda y empieza la nueva (antes Grabar estaba bloqueado y no se grababa)
  it("Grabar en otro lead para la grabación anterior y empieza la nueva", async () => {
    const g = pintar();
    const p1 = g.empezar("l1", "Lead 1");
    soltar(stream);
    await p1;
    const [vieja] = creadas as FalsoRecorder[];
    const p2 = g.empezar("l2", "Lead 2");
    expect(vieja.stop).toHaveBeenCalled();
    soltar(stream);
    await p2;
    expect(creadas).toHaveLength(2);
    const nueva = creadas[1] as FalsoRecorder;
    vieja.onstop?.(); // llega tarde el «stop» de la anterior: no puede soltar la nueva
    g.parar();
    expect(nueva.stop).toHaveBeenCalled();
  });

  it("Grabar en el mismo lead mientras graba no hace nada", async () => {
    const g = pintar();
    const p1 = g.empezar("l1", "Lead 1");
    soltar(stream);
    await p1;
    await g.empezar("l1", "Lead 1");
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect((creadas[0] as FalsoRecorder).stop).not.toHaveBeenCalled();
  });

  it("mientras sube la grabación, avisa antes de cerrar la pestaña", async () => {
    vi.mocked(acciones.prepararSubidaGrabacion).mockReturnValue(new Promise(() => {})); // la subida no termina
    const g = pintar();
    const p = g.empezar("l1", "Lead 1");
    soltar(stream);
    await p;
    (creadas[0] as FalsoRecorder).onstop?.(); // para: empieza a subir
    await new Promise((r) => setTimeout(r, 0));
    ventana.addEventListener.mockClear();
    pintar();
    h.efectos.forEach((f) => f());
    expect(ventana.addEventListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });
});
