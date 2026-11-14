// Ola única · carril B (Cristian, 14 nov): el caller ve en el CRM solo sus leads asignados (F7-B1) y un lead creado
// sin pipeline entra en el primero, como el webhook (F8). Base simulada; sin nombres reales ("caller-1", "Lead A").
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Fila = Record<string, unknown>;
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let consultas: Consulta[];
let tablas: Record<string, Fila[]>;
let falloInsert: { code: string; message: string } | null;

// Aplica los filtros que usa el CRM (eq, not is null, or de eq) sobre las filas de prueba
function filtrar(filas: Fila[], ops: [string, unknown[]][]) {
  return filas.filter((f) =>
    ops.every(([o, a]) => {
      if (o === "eq" && !String(a[0]).includes(".")) return f[a[0] as string] === a[1];
      if (o === "not") return f[a[0] as string] !== null;
      if (o === "or") return String(a[0]).split(",").some((c) => { const [col, , v] = c.split("."); return f[col] === v; });
      return true;
    })
  );
}
const base = () => ({
  from: (tabla: string) => {
    const c: Consulta = { tabla, ops: [] };
    consultas.push(c);
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "not", "or", "order", "range", "limit", "insert", "update", "single", "maybeSingle", "overrideTypes"]) q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
    q.then = (r: (v: unknown) => unknown) => {
      const filas = filtrar(tablas[tabla] ?? [], c.ops);
      const una = c.ops.some(([o]) => o === "single" || o === "maybeSingle");
      if (falloInsert && c.ops.some(([o]) => o === "insert")) return Promise.resolve({ data: null, error: falloInsert }).then(r);
      if (c.ops.some(([o]) => o === "insert")) return Promise.resolve({ data: una ? { id: "nuevo" } : null, error: null }).then(r);
      return Promise.resolve({ data: una ? filas[0] ?? null : filas, error: null }).then(r);
    };
    return q;
  },
  rpc: async () => ({ data: null, error: null }),
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: base }));

