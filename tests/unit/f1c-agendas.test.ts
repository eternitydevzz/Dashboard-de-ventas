// Fase 1 · zona C: R9 (Mes/Semana/Día/Lista sin ir al servidor) y S4-9 (no se agenda sin día y hora; «Crear llamada»
// se cierra solo si salió bien). Datos inventados ("Lead 1", "Ana").
import { beforeEach, describe, expect, it, vi } from "vitest";
import { enviarSinVaciar } from "../apoyo/enviar-sin-vaciar";
import { isValidElement, type ReactElement, type ReactNode } from "react";

// Los componentes se llaman como funciones: hooks mínimos con estado entre «pintados» (sin DOM en los tests)
const h = vi.hoisted(() => ({ slots: [] as unknown[], i: 0, params: "", pendiente: null as Promise<unknown> | null }));
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
    useTransition: () => [false, (f: () => void) => f()],
    useMemo: (fn: () => unknown) => fn(),
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/closer/llamadas", useSearchParams: () => new URLSearchParams(h.params) }));
vi.mock("next/link", () => ({ default: function Enlace() { return null; } }));
vi.mock("@/components/modal", () => ({ Modal: function Modal() { return null; } }));
vi.mock("@/components/estrellas", () => ({ SelectorEstrellas: () => null }));
vi.mock("@/components/campos-cita", () => ({ CamposCita: () => null }));
vi.mock("@/components/toasts", () => ({ useToast: () => vi.fn() }));
vi.mock("@/components/acciones-lead", async () => {
  const { exigirOk } = await import("@/lib/resultado-cliente");
  return {
    useAccion: () => ({ pendiente: false, error: "", ejecutar: (fn: () => Promise<unknown>) => void (h.pendiente = exigirOk(fn()).catch(() => {})) }),
  };
});
const agendar = vi.hoisted(() => vi.fn());
vi.mock("@/app/(panel)/leads/acciones", () => ({ agendarCita: agendar }));
vi.mock("@/app/(panel)/closer/acciones", () => ({ buscarLeadsParaLlamada: vi.fn(), descartarCitaSinLead: vi.fn(), importarCitas: vi.fn(), sincronizarGhl: vi.fn(), unirCitaSinLead: vi.fn() }));
vi.mock("@/app/(panel)/leads/agenda", () => ({ huecosAgendaRotacion: vi.fn(() => new Promise(() => {})) }));

import { CrearLlamada, VistasCalendario } from "@/app/(panel)/closer/llamadas/cliente";
import { CalendarioAgenda } from "@/components/calendario-agenda";

type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
// Recorre el árbol (y pinta los componentes de función que no son mocks) y junta los elementos que cumplen `si`
function buscar(n: ReactNode, si: (e: El) => boolean, out: El[] = []): El[] {
  if (Array.isArray(n)) n.forEach((x) => buscar(x, si, out));
  else if (isValidElement(n)) {
    const e = n as El;
    if (si(e)) out.push(e);
    buscar(e.props.children, si, out);
  }
  return out;
}
const pintar = <P,>(C: (p: P) => ReactNode, p: P) => ((h.i = 0), C(p));

beforeEach(() => {
  h.slots = [];
  h.params = "";
  h.pendiente = null;
  agendar.mockReset();
});

describe("R9 · vistas del calendario en el navegador", () => {
  const vistas = { mes: "MES", semana: "SEMANA", dia: "DIA", lista: "LISTA" };
  it("enseña la vista de la dirección y cambia con replaceState, sin pedir la página", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", { history: { replaceState } });
    h.params = "tab=agendas&estado=cerrada";
    let arbol = pintar(VistasCalendario, { estado: "cerrada", ...vistas });
    expect(JSON.stringify(buscar(arbol, () => true).map((e) => e.props.children))).toContain("MES");
    const semana = buscar(arbol, (e) => e.type === "button" && JSON.stringify(e.props.children).includes("Semana"))[0];
    (semana.props.onClick as () => void)();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/closer/llamadas?tab=agendas&estado=cerrada&vista=semana");
    h.params = "tab=agendas&estado=cerrada&vista=semana"; // Next sincroniza useSearchParams con replaceState
    arbol = pintar(VistasCalendario, { estado: "cerrada", ...vistas });
    const todo = JSON.stringify(buscar(arbol, () => true).map((e) => e.props.children));
    expect(todo).toContain("SEMANA");
    expect(todo).not.toContain("MES");
    vi.unstubAllGlobals();
  });
});

describe("S4-9 · agendar sin día y hora", () => {
  it("el campo «fecha» del calendario se valida (no es hidden) y está vacío sin hora", () => {
    h.slots = [{ closer: "Ana", sinHorario: false, dias: [{ ymd: "2026-11-20", horas: [{ t: "10:00", v: "2026-11-20T10:00" }] }], zona: "UTC" }, "", null, null, "2026-11", false, 0];
    const arbol = pintar(CalendarioAgenda, { leadId: "l1" });
    const campo = buscar(arbol, (e) => e.type === "input" && e.props.name === "fecha")[0];
    expect(campo.props.type).not.toBe("hidden");
    expect(campo.props.required).toBe(true);
    expect(campo.props.value).toBe("");
    expect(campo.props.readOnly).toBeFalsy(); // readOnly saltaría la validación del navegador
  });

  it("«Crear llamada» no se cierra si el servidor falla, y se cierra si va bien", async () => {
    const lead = { id: "l1", nombre: "Lead", apellido: "1", telefono: null, email: null };
    const enviar = async () => {
      h.slots = [true, "", [], lead];
      const arbol = pintar(CrearLlamada, { closers: [{ id: "c1", nombre: "Ana" }], soyCloser: null });
      const form = buscar(arbol, (e) => e.type === "form")[0];
      const fd = new FormData();
      fd.set("closer", "c1");
      fd.set("fecha", "2026-11-20T10:00");
      enviarSinVaciar(form.props.onSubmit, fd); // A4-03: el formulario usa sinVaciar (onSubmit), ya no action={…}
      await h.pendiente;
    };
    agendar.mockResolvedValue({ error: "Esa hora ya está ocupada." });
    await enviar();
    expect(h.slots[0]).toBe(true);
    agendar.mockResolvedValue({ ok: true });
    await enviar();
    expect(h.slots[0]).toBe(false);
  });
});
