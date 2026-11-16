// Fase 4 zona a: lectura de leads de GHL (A1-01 y S3-8). Base en memoria y GHL simulado, datos inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const base = vi.hoisted(() => ({ tablas: {} as Record<string, Record<string, unknown>[]>, nuevos: [] as Record<string, unknown>[], cambiados: [] as Record<string, unknown>[], lecturas: 0 }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const filtros: ((f: Fila) => boolean)[] = [];
      let accion = "select";
      let valor: Fila | null = null;
      let uno = false;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "range"]) q[m] = () => q;
      q.limit = () => q;
      q.eq = (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q);
      q.in = (c: string, v: unknown[]) => (filtros.push((f) => v.includes(f[c])), q);
      q.gt = (c: string, v: string) => (filtros.push((f) => String(f[c]) > v), q);
      q.lt = (c: string, v: string) => (filtros.push((f) => String(f[c]) < v), q);
      q.not = (c: string) => (filtros.push((f) => f[c] != null), q);
      for (const m of ["update", "insert", "upsert", "delete"]) q[m] = (v: Fila) => ((accion = m), (valor = v), q);
      q.maybeSingle = q.single = () => ((uno = true), q);
      const responder = () => {
        const filas = (base.tablas[tabla] ??= []);
        if (accion === "insert") return { data: null, error: null };
        if (accion === "upsert") {
          const i = filas.findIndex((f) => f.opp_id === valor!.opp_id);
          if (i >= 0) filas[i] = { ...valor };
          else filas.push({ ...valor });
          return { data: null, error: null };
        }
        const elegidas = filas.filter((f) => filtros.every((x) => x(f)));
        if (accion === "delete") base.tablas[tabla] = filas.filter((f) => !elegidas.includes(f));
        if (accion === "update") for (const f of elegidas) Object.assign(f, valor);
        const copias = elegidas.map((f) => ({ ...f }));
        return { data: uno ? copias[0] ?? null : copias, error: null };
      };
      q.then = (r: (v: unknown) => unknown) => Promise.resolve(responder()).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/ghl-espejo", () => ({ espejoGhl: async () => ({ nuevos: 0, anadidos: 0, movidos: 0, columnas: 0, avisos: [], errores: [] }) }));
vi.mock("@/lib/leads", async (original) => ({
  ...(await original<typeof import("@/lib/leads")>()),
  contactosPrincipales: async () => new Map(),
  guardarLeads: vi.fn(async () => ({ insertados: 0, actualizados: 1 })),
}));
vi.mock("@/lib/ghl", async (original) => ({
  ...(await original<typeof import("@/lib/ghl")>()),
  camposGhl: async () => [],
  contactoGhl: async () => null,
  // Como GHL: filtro «campo > desde», orden ascendente y como mucho `limite`
  contactosNuevosGhl: async (o: { desde: Date; limite: number; campo?: string }) => {
    if (o.campo === "dateUpdated") return base.cambiados;
    base.lecturas++;
    return base.nuevos
      .filter((c) => String(c.dateAdded) > o.desde.toISOString())
      .sort((a, b) => String(a.dateAdded).localeCompare(String(b.dateAdded)))
      .slice(0, o.limite);
  },
}));
const { guardarLeads } = await import("@/lib/leads");
const { leerLeadsGhl } = await import("@/lib/ghl-leads");

const T0 = new Date("2026-11-14T20:00:00.000Z").getTime();
const proyecto = () => ({ id: "p1", ghl_location_id: "loc", ...(base.tablas.proyectos[0] as Fila) }) as unknown as Parameters<typeof leerLeadsGhl>[0];

beforeEach(() => {
  vi.mocked(guardarLeads).mockClear();
  base.lecturas = 0;
  base.nuevos = [];
  base.cambiados = [];
  base.tablas = { proyectos: [{ id: "p1", ghl_leads_hasta: new Date(T0).toISOString() }], ghl_oportunidades_vistas: [], pipelines: [], leads: [], tarjetas_extra: [] };
});

describe("A1-01 · un contacto que falla no para a los demás", () => {
  it("3 contactos cambiados, el 2.º falla al guardar → el 1.º y el 3.º se ponen al día", async () => {
    base.tablas.leads = ["g1", "g2", "g3"].map((g) => ({ id: `l-${g}`, proyecto_id: "p1", ghl_contact_id: g, pipeline_id: null, nombre: "", apellido: "", email: null, telefono: null, etiquetas: [], respuestas: [] }));
    base.cambiados = ["g1", "g2", "g3"].map((g, i) => ({ id: g, firstName: `Nombre${i}`, dateAdded: new Date(T0 - 3600_000).toISOString() }));
    vi.mocked(guardarLeads).mockImplementation(async (_p, entradas) => {
      if (entradas[0].ghl_contact_id === "g2") throw new Error('duplicate key value violates unique constraint "leads_proyecto_email"');
      return { insertados: 0, actualizados: 1 } as never;
    });
    const r = await leerLeadsGhl(proyecto(), "tok", { ahora: new Date(T0 + 60_000) });
    expect(vi.mocked(guardarLeads).mock.calls.map((c) => c[1][0].ghl_contact_id)).toEqual(["g1", "g2", "g3"]);
    expect(r.puestosAlDia).toBe(2);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain("g2");
  });
});

describe("S3-8 · el cursor avanza aunque la página entera ya esté vista", () => {
  it("150 contactos en 15 s (una importación): con varias lecturas entran todos", async () => {
    base.nuevos = Array.from({ length: 150 }, (_, i) => ({ id: `c${String(i).padStart(3, "0")}`, dateAdded: new Date(T0 + 1000 + i * 100).toISOString(), tags: [] }));
    const ahora = new Date(T0 + 3600_000); // ya pasó la espera sin etiqueta
    for (let i = 0; i < 8; i++) await leerLeadsGhl(proyecto(), "tok", { ahora });
    expect(base.tablas.ghl_oportunidades_vistas).toHaveLength(150);
    expect(base.tablas.proyectos[0].ghl_leads_hasta).toBe(base.nuevos[149].dateAdded);
  });

  it("los vistos mueven el cursor, pero no por encima de un pendiente que aún espera su etiqueta", async () => {
    const ahora = T0 + 3600_000;
    base.nuevos = [
      { id: "v1", dateAdded: new Date(T0 + 1000).toISOString(), tags: [] },
      { id: "v2", dateAdded: new Date(T0 + 2000).toISOString(), tags: [] },
      { id: "espera", dateAdded: new Date(ahora - 30_000).toISOString(), tags: [] }, // recién creado, sin etiqueta
      { id: "v3", dateAdded: new Date(ahora - 20_000).toISOString(), tags: [] },
    ];
    base.tablas.ghl_oportunidades_vistas = ["v1", "v2", "v3"].map((id) => ({ proyecto_id: "p1", opp_id: id, contact_id: id, visto_en: new Date(ahora).toISOString() }));
    await leerLeadsGhl(proyecto(), "tok", { ahora: new Date(ahora) });
    expect(base.tablas.proyectos[0].ghl_leads_hasta).toBe(base.nuevos[1].dateAdded);
  });
});
