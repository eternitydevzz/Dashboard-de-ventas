import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// La barra importa acciones del servidor (Supabase): fuera de Next no hacen falta
vi.mock("@/app/(panel)/acciones-globales", () => ({ cambiarProyecto: vi.fn() }));
vi.mock("@/app/login/acciones", () => ({ cerrarSesion: vi.fn() }));
vi.mock("@/components/campana-avisos", () => ({ CampanaAvisos: () => null }));
const { itemActivo } = await import("@/components/barra-lateral");
const { PRECARGA_ROL } = await import("@/lib/mensajes-entrada");

// D43: «Agendas» va directo a /closer/llamadas (sin pasar por la redirección de /closer)
describe("menú «Agendas»", () => {
  const agendas = { href: "/closer/llamadas", texto: "Agendas", icono: "closer" as const, seccion: "/closer" };
  it.each(["/closer/llamadas", "/closer/analisis", "/closer/reporte/x", "/closer"])("marcado en %s", (ruta) => {
    expect(itemActivo(agendas, ruta)).toBe(true);
  });
  it.each(["/onboarding-closers", "/closers", "/crm"])("no marcado en %s", (ruta) => {
    expect(itemActivo(agendas, ruta)).toBe(false);
  });
  it("Callers (exacto) no se marca en Llamadas de GHL; Llamadas de GHL sí", () => {
    expect(itemActivo({ href: "/caller", texto: "Callers", icono: "caller", exacto: true }, "/caller/grabadas")).toBe(false);
    expect(itemActivo({ href: "/caller/grabadas", texto: "GHL", icono: "grabadas" }, "/caller/grabadas")).toBe(true);
  });
  it("la precarga de cada rol apunta a /closer/llamadas, no a /closer (la bienvenida espera a esa ruta)", () => {
    for (const rutas of Object.values(PRECARGA_ROL)) expect(rutas).not.toContain("/closer");
    expect(PRECARGA_ROL.closer).toContain("/closer/llamadas");
  });
});

// D42 (13 nov): estas pestañas y filtros no hacen precarga completa (cada una pintaba la página entera en el servidor)
const ARCHIVOS = [
  "src/components/selector-mercado.tsx",
  "src/app/(panel)/guiones/page.tsx",
  "src/app/(panel)/finanzas/page.tsx",
  "src/app/(panel)/programas/page.tsx",
  "src/app/(panel)/admin/page.tsx",
  "src/app/(panel)/recursos/page.tsx",
  "src/app/(panel)/clientes/page.tsx",
];

describe("D42 · sin precargas completas en pestañas", () => {
  it.each(ARCHIVOS)("%s no usa prefetch={true}", (archivo) => {
    expect(readFileSync(archivo, "utf8")).not.toMatch(/prefetch=\{true\}/);
  });
});
