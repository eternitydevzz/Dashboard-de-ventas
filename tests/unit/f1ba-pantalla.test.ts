// Fase 1b · zona a: en pantalla, etiquetas, asignar, repartir, nota, etapa y caller/closer de la ficha enseñan
// «Deshacer» (botón y Ctrl+Z) y deshacen con las acciones que ya existen. Datos inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

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
    startTransition: (f: () => unknown) => void h.tareas.push(Promise.resolve(f())),
    useMemo: (fn: () => unknown) => fn(),
  };
});
const avisos = vi.hoisted(() => ({ toast: vi.fn((..._a: unknown[]) => 1) }));
vi.mock("@/components/toasts", () => ({ useToast: () => avisos.toast, useQuitarToast: () => () => {} }));
const crm = vi.hoisted(() => ({ asignarLeads: vi.fn(async (..._a: unknown[]) => undefined), cambiarEtiquetas: vi.fn(async (..._a: unknown[]) => 1), moverLeads: vi.fn(), borrarLeads: vi.fn() }));
vi.mock("@/app/(panel)/crm/acciones", () => crm);
const fichas = vi.hoisted(() => ({
  cambiarEtapaLead: vi.fn(async (..._a: unknown[]) => undefined),
  asignarDesdeFicha: vi.fn(async (..._a: unknown[]) => undefined),
  borrarNotaReciente: vi.fn(async (..._a: unknown[]) => undefined),
}));
vi.mock("@/app/(panel)/leads/acciones", () => fichas);
vi.mock("@/app/(panel)/caller/ficha-acciones", () => ({ fichasParaExportar: async () => ({}) }));
vi.mock("@/components/dialogos", () => ({ confirmar: async () => true }));
const reparto = vi.hoisted(() => ({ previsualizarReparto: vi.fn(), repartirLeads: vi.fn(async (..._a: unknown[]) => ({ repartidos: 2, antes: { viejo: ["l1"], "": ["l2"] } })) }));
vi.mock("@/app/(panel)/crm/reparto", () => reparto);

const { BarraMasiva } = await import("@/app/(panel)/crm/barra-masiva");
const { SelectoresLead } = await import("@/app/(panel)/leads/[id]/selectores");
const { RepartirLeads } = await import("@/components/repartir-leads");
const { crearUnaVez } = await import("@/components/acciones-lead");

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
const boton = (el: ReactNode, t: string) => buscar(el, (e) => e.type === "button" && texto(e.props.children as ReactNode).trim() === t)[0];
const esperar = async () => {
  while (h.tareas.length) await h.tareas.shift();
};
const pasoDe = (llamada: unknown[] | undefined) => (llamada?.[2] as { deshacer?: { deshacer: () => unknown } } | undefined)?.deshacer;

beforeEach(() => {
  h.slots = [];
  h.tareas = [];
  avisos.toast.mockClear();
  for (const f of [...Object.values(crm), ...Object.values(fichas)]) f.mockClear();
});

// ---------- Barra masiva (CRM) ----------
const lead = (id: string, extra: Record<string, unknown> = {}) => ({ id, nombre: id, apellido: "", email: null, telefono: null, pais: null, caller_id: null, closer_id: null, estado_caller: "nuevo", creado_en: "2026-11-14T10:00:00Z", etiquetas: [], etapa_id: "e1", ...extra });
const LEADS = [lead("l1", { caller_id: "ca", closer_id: "cx", etiquetas: ["VIP", "web"] }), lead("l2", { caller_id: "cb", etiquetas: ["web"] }), lead("l3", { caller_id: "ca" })];
const ejecutar = vi.fn((fn: () => Promise<unknown>, _m?: string, _d?: () => unknown) => void h.tareas.push(fn()));
function barra() {
  h.i = 0;
  return BarraMasiva({ seleccion: new Set(["l1", "l2", "l3"]), leads: LEADS as never, callers: [], closers: [], destinos: [], nombrePorId: {}, etapaNombre: {}, ejecutar, limpiar: () => {}, ceo: false });
}
beforeEach(() => {
  ejecutar.mockClear();
});

describe("1 · etiquetas en masa: Deshacer deja las de CADA lead como estaban", () => {
  it("Añadir «vip»: deshacer la quita solo a los que no la tenían (l2, l3), no a l1", async () => {
    barra();
    h.slots[3] = " vip "; // la etiqueta escrita
    (boton(barra(), "Añadir").props.onClick as () => void)();
    await esperar();
    expect(crm.cambiarEtiquetas).toHaveBeenCalledWith(["l1", "l2", "l3"], [" vip "], []);
    const deshacer = ejecutar.mock.calls[0][2]!;
    expect(deshacer).toBeTypeOf("function");
    deshacer();
    await esperar();
    expect(crm.cambiarEtiquetas).toHaveBeenLastCalledWith(["l2", "l3"], [], ["vip"]);
  });

  it("Quitar «vip»: deshacer se la vuelve a poner, con su forma original, solo a quien la tenía", async () => {
    barra();
    h.slots[3] = "vip";
    (boton(barra(), "Quitar").props.onClick as () => void)();
    await esperar();
    ejecutar.mock.calls[0][2]!();
    await esperar();
    expect(crm.cambiarEtiquetas).toHaveBeenLastCalledWith(["l1"], ["VIP"], []);
  });

  it("si nada cambia (todos la tenían ya), no ofrece Deshacer", () => {
    barra();
    h.slots[3] = "web";
    h.i = 0;
    const b = BarraMasiva({ seleccion: new Set(["l1", "l2"]), leads: LEADS as never, callers: [], closers: [], destinos: [], nombrePorId: {}, etapaNombre: {}, ejecutar, limpiar: () => {}, ceo: false });
    (boton(b, "Añadir").props.onClick as () => void)();
    expect(ejecutar.mock.calls[0][2]).toBeUndefined();
  });
});

