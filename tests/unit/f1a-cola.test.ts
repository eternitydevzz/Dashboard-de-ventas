// Fase 1 · zona a (pantalla del caller): buscador, cola optimista, guion y venta.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buscaCola } from "@/lib/cola";

const leer = (f: string) => readFileSync(f, "utf8");
const andre = { nombre: "André", apellido: "Gómez  Ruiz", telefono: "+34 600 123 456" };

describe("R8 / A3-02 · buscador", () => {
  it("sin tildes, sin mayúsculas y con espacios de más", () => {
    expect(buscaCola(andre, "andre")).toBe(true);
    expect(buscaCola(andre, "  ANDRÉ   gómez ")).toBe(true);
    expect(buscaCola(andre, "gomez ruiz")).toBe(true);
    expect(buscaCola(andre, "maria")).toBe(false);
  });
  it("teléfonos: 00 ↔ +, espacios y guiones", () => {
    expect(buscaCola(andre, "0034600123")).toBe(true);
    expect(buscaCola(andre, "+34 600-123")).toBe(true);
    expect(buscaCola(andre, "600 123 456")).toBe(true);
    expect(buscaCola({ ...andre, telefono: "0034 600 123 456" }, "+34600")).toBe(true);
    expect(buscaCola(andre, "999")).toBe(false);
    expect(buscaCola({ ...andre, telefono: null }, "600")).toBe(false);
  });
  it("vacío = todos", () => {
    expect(buscaCola(andre, "   ")).toBe(true);
  });
  it("la página busca en todos los leads del caller con ?q= (no solo en los 300 que se ven)", () => {
    const p = leer("src/app/(panel)/caller/page.tsx");
    expect(p).toMatch(/buscaCola\(/);
    expect(p).toMatch(/sp\.q/);
  });
});

describe("A3-01 · ?lead= sin columna usa la columna del propio lead", () => {
  it("la columna sale del lead pedido", () => {
    expect(leer("src/app/(panel)/caller/page.tsx")).toMatch(/pedidoSinColumna\?\.estado_caller/);
  });
});

describe("C1/R2/C13 · el lead se mueve al instante y los botones no se bloquean", () => {
  const a = leer("src/components/acciones-lead.tsx");
  const c = leer("src/app/(panel)/caller/cola.tsx");
  it("la cola usa useOptimistic y AccionesLead avisa del cambio dentro de la transición", () => {
    expect(c).toMatch(/useOptimistic/);
    expect(c).toMatch(/onCambio=/);
    expect(a).toMatch(/onCambio\?\.\(/);
  });
  it("los botones de resultado y «Mover a» ya no llevan disabled={pendiente}", () => {
    const tarjeta = a.slice(a.indexOf("¿Cómo ha ido?"), a.indexOf("export function FormVenta"));
    expect(tarjeta).not.toMatch(/disabled=\{pendiente\}[^>]*onClick=\{\(\) => resultado|disabled=\{pendiente\} onChange/);
  });
  it("«Guardando…» es un aviso de espera que se quita al llegar la respuesta, y el final lleva «Deshacer»", () => {
    expect(a).toMatch(/"Guardando…", "cargando"/);
    expect(a).toMatch(/quitarAviso\(espera\)/);
    expect(a).toMatch(/deshacer: \{ texto/);
  });
  it("sin rastro de «No responde» en el componente", () => {
    expect(a).not.toMatch(/no_responde|PhoneOff/);
    expect(leer("src/app/(panel)/leads/acciones.ts")).not.toMatch(/"no_responde"/);
  });
});

describe("N1 / S4-9 · Venta", () => {
  const a = leer("src/components/acciones-lead.tsx");
  it("el caller ve los productos (puede registrar ventas)", () => {
    expect(a).not.toMatch(/rol === "caller" \? \[\] : productos/);
  });
  it("la ventana de venta se cierra solo si se guardó", () => {
    expect(a).toMatch(/exigirOk\(registrarVenta\(leadId, fd\)\).then\(\(\) => setVentaAbierta\(false\)\)/);
    expect(a).not.toMatch(/<form action=\{onEnviar\}/); // con action, React vacía el formulario aunque falle
  });
  it("el guion tiene «Venta» justo antes de «Siguiente»", () => {
    const g = leer("src/components/guion-llamada.tsx");
    expect(g.indexOf("onVenta &&")).toBeGreaterThan(0);
    expect(g.indexOf("onVenta &&")).toBeLessThan(g.indexOf("{onSiguiente && ("));
  });
});

describe("A3b-03 · el foco no sale del guion", () => {
  it("atrapa el foco dentro de las ventanas mientras el guion está abierto", () => {
    const g = leer("src/components/guion-llamada.tsx");
    expect(g).toMatch(/focusin/);
    expect(g).toMatch(/closest\('\[role="dialog"\]'\)/);
  });
});
