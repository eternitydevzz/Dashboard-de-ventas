// Fase 3 · A4-06: «Cerrar sesión» con una grabación en curso pide confirmación (con `confirmar`, como el resto de la
// app); sin grabación, sale como siempre. Datos inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

vi.mock("react", async (original) => {
  const r = await original<typeof import("react")>();
  return { ...r, useState: (v: unknown) => [v, () => {}], useEffect: () => {}, useRef: (v: unknown) => ({ current: v }), useTransition: () => [false, (f: () => void) => f()] };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: vi.fn() }), usePathname: () => "/crm" }));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/app/(panel)/acciones-globales", () => ({ cambiarProyecto: vi.fn() }));
vi.mock("@/app/login/acciones", () => ({ cerrarSesion: vi.fn() }));
vi.mock("@/components/campana-avisos", () => ({ CampanaAvisos: () => null }));
vi.mock("@/components/animaciones/animaciones", () => ({ useResalteMenu: () => {} }));
vi.mock("@/components/ui", () => ({ Avatar: () => null }));
vi.mock("@/components/eleccion", () => ({ Desplegable: () => null }));
const d = vi.hoisted(() => ({ confirmar: vi.fn(async () => false), grabando: null as unknown }));
vi.mock("@/components/dialogos", () => ({ confirmar: d.confirmar }));
vi.mock("@/components/grabadora", () => ({ useGrabadora: () => ({ grabando: d.grabando }) }));

const { BarraLateral } = await import("@/components/barra-lateral");

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
const props = { perfil: { id: "u1", nombre: "Ana B", rol: "caller", foto: null } as never, proyectos: [], proyecto: { id: "p1", nombre: "P", color: "#000" } as never, menu: [] };
const salir = () => buscar(BarraLateral(props) as ReactNode, (el) => el.props["aria-label"] === "Cerrar sesión")[0];
const clic = async () => {
  const ev = { preventDefault: vi.fn(), currentTarget: { form: { requestSubmit: vi.fn() } } };
  (salir().props.onClick as (e: unknown) => void)(ev);
  await new Promise((r) => setTimeout(r, 0));
  return ev;
};

beforeEach(() => d.confirmar.mockClear());

describe("cerrar sesión", () => {
  it("sin grabación: sale como siempre, sin preguntar", async () => {
    d.grabando = null;
    const ev = await clic();
    expect(d.confirmar).not.toHaveBeenCalled();
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });

  it("grabando y dice que no: se queda", async () => {
    d.grabando = { leadId: "l1", nombre: "Lead 1", desde: 0 };
    d.confirmar.mockResolvedValueOnce(false);
    const ev = await clic();
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(d.confirmar).toHaveBeenCalledWith("Hay una grabación en curso: párala y espera a que se guarde antes de salir. ¿Salir igualmente?", expect.anything());
    expect(ev.currentTarget.form.requestSubmit).not.toHaveBeenCalled();
  });

  it("grabando y dice que sí: sale", async () => {
    d.grabando = { leadId: "l1", nombre: "Lead 1", desde: 0 };
    d.confirmar.mockResolvedValueOnce(true);
    const ev = await clic();
    expect(ev.currentTarget.form.requestSubmit).toHaveBeenCalled();
  });
});