let sesion: { perfil: Fila; proyecto: Fila };
vi.mock("@/lib/permisos", () => ({ exigirPagina: async () => sesion, exigirSeccion: async () => sesion }));
vi.mock("@/lib/datos", async (original) => ({
  ...(await original<typeof import("@/lib/datos")>()),
  equipo: async () => [
    { id: "caller-1", nombre: "Caller Uno", rol: "caller" },
    { id: "caller-2", nombre: "Caller Dos", rol: "caller" },
  ],
}));
vi.mock("@/lib/mercado-datos", () => ({ miMoneda: async () => "$" }));
vi.mock("@/lib/canales-datos", () => ({ canalesDe: async () => [] }));
vi.mock("@/lib/tablero-closers", () => ({ cargarCitasVentas: vi.fn(), columnasCloser: vi.fn() }));
vi.mock("@/lib/leads", () => ({ columnaCitasGhl: async () => null, columnaCitasPorNombre: () => null, primeraEtapa: async () => "etapa-1" }));
vi.mock("@/components/ui", () => ({ Cabecera: () => null, Contenido: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/barra-periodo", () => ({ FiltroUrl: () => null }));
vi.mock("@/app/(panel)/crm/tablero", () => ({ TableroCrm: () => null }));
vi.mock("next/navigation", async (original) => ({ ...(await original<typeof import("next/navigation")>()), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/crm" }));

const { getSesion } = await import("@/lib/sesion");
const { default: CrmPage } = await import("@/app/(panel)/crm/page");
const { TableroCrm } = await import("@/app/(panel)/crm/tablero");
const { descompactarCrm } = await import("@/app/(panel)/crm/compacto");
const { crearLeadManual } = await import("@/app/(panel)/crm/acciones");
const { calcularNivel, nivelEnCrm } = await import("@/lib/pipelines");
const { ProveedorToasts } = await import("@/components/toasts");

// Las props que la página le pasa al tablero
function propsTablero(nodo: ReactNode): Record<string, unknown> | null {
  if (Array.isArray(nodo)) return nodo.map(propsTablero).find(Boolean) ?? null;
  if (!isValidElement(nodo)) return null;
  const el = nodo as ReactElement<Record<string, unknown>>;
  return el.type === TableroCrm ? el.props : propsTablero(el.props.children as ReactNode);
}
async function leadsQueVe(pipeline: string) {
  const arbol = await CrmPage({ searchParams: Promise.resolve({ pipeline }) } as never);
  return descompactarCrm(propsTablero(arbol)!.leads as never);
}

const lead = (id: string, caller: string | null, extra: Fila = {}) => ({
  id, nombre: `Lead ${id}`, apellido: "", email: null, telefono: null, pais: null, caller_id: caller, closer_id: null,
  estado_caller: "nuevo", creado_en: "2026-11-14T10:00:00Z", etiquetas: [], respuestas: [], oferta: null,
  proyecto_id: "p1", pipeline_id: "web", etapa_id: "web-nuevos", etapa_callers_id: null, ...extra,
});

beforeEach(() => {
  consultas = [];
  falloInsert = null;
  sesion = { perfil: { id: "caller-1", nombre: "Caller Uno", rol: "caller" }, proyecto: { id: "p1", nombre: "Proyecto", zona_horaria: "Europe/Madrid" } };
  tablas = {
    pipelines: [
      { id: "web", proyecto_id: "p1", nombre: "2. Webinar 1", tipo: "normal", orden: 0 },
      { id: "cal", proyecto_id: "p1", nombre: "Callers", tipo: "callers", orden: 1 },
    ],
    etapas: [
      { id: "web-nuevos", pipeline_id: "web", nombre: "Form", orden: 0 },
      { id: "cal-no-resp", pipeline_id: "cal", nombre: "No responde", orden: 0, estado_caller: "no_responde" },
    ],
    leads: [
      lead("A", "caller-1", { estado_caller: "no_responde", etapa_callers_id: "cal-no-resp" }),
      lead("B", "caller-2"),
      lead("C", null),
    ],
    // Tarjeta 🔗 del lead de otro caller en este pipeline: tampoco le sale
    tarjetas_extra: [{ pipeline_id: "web", etapa_id: "web-nuevos", leads: lead("D", "caller-2") }],
    permisos_pipeline: [],
  };
});

describe("F7-B1 · el caller ve en el CRM solo sus leads asignados", () => {
  it("en un pipeline de origen no recibe leads de otro caller ni sin caller (tampoco sus tarjetas 🔗)", async () => {
    expect((await leadsQueVe("web")).map((l) => l.id)).toEqual(["A"]);
    // El filtro va en la consulta del servidor (no solo en pantalla) y es por caller_id
    const q = consultas.find((c) => c.tabla === "leads")!;
    expect(q.ops).toContainEqual(["or", ["caller_id.eq.caller-1"]]);
  });
  it("sus leads salen en su columna: la del pipeline de origen y, en «Callers», la de su llamada", async () => {
    expect((await leadsQueVe("web")).map((l) => [l.id, l.etapa_id])).toEqual([["A", "web-nuevos"]]);
    expect((await leadsQueVe("cal")).map((l) => [l.id, l.etapa_id])).toEqual([["A", "cal-no-resp"]]);
  });
  it("un caller que también es closer sigue viendo los leads de los que es closer", async () => {
    sesion.perfil.tambien_closer = true;
    tablas.leads.push(lead("E", null, { closer_id: "caller-1" }));
    expect((await leadsQueVe("web")).map((l) => l.id).sort()).toEqual(["A", "E"]);
  });
  it("los jefes siguen viendo todo", async () => {
    sesion.perfil = { id: "jefe-1", nombre: "Director", rol: "director" };
    expect((await leadsQueVe("web")).map((l) => l.id).sort()).toEqual(["A", "B", "C", "D"]);
  });
});

describe("F7-B1 · pipelines con «Sin acceso» para el rol caller (Cristian, 14 nov: «Sí, solo los suyos»)", () => {
  beforeEach(() => {
    tablas.pipelines.push({ id: "bib", proyecto_id: "p1", nombre: "1. Biblioteca Recursos", tipo: "normal", orden: 2 });
    tablas.etapas.push({ id: "bib-form", pipeline_id: "bib", nombre: "Form", orden: 0 });
    tablas.permisos_pipeline = [{ pipeline_id: "bib", rol: "caller", perfil_id: null, nivel: "sin_acceso" }];
    tablas.leads.push(lead("F", "caller-1", { pipeline_id: "bib", etapa_id: "bib-form" }), lead("G", "caller-2", { pipeline_id: "bib", etapa_id: "bib-form" }));
  });
  const tablero = async (pipeline: string) => propsTablero(await CrmPage({ searchParams: Promise.resolve({ pipeline }) } as never))!;

  it("el caller lo ve en el selector, con solo sus leads y en su columna", async () => {
    const t = await tablero("bib");
    expect((t.pipelines as { id: string }[]).map((p) => p.id)).toContain("bib");
    expect((t.pipeline as { id: string }).id).toBe("bib");
    expect(descompactarCrm(t.leads as never).map((l) => [l.id, l.etapa_id])).toEqual([["F", "bib-form"]]);
  });
  it("un caller sin leads en ese pipeline no recibe los de otros", async () => {
    sesion.perfil = { id: "caller-3", nombre: "Caller Tres", rol: "caller" };
    expect(descompactarCrm((await tablero("bib")).leads as never)).toEqual([]);
  });
  it("el nivel es «ver»: no edita columnas; mover sigue bloqueado por exigirNivel (calcularNivel sigue en «Sin acceso»)", async () => {
    expect((await tablero("bib")).editar).toBe(false);
    const filas = tablas.permisos_pipeline as never;
    const caller = sesion.perfil as never;
    expect(nivelEnCrm(caller, { id: "bib", tipo: "normal" }, filas)).toBe("ver");
    expect(calcularNivel(caller, { id: "bib", tipo: "normal" }, filas)).toBe("sin_acceso");
  });
  it("los closers y un «Sin acceso» puesto a la persona no cambian", async () => {
    const filas = [
      { pipeline_id: "bib", rol: "closer", perfil_id: null, nivel: "sin_acceso" },
      { pipeline_id: "bib", rol: null, perfil_id: "caller-9", nivel: "sin_acceso" },
    ] as never;
    expect(nivelEnCrm({ id: "closer-1", rol: "closer" } as never, { id: "bib", tipo: "normal" }, filas)).toBe("sin_acceso");
    expect(nivelEnCrm({ id: "caller-9", rol: "caller" } as never, { id: "bib", tipo: "normal" }, filas)).toBe("sin_acceso");
    // «Closers» sigue sin acceso para el caller (no es un pipeline de origen)
    expect(nivelEnCrm({ id: "caller-1", rol: "caller" } as never, { id: "x", tipo: "closers" }, [])).toBe("sin_acceso");
  });
  it("los jefes siguen viendo todos los leads de ese pipeline", async () => {
    sesion.perfil = { id: "jefe-1", nombre: "Director", rol: "director" };
    expect(descompactarCrm((await tablero("bib")).leads as never).map((l) => l.id).sort()).toEqual(["F", "G"]);
  });
});

describe("F7-B1 · en un pipeline de solo mirar las tarjetas no se arrastran (Cristian, 14 nov: «Sí, bloquear»)", () => {
  beforeEach(() => {
    tablas.pipelines.push({ id: "bib", proyecto_id: "p1", nombre: "1. Biblioteca Recursos", tipo: "normal", orden: 2 });
    tablas.etapas.push({ id: "bib-form", pipeline_id: "bib", nombre: "Form", orden: 0 });
    tablas.permisos_pipeline = [{ pipeline_id: "bib", rol: "caller", perfil_id: null, nivel: "sin_acceso" }];
    tablas.leads.push(lead("F", "caller-1", { pipeline_id: "bib", etapa_id: "bib-form" }));
  });
  const props = async (pipeline: string) => propsTablero(await CrmPage({ searchParams: Promise.resolve({ pipeline }) } as never))!;
  // Pinta el tablero de verdad (no el simulado) con las props que da la página
  async function arrastrables(p: Record<string, unknown>) {
    const { TableroCrm: Real } = await vi.importActual<typeof import("@/app/(panel)/crm/tablero")>("@/app/(panel)/crm/tablero");
    const html = renderToStaticMarkup(createElement(ProveedorToasts, null, createElement(Real, p as never)));
    return { tarjetas: (html.match(/data-id="/g) ?? []).length, conArrastre: (html.match(/draggable="true" data-id="/g) ?? []).length };
  }

  it("con «ver» de solo mirar (su rol, «Sin acceso»), la tarjeta sale pero no se arrastra", async () => {
    const p = await props("bib");
    expect(p.soloMirar).toBe(true);
    expect(await arrastrables(p)).toEqual({ tarjetas: 1, conArrastre: 0 });
  });
  it("con «ver» normal (su pipeline de origen) el caller sigue moviendo sus tarjetas, como en el Paso 0", async () => {
    const p = await props("web");
    expect(p.soloMirar).toBe(false);
    expect(await arrastrables(p)).toEqual({ tarjetas: 1, conArrastre: 1 });
  });
  it("con «editar» (un jefe) se arrastra", async () => {
    sesion.perfil = { id: "jefe-1", nombre: "Director", rol: "ceo" };
    const p = await props("bib");
    expect(p.editar).toBe(true);
    expect(p.soloMirar).toBe(false);
    expect((await arrastrables(p)).conArrastre).toBe(1);
  });
});

describe("F8 · lead creado a mano sin pipeline", () => {
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  beforeEach(() => {
    sesion.perfil = { id: "jefe-1", nombre: "Director", rol: "director" };
    vi.mocked(getSesion).mockResolvedValue(sesion as never);
  });
  const insertado = () => consultas.find((c) => c.tabla === "leads" && c.ops.some(([o]) => o === "insert"))?.ops.find(([o]) => o === "insert")?.[1][0] as Fila;

  it("entra en el primer pipeline de origen (el de menor orden), en su primera columna, como el webhook", async () => {
    tablas.leads = [];
    expect(await crearLeadManual(form({ nombre: "Lead A", email: "lead-a@ejemplo.test" }))).toBeUndefined();
    expect(insertado()).toMatchObject({ pipeline_id: "web", etapa_id: "etapa-1" });
    const pipes = consultas.find((c) => c.tabla === "pipelines")!.ops;
    expect(pipes).toContainEqual(["eq", ["tipo", "normal"]]);
    expect(pipes).toContainEqual(["order", ["orden"]]);
  });
  it("con pipeline elegido, entra en ese", async () => {
    tablas.leads = [];
    await crearLeadManual(form({ nombre: "Lead A", telefono: "+34 600 000 000", pipeline: "web" }));
    expect(insertado()).toMatchObject({ pipeline_id: "web" });
  });
  it("si la base falla, el mensaje es genérico (no el error de la base)", async () => {
    falloInsert = { code: "XX000", message: "fallo en columna_secreta" };
    const r = (await crearLeadManual(form({ nombre: "Lead A", email: "lead-a@ejemplo.test" }))) as { error: string };
    expect(r.error).not.toContain("columna_secreta");
    expect(r.error).toMatch(/Algo ha fallado/);
  });
});
