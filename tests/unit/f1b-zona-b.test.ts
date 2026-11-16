// Fase 1 · zona B (CRM): A3b-02 (soltar una tarjeta enseña «Deshacer»), A4-04 (el movimiento al instante se borra
// cuando llegan los datos), A3-02 (buscador sin tildes) y S1-21 (fecha «Entró» en la zona del proyecto).
// Datos inventados ("Lead 1", "a"), sin nombres reales.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

// Los componentes se llaman como funciones: hooks mínimos con estado entre «pintados» (sin DOM en los tests)
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
    useMemo: (fn: () => unknown) => fn(),
    useActionState: () => [null, () => {}, false],
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/crm" }));
vi.mock("next/link", () => ({ default: function Enlace() { return null; } }));
const avisos = vi.hoisted(() => ({ toast: vi.fn((..._a: unknown[]) => 1) }));
vi.mock("@/components/toasts", () => ({ useToast: () => avisos.toast, useQuitarToast: () => () => {} }));
const acciones = vi.hoisted(() => ({
  moverLead: vi.fn(async (..._a: unknown[]) => undefined),
  moverLeads: vi.fn(async (..._a: unknown[]) => 1),
  asignarLeads: vi.fn(),
  borrarLeads: vi.fn(),
  cambiarEtiquetas: vi.fn(),
  unirLeads: vi.fn(),
}));
vi.mock("@/app/(panel)/crm/acciones", () => acciones);
vi.mock("@/app/(panel)/leads/acciones", () => ({ confirmarAgenda: vi.fn(), registrarLlamada: vi.fn(), agendarCita: vi.fn(), registrarVenta: vi.fn() }));
vi.mock("@/components/dialogos", () => ({ confirmar: async () => true, pedirTexto: async () => null }));
vi.mock("@/app/(panel)/caller/ficha-acciones", () => ({ fichasParaExportar: async () => ({}) }));

const tablero = await import("@/app/(panel)/crm/tablero");
const { compactarCrm } = await import("@/app/(panel)/crm/compacto");
const { BarraMasiva } = await import("@/app/(panel)/crm/barra-masiva");
const { ListaDuplicados } = await import("@/app/(panel)/crm/duplicados/lista");

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
const texto = (n: ReactNode): string => (Array.isArray(n) ? n.map(texto).join("") : isValidElement(n) ? texto((n.props as { children?: ReactNode }).children) : typeof n === "string" || typeof n === "number" ? String(n) : "");
const esperar = async () => {
  while (h.tareas.length) await h.tareas.shift();
};

const lead = (id: string, extra: Record<string, unknown> = {}) => ({
  id, nombre: `Lead ${id}`, apellido: "", email: null, telefono: null, pais: null, caller_id: null, closer_id: null,
  estado_caller: "nuevo", creado_en: "2026-11-14T10:00:00Z", etiquetas: [], invertir: null, etapa_id: "e1", ...extra,
});

beforeEach(() => {
  h.slots = [];
  h.tareas = [];
  avisos.toast.mockClear();
  acciones.moverLead.mockClear();
  acciones.moverLeads.mockClear();
});

// ---------- Tablero pintado como función ----------
const etapa = (id: string, nombre: string, extra: Record<string, unknown> = {}) => ({ id, nombre, color: "#000", orden: 0, pipeline_id: "p1", estado_caller: null, columna_cita: null, ...extra });
const ETAPAS = [etapa("e1", "Nuevos"), etapa("e2", "Contactados"), etapa("e3", "Cerrados")];
function pintar(leads: ReturnType<typeof compactarCrm>, zona?: string) {
  h.i = 0;
  return tablero.TableroCrm({ ...pintarProps(leads), zona });
}
// En qué columna se ve cada tarjeta
function columnaDe(el: ReactNode, id: string) {
  return buscar(el, (e) => typeof e.props.onDrop === "function").find((c) => buscar(c, (e) => (e.props.lead as { id?: string } | undefined)?.id === id).length)?.key;
}
function soltarEn(el: ReactNode, etapaId: string, id: string) {
  const col = buscar(el, (e) => typeof e.props.onDrop === "function" && e.key === etapaId)[0];
  (col.props.onDrop as (ev: unknown) => void)({ preventDefault: () => {}, dataTransfer: { getData: (k: string) => (k === "text/plain" ? id : "") } });
}

