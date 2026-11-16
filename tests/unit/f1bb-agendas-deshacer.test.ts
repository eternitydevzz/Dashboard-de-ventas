// Fase 1b · zona b (N2, Cristian): en Agendas se deshace (botón y Ctrl+Z) el estado de una cita y moverla de columna.
// Solo los estados que cambian únicamente la cita; no los que mueven el lead, ponen estrellas, venden, reagendan o borran.
// Datos inventados ("Cita 1"), sin nombres reales. Los componentes se pintan como funciones, como f1b-zona-b.test.ts.
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
    useMemo: (fn: () => unknown) => fn(),
  };
});
const avisos = vi.hoisted(() => ({ toast: vi.fn((..._a: unknown[]) => 1) }));
vi.mock("@/components/toasts", () => ({ useToast: () => avisos.toast, useQuitarToast: () => () => {} }));
const acc = vi.hoisted(() => ({
  cambiarEstadoCita: vi.fn(async (..._a: unknown[]) => undefined),
  moverCitaColumna: vi.fn(async (..._a: unknown[]) => undefined),
}));
vi.mock("@/app/(panel)/closer/acciones", () => ({ cambiarEstadoCita: acc.cambiarEstadoCita, reagendarCita: vi.fn(), borrarCita: vi.fn(), cambiarCloserCita: vi.fn() }));
vi.mock("@/app/(panel)/crm/acciones", () => ({ moverCitaColumna: acc.moverCitaColumna }));
vi.mock("@/app/(panel)/leads/acciones", () => ({ registrarVenta: vi.fn() }));
vi.mock("@/app/(panel)/ventas/acciones", () => ({ borrarVenta: vi.fn(), cambiarFormaPago: vi.fn(), registrarCobro: vi.fn() }));
vi.mock("@/app/(panel)/ventas/fila-acciones", () => ({ FilaVentaAcciones: () => null }));
vi.mock("@/components/dialogos", () => ({ confirmar: async () => true }));
vi.mock("@/components/coach", () => ({ CoachIa: () => null }));

const { AccionesCita, seDeshaceEstado } = await import("@/app/(panel)/closer/acciones-cita");
const { TableroClosers } = await import("@/app/(panel)/closer/llamadas/tablero-closers");

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
const pasoDeshacer = () => {
  const c = avisos.toast.mock.calls.find((x) => (x[2] as { deshacer?: unknown } | undefined)?.deshacer);
  return c ? { texto: c[0] as string, deshacer: (c[2] as { deshacer: { deshacer: () => unknown } }).deshacer.deshacer } : null;
};

beforeEach(() => {
  h.slots = [];
  h.tareas = [];
  avisos.toast.mockClear();
  acc.cambiarEstadoCita.mockClear();
  acc.moverCitaColumna.mockClear();
});

describe("qué estados se deshacen", () => {
  it("entre pendiente, confirmación pendiente, confirmada, no show y cancelada: sí", () => {
    expect(seDeshaceEstado("pendiente", "confirmada")).toBe(true);
    expect(seDeshaceEstado("confirmada", "cancelada")).toBe(true);
    expect(seDeshaceEstado("confirmacion_pendiente", "no_show")).toBe(true);
  });
  it("no califica, seguimiento y perdida (mueven el lead y ponen estrellas), cerrada y reagendada: no", () => {
    for (const x of ["no_califica", "seguimiento", "perdida", "cerrada", "reagendada"] as const) {
      expect(seDeshaceEstado("pendiente", x)).toBe(false);
      expect(seDeshaceEstado(x, "pendiente")).toBe(false);
    }
    expect(seDeshaceEstado("pendiente", "pendiente")).toBe(false);
  });
});

// ---------- Botones de la cita (lista de Agendas) ----------
function pintarAcciones(estado: string) {
  h.i = 0;
  return AccionesCita({ cita: { id: "c1", estado: estado as never, lead_id: "l1" }, pasada: false, productos: [], moneda: "EUR" });
}
const pulsar = (el: ReactNode, nombre: string) => (buscar(el, (e) => e.type === "button" && texto(e.props.children as ReactNode).includes(nombre))[0].props.onClick as () => void)();

describe("botones de la cita", () => {
  it("«Confirmar» enseña Deshacer, y Deshacer la vuelve a pendiente con la misma acción", async () => {
    pulsar(pintarAcciones("pendiente"), "Confirmar");
    await esperar();
    expect(acc.cambiarEstadoCita).toHaveBeenCalledWith("c1", "confirmada", "");
    const paso = pasoDeshacer();
    expect(paso?.texto).toBe("Confirmada");
    paso!.deshacer();
    await esperar();
    expect(acc.cambiarEstadoCita).toHaveBeenLastCalledWith("c1", "pendiente", "", undefined, "confirmada");
  });
  it("«No califica» no ofrece Deshacer (mueve el lead en el CRM)", async () => {
    pulsar(pintarAcciones("pendiente"), "No califica");
    await esperar();
    expect(acc.cambiarEstadoCita).toHaveBeenCalledWith("c1", "no_califica", "");
    expect(pasoDeshacer()).toBeNull();
  });
  it("si el servidor falla, no hay Deshacer", async () => {
    acc.cambiarEstadoCita.mockResolvedValueOnce({ error: "No" } as never);
    pulsar(pintarAcciones("confirmada"), "Cancelar");
    await esperar();
    expect(pasoDeshacer()).toBeNull();
  });
});

