// Fase 0 · zona A: R15 (menú que no navega con un clic rápido), A2-07 + A4-08 (selección del CRM con leads ocultos)
// y S1-4 (el CSV de «Exportar» no deja fórmulas de Excel). Datos inventados ("Lead 1", "a"), sin nombres reales.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

// Los componentes se llaman como funciones: hooks mínimos con estado entre «pintados» (sin DOM en los tests)
const h = vi.hoisted(() => ({ slots: [] as unknown[], i: 0, efectos: [] as (() => void)[] }));
vi.mock("react", async (original) => {
  const r = await original<typeof import("react")>();
  return {
    ...r,
    useState: (ini: unknown) => {
      const i = h.i++;
      if (!(i in h.slots)) h.slots[i] = typeof ini === "function" ? (ini as () => unknown)() : ini;
      return [h.slots[i], (v: unknown) => (h.slots[i] = typeof v === "function" ? (v as (x: unknown) => unknown)(h.slots[i]) : v)];
    },
    useEffect: (fn: () => void) => void h.efectos.push(fn),
    useRef: (v: unknown) => ({ current: v }),
    useTransition: () => [false, (f: () => void) => f()],
    useMemo: (fn: () => unknown) => fn(),
  };
});
const router = vi.hoisted(() => ({ prefetch: vi.fn(), push: vi.fn() }));
const ruta = vi.hoisted(() => ({ actual: "/crm" }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => ruta.actual }));
vi.mock("next/link", () => ({ default: function Enlace() { return null; } }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/app/(panel)/acciones-globales", () => ({ cambiarProyecto: vi.fn() }));
vi.mock("@/app/login/acciones", () => ({ cerrarSesion: vi.fn() }));
vi.mock("@/components/campana-avisos", () => ({ CampanaAvisos: () => null }));
vi.mock("@/components/animaciones/animaciones", () => ({ useResalteMenu: () => {} }));
vi.mock("@/components/ui", () => ({ Avatar: () => null }));
vi.mock("@/components/eleccion", () => ({ Desplegable: () => null }));
const acciones = vi.hoisted(() => ({ asignarLeads: vi.fn(), borrarLeads: vi.fn(async () => ({ borrados: 0, saltados: 0 })), cambiarEtiquetas: vi.fn(), moverLeads: vi.fn() }));
vi.mock("@/app/(panel)/crm/acciones", () => acciones);
vi.mock("@/components/dialogos", () => ({ confirmar: async () => true }));
vi.mock("@/app/(panel)/caller/ficha-acciones", () => ({ fichasParaExportar: async () => ({}) }));

const { default: Enlace } = await import("next/link");
const { FIN_BIENVENIDA } = await import("@/components/bienvenida");
const { BarraLateral } = await import("@/components/barra-lateral");
const { BarraMasiva } = await import("@/app/(panel)/crm/barra-masiva");
const tablero = await import("@/app/(panel)/crm/tablero");

function buscar(nodo: ReactNode, si: (el: ReactElement<Record<string, unknown>>) => boolean, fuera: ReactElement<Record<string, unknown>>[] = []) {
  if (Array.isArray(nodo)) nodo.forEach((n) => buscar(n, si, fuera));
  else if (isValidElement(nodo)) {
    const el = nodo as ReactElement<Record<string, unknown>>;
    if (si(el)) fuera.push(el);
    buscar(el.props.children as ReactNode, si, fuera);
  }
  return fuera;
}
const texto = (n: ReactNode): string => (Array.isArray(n) ? n.map(texto).join("") : isValidElement(n) ? texto((n.props as { children?: ReactNode }).children) : typeof n === "string" || typeof n === "number" ? String(n) : "");

beforeEach(() => {
  h.slots = [];
  h.efectos = [];
  router.prefetch.mockClear();
  ruta.actual = "/crm";
});

// ---------- R15 ----------
describe("R15 · el enlace del menú no cambia de identidad al precargar", () => {
  const props = {
    perfil: { id: "u1", nombre: "Persona Uno", rol: "ceo", foto: null } as never,
    proyectos: [],
    proyecto: { id: "p1", nombre: "Proyecto", color: "#000" } as never,
    menu: [{ grupo: "Ventas", items: [{ href: "/crm", texto: "CRM", icono: "crm" as const }, { href: "/kpis", texto: "KPIs", icono: "kpis" as const }, { href: "/funnel", texto: "Funnel", icono: "funnel" as const }] }],
    precarga: ["/crm", "/kpis", "/funnel"],
  };
  const pintar = () => {
    h.i = 0;
    return buscar(BarraLateral(props), (el) => el.type === Enlace);
  };
  const enlace = (lista: ReactElement<Record<string, unknown>>[], href: string) => lista.find((l) => l.props.href === href)!;

  it("al pasar el ratón: misma key y router.prefetch con el href", () => {
    const antes = enlace(pintar(), "/kpis");
    (antes.props.onMouseEnter as () => void)();
    const despues = enlace(pintar(), "/kpis");
    expect(despues.key).toBe(antes.key);
    expect(router.prefetch).toHaveBeenCalledWith("/kpis", expect.anything());
  });
  it("con foco y con el dedo también precarga sin cambiar la key", () => {
    const antes = enlace(pintar(), "/funnel");
    (antes.props.onFocus as () => void)();
    (antes.props.onTouchStart as () => void)();
    expect(enlace(pintar(), "/funnel").key).toBe(antes.key);
    expect(router.prefetch).toHaveBeenCalledWith("/funnel", expect.anything());
  });
  it("la sección en la que ya estás no se precarga", () => {
    (enlace(pintar(), "/crm").props.onMouseEnter as () => void)();
    expect(router.prefetch).not.toHaveBeenCalled();
  });
  it("las 3 de entrada se precargan al quitarse la bienvenida (menos la actual), sin cambiar keys", () => {
    const ventana = new EventTarget();
    vi.stubGlobal("window", ventana);
    vi.stubGlobal("location", { pathname: "/crm" });
    const antes = pintar();
    h.efectos.forEach((f) => f());
    ventana.dispatchEvent(new Event(FIN_BIENVENIDA));
    expect(router.prefetch.mock.calls.map((c) => c[0]).sort()).toEqual(["/funnel", "/kpis"]);
    const despues = pintar();
    expect(despues.map((l) => l.key)).toEqual(antes.map((l) => l.key));
    vi.unstubAllGlobals();
  });
});

// ---------- A2-07 + A4-08 ----------
const lead = (id: string, extra: Record<string, unknown> = {}) => ({
  id, nombre: `Lead ${id}`, apellido: "", email: null, telefono: null, pais: null, caller_id: null, closer_id: null,
  estado_caller: "nuevo", creado_en: "2026-11-14T10:00:00Z", etiquetas: [], etapa_id: null, ...extra,
});
function barra(seleccion: Set<string>, leads: ReturnType<typeof lead>[]) {
  h.i = 0;
  const ejecutar = vi.fn(async (fn: () => Promise<unknown>) => void (await fn()));
  const el = BarraMasiva({ seleccion, leads: leads as never, callers: [], closers: [], destinos: [], nombrePorId: {}, etapaNombre: {}, ejecutar, limpiar: () => {}, ceo: true });
  return { el, ejecutar };
}

describe("A2-07 + A4-08 · las acciones masivas solo van a los marcados que se ven", () => {
  const cien = new Set(Array.from({ length: 100 }, (_, i) => `l${i}`));
  const todos = [...cien].map((id) => lead(id));

  it("100 marcados y una búsqueda sin resultados: ninguno cuenta (la barra no sale)", () => {
    expect(tablero.marcadosVisibles(cien, []).size).toBe(0);
  });
  it("con 75 a la vista, Borrar recibe esos 75 y la barra dice 75", async () => {
    const vistos = todos.slice(0, 75);
    const { el, ejecutar } = barra(tablero.marcadosVisibles(cien, vistos), vistos);
    expect(texto(el)).toContain("75 seleccionados");
    const borrar = buscar(el, (e) => e.type === "button" && texto(e).includes("Borrar"))[0];
    (borrar.props.onClick as () => void)();
    await vi.waitFor(() => expect(ejecutar).toHaveBeenCalled());
    await ejecutar.mock.results[0].value;
    const ids = (acciones.borrarLeads.mock.calls.at(-1) as unknown[])[0] as string[];
    expect(ids).toHaveLength(75);
    expect(ids.every((id) => vistos.some((l) => l.id === id))).toBe(true);
  });
  it("al cambiar de pipeline el tablero se monta de nuevo (key con el id del pipeline)", () => {
    expect(readFileSync("src/app/(panel)/crm/page.tsx", "utf8")).toMatch(/<TableroCrm\s+key=\{pipeline\?\.id/);
  });
});

// ---------- S1-4 ----------
describe("S1-4 · el CSV de Exportar no deja fórmulas", () => {
  it("un nombre «=HYPERLINK(...)» sale neutralizado con «'» y separado por «;»", async () => {
    let blob: Blob | undefined;
    vi.stubGlobal("URL", { createObjectURL: (b: Blob) => ((blob = b), "blob:x"), revokeObjectURL: () => {} });
    vi.stubGlobal("document", { createElement: () => ({ click: () => {} }) });
    const malo = lead("a", { nombre: '=HYPERLINK("http://malo","clic")', etiquetas: ["@SUM(1)"] });
    const { el } = barra(new Set(["a"]), [malo]);
    const exportar = buscar(el, (e) => e.type === "button" && texto(e).includes("Exportar"))[0];
    (exportar.props.onClick as () => void)();
    await vi.waitFor(() => expect(blob).toBeDefined());
    const csv = await blob!.text();
    vi.unstubAllGlobals();
    expect(csv).toContain(`"'=HYPERLINK(""http://malo"",""clic"")"`);
    expect(csv).toContain(`"'@SUM(1)"`);
    expect(csv).not.toMatch(/(^|[;,\n])"?[=@]/);
    expect(csv.split("\r\n")[0]).toContain(";");
  });
});