describe("A3b-02 · soltar una tarjeta guarda y enseña «Deshacer»", () => {
  it("soltar en una columna libre: aviso «Movido a …» con Deshacer, y Deshacer la vuelve con moverLead", async () => {
    const datos = compactarCrm([lead("L1")] as never);
    soltarEn(pintar(datos), "e2", "L1");
    await esperar();
    expect(acciones.moverLead).toHaveBeenCalledWith("L1", "e2");
    const llamada = avisos.toast.mock.calls.find((c) => (c[2] as { deshacer?: unknown } | undefined)?.deshacer);
    expect(llamada?.[0]).toContain("Movido a «Contactados»");
    const paso = (llamada![2] as { deshacer: { deshacer: () => unknown } }).deshacer;
    expect(columnaDe(pintar(datos), "L1")).toBe("e2");
    paso.deshacer();
    expect(columnaDe(pintar(datos), "L1")).toBe("e1"); // al momento, sin esperar al servidor
    await esperar();
    expect(acciones.moverLead).toHaveBeenLastCalledWith("L1", "e1");
  });
  it("un lead sin columna no ofrece Deshacer (no hay a dónde volver)", async () => {
    soltarEn(pintar(compactarCrm([lead("L1", { etapa_id: null })] as never)), "e2", "L1");
    await esperar();
    expect(avisos.toast.mock.calls.some((c) => (c[2] as { deshacer?: unknown } | undefined)?.deshacer)).toBe(false);
  });
});

describe("A4-04 · el movimiento al instante se borra cuando el servidor confirma y llegan los datos", () => {
  it("tras moverla, si llega otro cambio de esa tarjeta (barra masiva), se ve en la columna nueva", async () => {
    const antes = compactarCrm([lead("L1")] as never);
    soltarEn(pintar(antes), "e2", "L1");
    expect(columnaDe(pintar(antes), "L1")).toBe("e2"); // optimista
    await esperar();
    expect(columnaDe(pintar(antes), "L1")).toBe("e2"); // sin parpadeo hasta que llegan los datos nuevos
    expect(columnaDe(pintar(compactarCrm([lead("L1", { etapa_id: "e2" })] as never)), "L1")).toBe("e2");
    expect(columnaDe(pintar(compactarCrm([lead("L1", { etapa_id: "e3" })] as never)), "L1")).toBe("e3");
  });
  it("si el servidor falla, vuelve a su columna", async () => {
    acciones.moverLead.mockResolvedValueOnce({ error: "No" } as never);
    const datos = compactarCrm([lead("L1")] as never);
    soltarEn(pintar(datos), "e2", "L1");
    await esperar();
    expect(columnaDe(pintar(datos), "L1")).toBe("e1");
  });
});

describe("A3-02 · el buscador de Mi CRM no distingue tildes, mayúsculas ni espacios", () => {
  const l = lead("x", { nombre: "José", apellido: "Pérez  Núñez", email: "Jose@Correo.com", pais: "PE" }) as never;
  it.each(["peru", "PERÚ", "jose perez", "  josé   pérez ", "nunez", "jose@correo", "Pérez Núñez"])("«%s» lo encuentra", (q) => {
    expect(tablero.pasaBusqueda(l, q)).toBe(true);
  });
  it("lo que no está no sale", () => {
    expect(tablero.pasaBusqueda(l, "chile")).toBe(false);
  });
});