describe("2 · asignar en masa: Deshacer devuelve cada lead a quien tenía", () => {
  it("caller: agrupa por el de antes y quita a los que no tenían", async () => {
    barra();
    h.slots[0] = "nuevo";
    (boton(barra(), "Asignar").props.onClick as () => void)();
    await esperar();
    expect(crm.asignarLeads).toHaveBeenCalledWith(["l1", "l2", "l3"], "nuevo", undefined);
    ejecutar.mock.calls[0][2]!();
    await esperar();
    expect(crm.asignarLeads).toHaveBeenCalledWith(["l1", "l3"], "ca", undefined);
    expect(crm.asignarLeads).toHaveBeenCalledWith(["l2"], "cb", undefined);
  });

  it("closer: igual, y los que no tenían closer se quedan sin él (null)", async () => {
    barra();
    h.slots[1] = "__ninguno";
    (boton(barra(), "Asignar").props.onClick as () => void)();
    await esperar();
    ejecutar.mock.calls[0][2]!();
    await esperar();
    expect(crm.asignarLeads).toHaveBeenCalledWith(["l1"], undefined, "cx");
    expect(crm.asignarLeads).toHaveBeenCalledWith(["l2", "l3"], undefined, null);
  });
});

// ---------- Ficha del lead ----------
function selectores(o: { etapaId?: string | null; callerId?: string | null; closerId?: string | null } = {}) {
  h.i = 0;
  return SelectoresLead({ leadId: "L", jefe: true, etapaId: "e-antes", callerId: "ca", closerId: null, pipelines: [], callers: [], closers: [], ...o } as never);
}
const cambiar = (el: ReactNode, id: string, v: string) => (buscar(el, (e) => e.props.id === id)[0].props.onChange as (e: unknown) => void)({ target: { value: v } });

describe("2 y 5 · ficha: etapa, caller y closer se deshacen con su acción de siempre", () => {
  it("etapa: Deshacer vuelve a la columna de antes con cambiarEtapaLead", async () => {
    cambiar(selectores(), "selectores-pipeline-y-columna", "e-nueva");
    await esperar();
    const paso = pasoDe(avisos.toast.mock.calls.find((c) => pasoDe(c)));
    expect(paso).toBeDefined();
    paso!.deshacer();
    await esperar();
    expect(fichas.cambiarEtapaLead).toHaveBeenLastCalledWith("L", "e-antes");
  });

  it("etapa: sin columna antes, no ofrece Deshacer", async () => {
    cambiar(selectores({ etapaId: null }), "selectores-pipeline-y-columna", "e-nueva");
    await esperar();
    expect(avisos.toast.mock.calls.some((c) => pasoDe(c))).toBe(false);
  });

  it("caller y closer: vuelven a quien tenían (o a nadie)", async () => {
    cambiar(selectores(), "selectores-caller", "otro");
    await esperar();
    pasoDe(avisos.toast.mock.calls.find((c) => pasoDe(c)))!.deshacer();
    await esperar();
    expect(fichas.asignarDesdeFicha).toHaveBeenLastCalledWith("L", "caller_id", "ca");
    avisos.toast.mockClear();
    cambiar(selectores(), "selectores-closer", "otro");
    await esperar();
    pasoDe(avisos.toast.mock.calls.find((c) => pasoDe(c)))!.deshacer();
    await esperar();
    expect(fichas.asignarDesdeFicha).toHaveBeenLastCalledWith("L", "closer_id", "");
  });
});

// ---------- Nota (acciones-lead: crearUnaVez pasa el deshacer a useAccion) ----------
describe("4 · nota: crearUnaVez pasa el deshacer al ejecutor", () => {
  it("el 5.º argumento llega a ejecutar", () => {
    const ej = vi.fn();
    const d = () => undefined;
    crearUnaVez(new Set(), ej, () => {})("nota", async () => ({ id: "n1" }), "Nota guardada", false, d);
    expect(ej.mock.calls[0][2]).toBe(d);
  });
});

// ---------- Repartir ----------
describe("3 · repartir: Deshacer devuelve cada lead a su caller de antes", () => {
  it("con lo que devuelve el servidor, asigna por grupos (sin caller = null)", async () => {
    const pintar = () => {
      h.i = 0;
      return RepartirLeads({ callers: [{ id: "c1", nombre: "C1" }], seleccion: ["l1", "l2"] });
    };
    (buscar(pintar(), (e) => e.props["aria-label"] === "Repartir leads")[0].props.onClick as () => void)();
    const repartir = boton(pintar(), "Repartir"); // el de abajo del modal (el que abre dice «Repartir leads»)
    (repartir.props.onClick as () => void)();
    await esperar();
    const paso = pasoDe(avisos.toast.mock.calls.find((c) => pasoDe(c)));
    expect(paso).toBeDefined();
    paso!.deshacer();
    await esperar();
    expect(crm.asignarLeads).toHaveBeenCalledWith(["l1"], "viejo");
    expect(crm.asignarLeads).toHaveBeenCalledWith(["l2"], null);
  });
});