// ---------- Tablero de Agendas ----------
const tarjeta = (estado: string, natural: string | null) => ({ id: "c1", lead_id: "l1", estado, natural, nombre: "Cita 1", telefono: null, pais: null, fechaTxt: "", quien: "", nota: null, closer: null, pasada: false, recuperar: false });
const col = (id: string, clave: string | null, citas: unknown[] = []) => ({ id, clave, t: id, color: "#000", citas, ventas: [] });
function pintarTablero(columnas: unknown[]) {
  h.i = 0;
  return TableroClosers({ columnas: columnas as never, productos: [], moneda: "EUR", jefe: true });
}
function soltar(el: ReactNode, destino: string, origen: string) {
  const c = buscar(el, (e) => typeof e.props.onDrop === "function" && e.key === destino)[0];
  (c.props.onDrop as (ev: unknown) => void)({ preventDefault: () => {}, dataTransfer: { getData: (k: string) => (k === "text/plain" ? JSON.stringify({ clase: "cita", id: "c1", origen }) : "") } });
}

describe("tablero de Agendas", () => {
  it("cambiar el estado arrastrando (pendiente → cancelada) se deshace volviendo a pendiente", async () => {
    soltar(pintarTablero([col("pendiente", "pendiente", [tarjeta("pendiente", "pendiente")]), col("cancelada", "cancelada")]), "cancelada", "pendiente");
    await esperar();
    expect(acc.cambiarEstadoCita).toHaveBeenCalledWith("c1", "cancelada", "");
    pasoDeshacer()!.deshacer();
    await esperar();
    expect(acc.cambiarEstadoCita).toHaveBeenLastCalledWith("c1", "pendiente", "", undefined, "cancelada");
    expect(acc.moverCitaColumna).not.toHaveBeenCalled();
  });
  it("desde una columna libre: Deshacer devuelve el estado y la columna libre (el cambio de estado la saca de ella)", async () => {
    soltar(pintarTablero([col("libre1", null, [tarjeta("pendiente", "pendiente")]), col("confirmada", "confirmada")]), "confirmada", "libre1");
    await esperar();
    pasoDeshacer()!.deshacer();
    await esperar();
    expect(acc.cambiarEstadoCita).toHaveBeenLastCalledWith("c1", "pendiente", "", undefined, "confirmada");
    expect(acc.moverCitaColumna).toHaveBeenLastCalledWith("c1", "libre1");
  });
  it("a «No califica» arrastrando: sin Deshacer", async () => {
    soltar(pintarTablero([col("pendiente", "pendiente", [tarjeta("pendiente", "pendiente")]), col("no_califica", "no_califica")]), "no_califica", "pendiente");
    await esperar();
    expect(acc.cambiarEstadoCita).toHaveBeenCalledWith("c1", "no_califica", "");
    expect(pasoDeshacer()).toBeNull();
  });
  it("mover a una columna libre se deshace volviendo a la de su estado (null)", async () => {
    soltar(pintarTablero([col("pendiente", "pendiente", [tarjeta("pendiente", "pendiente")]), col("libre1", null)]), "libre1", "pendiente");
    await esperar();
    expect(acc.moverCitaColumna).toHaveBeenCalledWith("c1", "libre1");
    pasoDeshacer()!.deshacer();
    await esperar();
    expect(acc.moverCitaColumna).toHaveBeenLastCalledWith("c1", null, "libre1"); // solo si sigue en «libre1»
  });
  it("de una columna libre a otra libre se deshace volviendo a la primera", async () => {
    soltar(pintarTablero([col("libre1", null, [tarjeta("pendiente", "pendiente")]), col("libre2", null)]), "libre2", "libre1");
    await esperar();
    pasoDeshacer()!.deshacer();
    await esperar();
    expect(acc.moverCitaColumna).toHaveBeenLastCalledWith("c1", "libre1", "libre2");
  });
  it("de una columna libre a la de su estado se deshace volviendo a la libre", async () => {
    soltar(pintarTablero([col("libre1", null, [tarjeta("pendiente", "pendiente")]), col("pendiente", "pendiente")]), "pendiente", "libre1");
    await esperar();
    expect(acc.moverCitaColumna).toHaveBeenCalledWith("c1", null);
    pasoDeshacer()!.deshacer();
    await esperar();
    expect(acc.moverCitaColumna).toHaveBeenLastCalledWith("c1", "libre1", null);
  });
});