describe("S1-21 · «Entró» con la fecha de la zona del proyecto", () => {
  const tarde = "2026-11-15T03:30:00Z"; // 22:30 del 14 en Nueva York
  it("diaEn da el día local, no el de UTC", () => {
    expect(tablero.diaEn(tarde, "America/New_York")).toBe("2026-11-14");
    expect(tablero.diaEn(tarde, "Europe/Madrid")).toBe("2026-11-15");
  });
  it("la tarjeta del tablero dice «Entró el» con la zona", () => {
    const el = pintar(compactarCrm([lead("L1", { creado_en: tarde })] as never), "America/New_York");
    const t = buscar(el, (e) => (e.props.lead as { id?: string } | undefined)?.id === "L1")[0];
    const tarjeta = (t.type as (p: unknown) => El)(t.props);
    const titulos = buscar(tarjeta.props.arriba as ReactNode, (e) => typeof e.props.title === "string").map((e) => e.props.title);
    expect(titulos).toContain("Entró el 2026-11-14");
  });
  it("el CSV de Exportar pone la fecha de la zona", async () => {
    let blob: Blob | undefined;
    vi.stubGlobal("URL", { createObjectURL: (b: Blob) => ((blob = b), "blob:x"), revokeObjectURL: () => {} });
    vi.stubGlobal("document", { createElement: () => ({ click: () => {} }) });
    h.i = 0;
    const el = BarraMasiva({ seleccion: new Set(["a"]), leads: [lead("a", { creado_en: tarde })] as never, callers: [], closers: [], destinos: [], nombrePorId: {}, etapaNombre: {}, ejecutar: () => {}, limpiar: () => {}, ceo: false, zona: "America/New_York" });
    (buscar(el, (e) => e.type === "button" && texto(e).includes("Exportar"))[0].props.onClick as () => void)();
    await vi.waitFor(() => expect(blob).toBeDefined());
    const csv = await blob!.text();
    vi.unstubAllGlobals();
    expect(csv).toContain("2026-11-14");
    expect(csv).not.toContain("2026-11-15");
  });
  it("Duplicados enseña la fecha de la zona", () => {
    h.i = 0;
    const el = ListaDuplicados({ grupos: [{ clave: "123", leads: [{ id: "a", nombre: "A", apellido: "", email: null, telefono: "1", ghl_contact_id: null, creado_en: tarde }] }], zona: "America/New_York" });
    const celdas = buscar(el, (e) => e.type === "td").map((e) => texto(e));
    expect(celdas).toContain("2026-11-14");
  });
});

describe("A3b-02 · «Mover» de la barra masiva también se deshace", () => {
  it("Deshacer devuelve cada lead a su columna de antes con moverLeads (los sin columna se quedan)", async () => {
    const leads = [lead("a", { etapa_id: "e1" }), lead("b", { etapa_id: "e2" }), lead("c", { etapa_id: "e1" }), lead("d", { etapa_id: null })];
    const ejecutar = vi.fn((..._a: unknown[]) => {});
    const props = { seleccion: new Set(["a", "b", "c", "d"]), leads: leads as never, callers: [], closers: [], destinos: [{ pipeline: "P", etapas: [{ id: "e3", nombre: "Cerrados" }] }], nombrePorId: {}, etapaNombre: {}, ejecutar, limpiar: () => {}, ceo: false };
    h.i = 0;
    let el = BarraMasiva(props);
    (buscar(el, (e) => e.props["aria-label"] === "Mover a")[0].props.onChange as (e: unknown) => void)({ target: { value: "e3" } });
    h.i = 0;
    el = BarraMasiva(props);
    (buscar(el, (e) => e.type === "button" && texto(e).trim() === "Mover")[0].props.onClick as () => void)();
    const [fn, mensaje, deshacer] = ejecutar.mock.calls[0] as [() => Promise<unknown>, string, () => unknown];
    await fn();
    expect(acciones.moverLeads).toHaveBeenCalledWith(["a", "b", "c", "d"], "e3");
    expect(mensaje).toContain("movidos");
    expect(typeof deshacer).toBe("function");
    deshacer();
    await (ejecutar.mock.calls[1][0] as () => Promise<unknown>)(); // el deshacer también pasa por ejecutar (aviso si falla)
    expect(acciones.moverLeads).toHaveBeenCalledWith(["a", "c"], "e1");
    expect(acciones.moverLeads).toHaveBeenCalledWith(["b"], "e2");
    expect(acciones.moverLeads).toHaveBeenCalledTimes(3);
  });
});

function pintarProps(leads: ReturnType<typeof compactarCrm>) {
  return {
    pipelines: [{ id: "p1", nombre: "Webinar", tipo: "normal" } as never],
    pipeline: { id: "p1", nombre: "Webinar", tipo: "normal" } as never,
    etapas: ETAPAS as never,
    leads,
    callers: [],
    closers: [],
    admin: false,
    editar: false,
    jefe: false,
    productos: [],
    moneda: "USD",
    estrellasOpcionales: true,
    canales: [] as never,
    ahora: Date.parse("2026-11-16T00:00:00Z"),
    tableroClosers: null,
    permisos: null,
  };
}
