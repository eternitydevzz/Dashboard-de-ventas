import { readFileSync, existsSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Fase 9 (Cristian, 14 nov 2026: «pantalla de carga y, al terminar, todo ya cargado, sin romper la app»).
const leer = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), "utf8");
const PANEL = "src/app/(panel)";

// Cuenta cada db().from(tabla); cualquier cadena (.select().eq()…) devuelve 0 filas
const tablas: string[] = [];
const cadena: object = new Proxy(() => {}, {
  get: (_t, p) => (p === "then" ? (ok: (r: unknown) => void) => ok({ data: [], error: null }) : () => cadena),
});
vi.mock("@/lib/datos", async (original) => ({
  ...(await original<typeof import("@/lib/datos")>()),
  db: () => ({ from: (t: string) => (tablas.push(t), cadena) }),
  equipo: async () => [],
  conBajas: async () => [],
}));
const cargarBase = vi.fn(async () => ({ gente: [], leads: [], actividades: [], citas: [], ventas: [] }));
vi.mock("@/lib/metricas", () => ({ ASISTIDAS: [], cargarBase, calcularFunnel: () => ({}), enRango: () => true }));
vi.mock("@/lib/biblioteca-datos", () => ({ recalcularOfertas: async () => undefined }));
vi.mock("next/server", () => ({ after: () => undefined }));
// KPIs como CEO (jefe con «KPIs» y «Funnel»)
vi.mock("@/lib/permisos", () => ({
  exigirPagina: async () => ({ perfil: { id: "u1", rol: "ceo" }, proyecto: { id: "p1", nombre: "Proyecto A", zona_horaria: "Europe/Madrid" }, tiene: new Set(["kpis", "funnel"]) }),
  soloLoSuyo: () => false,
}));
vi.mock("@/lib/auth", () => ({ esJefe: () => true }));
const LEADS = { pipelines: [], etapas: [], gente: [], leads: [] };
const cargarLeadsPestana = vi.fn(async () => LEADS);
const cargarUtmsPestana = vi.fn(async () => [{ id: "l1" }]);
vi.mock("@/app/(panel)/kpis/acciones", () => ({ cargarLeadsPestana, cargarUtmsPestana }));
vi.mock("@/lib/canales-datos", () => ({ canalesDe: async () => [] }));

// Busca en el árbol que devuelve la página el elemento del componente con ese nombre
type Nodo = { type?: { name?: string }; props?: Record<string, unknown> } | null;
function buscar(n: unknown, nombre: string): Nodo {
  if (!n || typeof n !== "object") return null;
  if (Array.isArray(n)) {
    for (const x of n) {
      const r = buscar(x, nombre);
      if (r) return r;
    }
    return null;
  }
  const e = n as NonNullable<Nodo>;
  if (e.type?.name === nombre) return e;
  return buscar(e.props?.children, nombre);
}
const abrir = async (vista?: string) => {
  const { default: KpisPage } = await import("@/app/(panel)/kpis/page");
  return KpisPage({ searchParams: Promise.resolve(vista ? { vista } : {}) } as never);
};

describe("Fase 9 · velocidad", () => {
  beforeEach(() => {
    tablas.length = 0;
    vi.clearAllMocks();
  });

  it("(panel)/loading.tsx ya sale al cambiar de sección; sin copias en las carpetas de cada sección", () => {
    // Comprobado en node_modules/next/dist/client/components/layout-router.js: el loading de (panel) envuelve a cada
    // sección hija con su propia clave, así que sale al ir de /crm a /kpis. Un loading.tsx dentro de una sección
    // taparía la pantalla entera en cada filtro o pestaña (la clave de la página lleva la query: __PAGE__?{…}).
    expect(existsSync(new URL(`../../${PANEL}/loading.tsx`, import.meta.url))).toBe(true);
    for (const s of ["kpis", "crm", "caller", "closer", "ventas", "equipo", "finanzas", "reportes", "ranking", "mi-funnel", "manuales", "admin"])
      expect(existsSync(new URL(`../../${PANEL}/${s}/loading.tsx`, import.meta.url)), s).toBe(false);
  });

  it("KPIs → Leads pide a la base lo mismo que antes: 4 lecturas (leads, tarjetas, pipelines, etapas)", async () => {
    const { cargarLeadsKpis } = await import("@/lib/leads-kpis");
    await cargarLeadsKpis({ id: "p1" } as Parameters<typeof cargarLeadsKpis>[0]);
    // 14 nov (noche): leads y tarjetas llevan además su cuenta (petición sin filas) para pedir las páginas juntas
    expect(tablas.sort()).toEqual(["etapas", "leads", "leads", "pipelines", "tarjetas_extra", "tarjetas_extra"]);
  });

  it("/kpis no se precarga al abrir la app en ningún rol (Leads se carga en el servidor)", async () => {
    const { PRECARGA_ROL } = await import("@/lib/mensajes-entrada");
    for (const rutas of Object.values(PRECARGA_ROL)) expect(rutas).not.toContain("/kpis");
  });

  it("vista Leads: los leads llegan como props desde el servidor, sin petición desde el navegador", async () => {
    const pestana = buscar(await abrir(), "PestanaLeads");
    expect(pestana?.props?.datos).toBe(LEADS);
    expect(cargarLeadsPestana).toHaveBeenCalledTimes(1);
    expect(tablas).toEqual(["productos"]); // Ola 2 (14 nov): los pipelines salen de la carga de los leads (antes, una lectura más)
    for (const f of ["leads.tsx", "utms.tsx"]) {
      const codigo = leer(`${PANEL}/kpis/${f}`);
      expect(codigo, f).not.toMatch(/cargarLeadsPestana|cargarUtmsPestana|useEffect\(|data-datos-pendientes/);
    }
  });

  it("vista UTMs: las filas llegan como props desde el servidor", async () => {
    const pestana = buscar(await abrir("utms"), "PestanaUtms");
    expect(pestana?.props?.filas).toEqual([{ id: "l1" }]);
    expect(cargarLeadsPestana).not.toHaveBeenCalled();
  });

  it("vista Funnel: no se leen leads y las mismas lecturas que antes (base + productos)", async () => {
    await abrir("funnel");
    expect(cargarLeadsPestana).not.toHaveBeenCalled();
    expect(cargarUtmsPestana).not.toHaveBeenCalled();
    expect(cargarBase).toHaveBeenCalledTimes(1);
    expect(tablas).toEqual(["productos"]);
  });
});
