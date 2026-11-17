// Fases 5-6 zona C (Cristian, 17 nov 2026): X3 / S1-5 / S3-7 · quien tiene «También closer» cuenta como closer
// donde se elige un closer. Decisión de Cristian: NO registra ventas como closer (eso no se toca aquí).
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const leer = (ruta: string) => readFileSync(new URL(`../../src/${ruta}`, import.meta.url), "utf8");

const gente = [
  { perfil_id: "ceo", perfiles: { nombre: "Jefe", email: "j@t", rol: "ceo", activo: true, tambien_closer: false } },
  { perfil_id: "facu", perfiles: { nombre: "Facu", email: "f@t", rol: "caller", activo: true, tambien_closer: true } },
  { perfil_id: "luis", perfiles: { nombre: "Luis", email: "l@t", rol: "caller", activo: true, tambien_closer: true } },
  { perfil_id: "ana", perfiles: { nombre: "Ana", email: "a@t", rol: "closer", activo: true, tambien_closer: false } },
];
// La base simulada solo devuelve las columnas pedidas (así se ve si falta «tambien_closer» en el select)
const fila = (cols: string) => gente.map((m) => ({ perfil_id: m.perfil_id, perfiles: Object.fromEntries(Object.entries(m.perfiles).filter(([k]) => cols.includes(k))) }));
const cadena = (res: unknown) => {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "range"]) c[k] = () => c;
  c.then = (ok: (v: unknown) => unknown) => Promise.resolve(res).then(ok);
  return c;
};
vi.mock("@/lib/datos", () => ({
  db: () => ({ from: (t: string) => ({ select: (cols: string) => cadena(t === "miembros_proyecto" ? { data: fila(cols), error: null } : { count: 0, error: null }) }) }),
  escribir: async (p: unknown) => p,
  // 1.ª lectura: sus leads como caller; 2.ª: como closer
  todas: vi.fn().mockResolvedValueOnce([{ id: "l1" }]).mockResolvedValueOnce([{ id: "l2" }]),
}));
vi.mock("@/lib/sesion", () => ({ getSesion: async () => ({ proyecto: { id: "p1" } }) }));
vi.mock("@/lib/auth", () => ({ exigir: async () => ({ perfil: { id: "ceo", rol: "ceo" }, proyecto: { id: "p1", nombre: "Demo" } }), puedeAdmin: () => true }));
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => undefined }));
vi.mock("@/app/(panel)/equipo/acciones", () => ({ crearMiembro: vi.fn() }));
vi.mock("@/app/(panel)/admin/acciones", () => ({ actualizarMiembro: vi.fn(), enviarEnlaceMagico: vi.fn() }));
vi.mock("@/app/(panel)/crm/acciones", () => ({ asignarLeads: vi.fn() }));

const { herramientaDarDeBaja } = await import("@/lib/mcp/equipo");

describe("S3-7 · dar_de_baja del MCP con quien es «también closer»", () => {
  it("sus leads de caller y de closer pueden ir a otra persona caller y «también closer»", async () => {
    const r = await herramientaDarDeBaja({ persona: "Facu", leadsA: "Luis" });
    expect(r).toMatchObject({ vistaPrevia: true, leads: "2 leads → Luis" });
  });
});

describe("S1-5 / X3 · «También closer» cuenta como closer al elegir un closer", () => {
  it("Fathom: un jefe puede poner la cuenta de un caller «también closer»", () => {
    const f = leer("app/(panel)/closer/llamadas/acciones-fathom.ts");
    expect(f).toMatch(/perfiles!inner\(rol, tambien_closer\)/);
    expect(f).toMatch(/!esCloser\(m\.perfiles/);
  });

  it("Importar citas (CSV): busca los closers con «también closer»", () => {
    const f = leer("app/(panel)/closer/acciones.ts");
    const importar = f.slice(f.indexOf("export async function importarCitas"), f.indexOf("// ---------- Calendario de GHL"));
    expect(importar).not.toMatch(/"perfiles\.rol", "closer"/);
    expect(importar).toMatch(/esCloser\(/);
  });

  it("Webhook de citas de GHL: el closer por email también puede ser «también closer»", () => {
    const f = leer("app/api/webhooks/ghl/[proyectoId]/route.ts");
    expect(f).not.toMatch(/"perfiles\.rol", "closer"/);
    expect(f).toMatch(/esCloser\(/);
  });

  it("registrarVenta no vuelve a bloquear al caller (N1)", () => {
    const f = leer("app/(panel)/leads/acciones.ts");
    expect(f).not.toMatch(/rol === "caller"\) throw new ErrorUsuario\([^)]*venta/i);
  });
});
