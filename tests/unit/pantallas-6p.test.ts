import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Perfil, Proyecto } from "@/lib/tipos";

// Ola 6 · 6P: si la base falla, las pantallas lanzan (sale error.tsx) en vez de enseñar vacío; y el conteo de cifras
// no se hace en la primera carga (#418). Datos inventados.

// Base falsa: cada consulta encadena lo que sea y, al esperarla, devuelve lo de su tabla (o el fallo)
const fallan = new Set<string>();
function consulta(tabla: string) {
  const r = fallan.has(tabla) ? { data: null, error: { message: "caída" }, count: null } : { data: [], error: null, count: 1 };
  const q: object = new Proxy(
    {},
    { get: (_, k) => (k === "then" ? (ok: (v: unknown) => unknown) => Promise.resolve(r).then(ok) : () => q) },
  );
  return q;
}
vi.mock("@/lib/datos", () => ({
  db: () => ({ from: consulta }),
  equipo: async () => [],
  todas: async () => [],
}));
vi.mock("@/lib/finanzas-datos", () => ({
  cargarFinanzas: async () => ({ ventas: [{ lead_id: "lead-1" }], vencimientos: [], productos: [] }),
}));
vi.mock("@/lib/clientes", () => ({ resumenClientes: () => [{ lead_id: "lead-1" }] }));

const proyecto = { id: "proy-1", zona_horaria: "America/Bogota" } as unknown as Proyecto;
const caller = { id: "per-1", rol: "caller", tambien_closer: false } as Perfil;

afterEach(() => fallan.clear());

describe("si la base falla, se lanza el error (no pantalla vacía)", () => {
  it("Finanzas: tipo de cambio, gastos programados y leads", async () => {
    const { cargarPantallaFinanzas } = await import("@/app/(panel)/finanzas/cargar");
    await expect(cargarPantallaFinanzas(proyecto)).resolves.toBeTruthy();
    for (const t of ["tipos_cambio", "egresos_programados", "leads"]) {
      fallan.clear();
      fallan.add(t);
      await expect(cargarPantallaFinanzas(proyecto), t).rejects.toThrow(/No se pud/);
    }
  });
  it("Clientes: pasos, productos y leads", async () => {
    const { cargarClientes } = await import("@/app/(panel)/clientes/cargar");
    await expect(cargarClientes(proyecto)).resolves.toBeTruthy();
    for (const t of ["productos", "leads"]) {
      fallan.clear();
      fallan.add(t);
      await expect(cargarClientes(proyecto), t).rejects.toThrow(/No se pud/);
    }
    // pasos_onboarding también la usa asegurarPasos (count null = intenta crearlos): debe acabar lanzando igual
    fallan.add("pasos_onboarding");
    await expect(cargarClientes(proyecto)).rejects.toThrow(/No se pud/);
  });
  it("Permisos: un fallo de lectura lanza (antes se ignoraban los permisos personales)", async () => {
    const { seccionesPermitidas } = await import("@/lib/permisos");
    await expect(seccionesPermitidas(caller, "proy-1")).resolves.toBeInstanceOf(Set);
    fallan.add("permisos_persona");
    await expect(seccionesPermitidas(caller, "proy-1")).rejects.toThrow(/permisos/);
  });
});

describe("#418: el conteo de cifras", () => {
  // DOM mínimo: un panel con una cifra de texto
  const texto = (v: string) => ({ nodeType: 3, nodeValue: v, isConnected: true });
  function pantalla() {
    const nodo = texto("1.234 $");
    const cifra = { childNodes: [nodo], firstChild: nodo };
    const panel = {
      parentElement: null,
      animate: () => ({}),
      querySelectorAll: (sel: string) => (sel.includes("tabular-nums") ? [cifra] : []),
    };
    const raiz = { querySelector: () => null, querySelectorAll: (sel: string) => (sel === ".tarjeta" ? [panel] : []) };
    return { raiz: raiz as unknown as HTMLElement, nodo };
  }
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("Node", { TEXT_NODE: 3 });
    vi.stubGlobal("requestAnimationFrame", () => 0);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sin conteo (primera carga) no toca el texto que hidrata React", async () => {
    const { entrada } = await import("@/components/animaciones/efectos");
    const { raiz, nodo } = pantalla();
    entrada(raiz, { conteo: false });
    expect(nodo.nodeValue).toBe("1.234 $");
  });
  it("con conteo (navegación interna) empieza desde el 80 %", async () => {
    const { entrada } = await import("@/components/animaciones/efectos");
    const { raiz, nodo } = pantalla();
    entrada(raiz);
    expect(nodo.nodeValue).toBe("987 $");
  });
});
