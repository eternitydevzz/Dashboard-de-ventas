// Fase 3 · R16 parte 2: si el audio da error, el contador y la barra se quedan en lo que de verdad sonó, se ve el
// fallo y «Reintentar» pide un enlace nuevo y vuelve a ese punto. Datos inventados ("Lead 1").
import { describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

// Hooks mínimos con estado entre «pintados» (sin DOM): useState y useRef guardan su valor por orden de llamada
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
      const i = slot(() => (typeof ini === "function" ? (ini as () => unknown)() : ini));
      return [h.slots[i], (v: unknown) => (h.slots[i] = typeof v === "function" ? (v as (x: unknown) => unknown)(h.slots[i]) : v)];
    },
    useRef: (v: unknown) => h.slots[slot(() => ({ current: v }))],
    useEffect: () => {},
    useMemo: (fn: () => unknown) => fn(),
    useTransition: () => [false, (f: () => void) => f()],
  };
});
vi.mock("next/link", () => ({ default: () => null }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/toasts", () => ({ useToast: () => toast }));
vi.mock("@/components/acciones-lead", () => ({ useAccion: () => ({ pendiente: false, ejecutar: vi.fn() }) }));
vi.mock("@/components/dialogos", () => ({ confirmar: vi.fn() }));
vi.mock("@/components/popup-lead", () => ({ PopupLead: () => null }));
vi.mock("@/app/(panel)/grabaciones/acciones", () => ({ borrarGrabacion: vi.fn(), guardarTranscripcion: vi.fn() }));

const { ListaGrabaciones } = await import("@/app/(panel)/grabaciones/cliente");

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
const texto = (n: ReactNode): string => (Array.isArray(n) ? n.map(texto).join("") : isValidElement(n) ? texto((n.props as { children?: ReactNode }).children) : n == null || typeof n === "boolean" ? "" : String(n));

const filas = [{ id: "g1", leadId: null, lead: "Lead 1", callerId: "c1", caller: "Caller", duracion: 600, transcripcion: null, creado_en: "2026-11-10T10:00:00Z" }];
const pintar = () => {
  h.i = 0;
  return ListaGrabaciones({ filas, elegida: null, jefe: false, zona: "Europe/Madrid" }) as ReactNode;
};
const audioDe = (arbol: ReactNode) => buscar(arbol, (el) => el.type === "audio")[0];
const boton = (arbol: ReactNode, t: string) => buscar(arbol, (el) => el.type === "button" && texto(el.props.children as ReactNode).includes(t))[0];
const contador = (arbol: ReactNode) => texto(buscar(arbol, (el) => el.type === "div" && String(el.props.className).includes("justify-between"))[0]?.props.children as ReactNode);

describe("reproductor: error del audio", () => {
  it("se queda en lo que sonó, no avanza con ±10 s y «Reintentar» vuelve a cargar y a ese punto", () => {
    let arbol = pintar();
    const a = { currentTime: 0, seeking: false, paused: true, playbackRate: 1, play: vi.fn(async () => {}), pause: vi.fn() };
    (audioDe(arbol).props.ref as { current: unknown }).current = a;
    const srcAntes = audioDe(arbol).props.src;

    // Suena hasta 0:30
    a.currentTime = 30;
    (audioDe(arbol).props.onTimeUpdate as (e: unknown) => void)({ currentTarget: a });
    arbol = pintar();
    expect(contador(arbol)).toContain("00:30");

    // +10 s cuando va bien: igual que antes (salta y el contador lo enseña)
    (boton(arbol, "+10 s").props.onClick as () => void)();
    expect(a.currentTime).toBe(40);
    a.seeking = true; // el salto va a un trozo no descargado
    (audioDe(arbol).props.onTimeUpdate as (e: unknown) => void)({ currentTarget: a });

    // Falla («demuxer seek failed»): vuelve a 0:30, se ve el fallo y ±10 s no lo mueven
    (audioDe(arbol).props.onError as () => void)();
    arbol = pintar();
    expect(contador(arbol)).toContain("00:30");
    expect(contador(arbol)).not.toContain("00:40");
    expect(boton(arbol, "Reintentar")).toBeTruthy();
    a.currentTime = 40;
    (boton(arbol, "+10 s").props.onClick as () => void)();
    (boton(arbol, "−10 s").props.onClick as () => void)();
    arbol = pintar();
    expect(a.currentTime).toBe(40); // no se toca un audio roto
    expect(contador(arbol)).toContain("00:30");

    // Reintentar: enlace nuevo (otra petición a /api/grabaciones, que firma otro) y al cargar, a 0:30
    (boton(arbol, "Reintentar").props.onClick as () => void)();
    arbol = pintar();
    expect(boton(arbol, "Reintentar")).toBeFalsy();
    const srcNuevo = audioDe(arbol).props.src;
    expect(srcNuevo).not.toBe(srcAntes);
    expect(String(srcNuevo)).toMatch(/^\/api\/grabaciones\/g1/);
    a.seeking = false;
    (audioDe(arbol).props.onLoadedMetadata as (e: unknown) => void)({ currentTarget: a });
    expect(a.currentTime).toBe(30);
  });
});
