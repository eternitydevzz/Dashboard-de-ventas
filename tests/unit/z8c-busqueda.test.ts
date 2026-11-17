// Fase 8, zona C (A4-12, decidido por Cristian): el buscador del CRM encuentra el email aunque tenga mayúsculas
// (en el email guardado o en lo que se escribe). Mismos mocks que f1b-zona-b.test.ts para importar el tablero.
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/crm" }));
vi.mock("next/link", () => ({ default: function Enlace() { return null; } }));
vi.mock("@/components/toasts", () => ({ useToast: () => vi.fn(), useQuitarToast: () => () => {} }));
vi.mock("@/app/(panel)/crm/acciones", () => ({}));
vi.mock("@/app/(panel)/leads/acciones", () => ({}));
vi.mock("@/components/dialogos", () => ({ confirmar: async () => true, pedirTexto: async () => null }));
vi.mock("@/app/(panel)/caller/ficha-acciones", () => ({ fichasParaExportar: async () => ({}) }));
const { pasaBusqueda } = await import("@/app/(panel)/crm/tablero");

const lead = (email: string) => ({ id: "x", nombre: "Ana", apellido: "", email, telefono: null, pais: null, etiquetas: [] }) as never;

describe("A4-12 · email con mayúsculas", () => {
  it.each([
    ["Ana.Lopez@Gmail.com", "ana.lopez@gmail.com"],
    ["ana.lopez@gmail.com", "ANA.LOPEZ@GMAIL.COM"],
    ["ANA.LOPEZ@GMAIL.COM", "Lopez@gm"],
  ])("«%s» se encuentra con «%s»", (email, q) => {
    expect(pasaBusqueda(lead(email), q)).toBe(true);
  });
  it("otro email no sale", () => {
    expect(pasaBusqueda(lead("Ana.Lopez@Gmail.com"), "pepe@gmail.com")).toBe(false);
  });
});
