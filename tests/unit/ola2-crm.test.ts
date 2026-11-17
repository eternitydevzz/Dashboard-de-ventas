// Ola 2 · carril V3 (Cristian, 14 nov: «enfócate en mejorar la velocidad como sea»): CRM, popup del lead y Mis leads.
// Base simulada; sin nombres reales ("caller-1", "Lead A"). La memoria del servidor (lib/memoria.ts) va simulada
// con un Map que sí guarda (la de verdad no guarda nada en los tests).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

type Fila = Record<string, unknown>;
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let consultas: Consulta[];
let tablas: Record<string, Fila[]>;

function filtrar(filas: Fila[], ops: [string, unknown[]][]) {
  return filas.filter((f) =>
    ops.every(([o, a]) => {
      if (o === "eq" && !String(a[0]).includes(".")) return f[a[0] as string] === a[1];
      if (o === "in") return (a[1] as unknown[]).includes(f[a[0] as string]);
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
      if (c.ops.some(([o]) => o === "insert" || o === "update")) return Promise.resolve({ data: null, error: null }).then(r);
      const sel = c.ops.find(([o]) => o === "select")?.[1][0];
      // Como la base: con una lista simple de columnas, solo llegan esas (sin «*» ni tablas unidas)
      const cols = typeof sel === "string" && !/[*()]/.test(sel) ? sel.split(",").map((x) => x.trim()) : null;
      const filas = filtrar(tablas[tabla] ?? [], c.ops).map((f) => (cols ? Object.fromEntries(cols.map((k) => [k, (f as Fila)[k]])) : f));
      const una = c.ops.some(([o]) => o === "single" || o === "maybeSingle");
      return Promise.resolve({ data: una ? filas[0] ?? null : filas, error: null }).then(r);
    };
    return q;
  },
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: base }));

// Memoria simulada que sí guarda (la de verdad, en los tests, no guarda nada: process.env.VITEST)
const memoria = vi.hoisted(() => {
  const m = new Map<string, Promise<unknown>>();
  return {
    m,
    enMemoria: (k: string, _ms: number, cargar: () => Promise<unknown>) => {
      if (!m.has(k)) m.set(k, cargar());
      return m.get(k)!.then((v) => structuredClone(v));
    },
    olvidarTodo: vi.fn(() => m.clear()),
  };
});
vi.mock("@/lib/memoria", () => ({ enMemoria: memoria.enMemoria, olvidarTodo: memoria.olvidarTodo, UN_MINUTO: 60_000 }));

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
vi.mock("@/lib/tablero-closers", () => ({ cargarCitasVentas: vi.fn(), columnasCloser: vi.fn() }));
vi.mock("@/lib/leads", () => ({ columnaCitasGhl: async () => null, columnaCitasPorNombre: () => null, primeraEtapa: async () => "etapa-1" }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => {} }));
vi.mock("@/components/ui", () => ({ Cabecera: () => null, Contenido: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/barra-periodo", () => ({ FiltroUrl: () => null }));
vi.mock("@/app/(panel)/crm/tablero", () => ({ TableroCrm: () => null }));

const { getSesion } = await import("@/lib/sesion");
const { revalidatePath, refresh } = await import("next/cache");
const { default: CrmPage } = await import("@/app/(panel)/crm/page");
const { TableroCrm } = await import("@/app/(panel)/crm/tablero");
const { descompactarCrm } = await import("@/app/(panel)/crm/compacto");
const { moverLead } = await import("@/app/(panel)/crm/acciones");
const { GET } = await import("@/app/api/leads/[id]/resumen/route");
const { compactarRespuestas, descompactarRespuestas } = await import("@/lib/cola");

function propsTablero(nodo: ReactNode): Record<string, unknown> | null {
  if (Array.isArray(nodo)) return nodo.map(propsTablero).find(Boolean) ?? null;
  if (!isValidElement(nodo)) return null;
  const el = nodo as ReactElement<Record<string, unknown>>;
  return el.type === TableroCrm ? el.props : propsTablero(el.props.children as ReactNode);
}
const tablero = async (pipeline: string) => propsTablero(await CrmPage({ searchParams: Promise.resolve({ pipeline }) } as never))!;

const PREGUNTA = "Si encuentras el programa correcto, ¿estás en condiciones de invertir en tu formación?";
const lead = (id: string, caller: string | null, extra: Fila = {}) => ({
  id, nombre: `Lead ${id}`, apellido: "", email: null, telefono: null, pais: null, caller_id: caller, closer_id: null,
  estado_caller: "nuevo", creado_en: "2026-11-14T10:00:00Z", etiquetas: [], oferta: null, estrellas_caller: null,
  respuestas: [{ pregunta: "¿Qué buscas?", respuesta: "Aprender" }, { pregunta: PREGUNTA, respuesta: "Sí, tengo ahorros" }],
  invertir: "Sí, tengo ahorros", // columna calculada por la base (20261118100000_leads_invertir.sql)
  proyecto_id: "p1", pipeline_id: "web", etapa_id: "web-nuevos", etapa_callers_id: null, ...extra,
});

beforeEach(() => {
  consultas = [];
  memoria.m.clear();
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(refresh).mockClear();
  memoria.olvidarTodo.mockClear();
  sesion = { perfil: { id: "jefe-1", nombre: "Director", rol: "director" }, proyecto: { id: "p1", nombre: "Proyecto", zona_horaria: "Europe/Madrid" } };
  vi.mocked(getSesion).mockImplementation(async () => sesion as never);
  tablas = {
    pipelines: [
      { id: "web", proyecto_id: "p1", nombre: "2. Webinar 1", tipo: "normal", orden: 0 },
      { id: "bib", proyecto_id: "p1", nombre: "1. Biblioteca", tipo: "normal", orden: 1 },
    ],
    etapas: [
      { id: "web-nuevos", pipeline_id: "web", nombre: "Form", orden: 0, pipelines: { proyecto_id: "p1", tipo: "normal" } },
      { id: "web-agenda", pipeline_id: "web", nombre: "Agendan", orden: 1, pipelines: { proyecto_id: "p1", tipo: "normal" } },
      { id: "bib-form", pipeline_id: "bib", nombre: "Form", orden: 0, pipelines: { proyecto_id: "p1", tipo: "normal" } },
    ],
    leads: [lead("A", "caller-1"), lead("B", "caller-2", { respuestas: [], invertir: null }), lead("C", null, { pipeline_id: "bib", etapa_id: "bib-form" })],
    tarjetas_extra: [],
    permisos_pipeline: [],
    productos: [],
    canales: [],
  };
});

describe("CRM: las tarjetas van sin `respuestas` y con «invertir» calculado en el servidor", () => {
  it("el navegador no recibe las respuestas y «invertir» sale igual", async () => {
    const t = await tablero("web");
    const enviado = JSON.stringify(t.leads);
    expect(enviado).not.toContain("respuestas");
    expect(enviado).not.toContain(PREGUNTA);
    expect(enviado).not.toContain("Aprender");
    expect(descompactarCrm(t.leads as never).map((l) => [l.id, l.invertir])).toEqual([["A", "Sí, tengo ahorros"], ["B", null]]);
  });
  it("la base no manda las respuestas: se pide la columna calculada «invertir» (Cristian, 14 nov, noche)", async () => {
    await tablero("web");
    const pedido = consultas.filter((c) => c.tabla === "leads").map((c) => String(c.ops.find(([o]) => o === "select")?.[1][0]));
    expect(pedido.length).toBeGreaterThan(0);
    expect(pedido.every((s) => s.includes("invertir") && !s.includes("respuestas"))).toBe(true);
  });
});

describe("CRM: cambiar de pipeline pide menos a la base", () => {
  it("lo que no depende del pipeline sale de la memoria (1 min): solo se piden leads y tarjetas 🔗", async () => {
    await tablero("web");
    const primera = consultas.map((c) => c.tabla).sort();
    expect(primera).toEqual(["canales", "etapas", "leads", "permisos_pipeline", "pipelines", "productos", "tarjetas_extra"]);
    consultas = [];
    const t = await tablero("bib");
    // Antes de la Ola 2: las 7 de arriba otra vez (5 sin pipeline + 2 del pipeline)
    expect(consultas.map((c) => c.tabla).sort()).toEqual(["leads", "tarjetas_extra"]);
    expect(descompactarCrm(t.leads as never).map((l) => l.id)).toEqual(["C"]);
  });
  it("al guardar en el CRM se borra la memoria y la siguiente carga vuelve a la base", async () => {
    await tablero("web");
    sesion.perfil = { id: "jefe-1", nombre: "Director", rol: "director" };
    await moverLead("A", "web-agenda");
    consultas = [];
    await tablero("web");
    expect(consultas.map((c) => c.tabla)).toContain("pipelines");
  });
});

describe("Mover una tarjeta", () => {
  // Next 16.4.3: en una acción, revalidatePath de CUALQUIER ruta re-pinta la pantalla actual y borra lo guardado en el
  // navegador de todas las demás (revalidate.js «TODO: only revalidate if the path matches»; server-action-reducer.js
  // invalidateEntirePrefetchCache). refresh() solo re-pinta la actual y dejaría KPIs y Mis leads viejos hasta 5 min
  // (staleTimes 300 s). Por eso se queda: 1 revalidatePath y la memoria del servidor borrada (decisión del 13 nov).
  it("revalida una sola vez y borra la memoria (KPIs y Mis leads no se quedan viejos)", async () => {
    const r = await moverLead("A", "web-agenda");
    expect(r).toBeUndefined();
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([["/", "layout"]]);
    expect(refresh).not.toHaveBeenCalled();
    expect(memoria.olvidarTodo).toHaveBeenCalledTimes(1);
  });
});

describe("Popup del lead por GET (no espera en la fila de las acciones)", () => {
  const pedir = async (id: string) => GET(new Request(`http://x/api/leads/${id}/resumen`), { params: Promise.resolve({ id }) });

  it("a quien no puede ver el lead, 403", async () => {
    sesion.perfil = { id: "caller-1", nombre: "Caller Uno", rol: "caller" };
    const res = await pedir("B");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No puedes ver este lead." });
  });
  it("un lead de otro proyecto (o que no existe), 403", async () => {
    expect((await pedir("no-existe")).status).toBe(403);
  });
  it("a quien sí (su caller), los mismos datos que daba la acción, sin el id", async () => {
    sesion.perfil = { id: "caller-1", nombre: "Caller Uno", rol: "caller" };
    tablas.tarjetas_extra = [{ lead_id: "A", pipeline_id: "bib", etapa_id: "bib-form" }];
    const res = await pedir("A");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      nombre: "Lead A",
      telefono: null,
      pais: null,
      email: null,
      donde: [{ pipeline: "2. Webinar 1", columna: "Form" }, { pipeline: "1. Biblioteca", columna: "Form" }],
      entro: expect.any(String),
      caller: "Caller Uno",
      closer: null,
      estado: "Leads", // etiqueta de «nuevo» (ETIQUETA_ESTADO_CALLER)
      estrellas: null,
      etiquetas: [],
      oferta: null,
      respuestas: lead("A", null).respuestas,
    });
    // Solo las columnas que enseña: sin `*` (que traía `datos` de GHL)
    const q = consultas.find((c) => c.tabla === "leads")!;
    expect(q.ops.find(([o]) => o === "select")![1][0]).not.toContain("*");
  });
  it("un jefe ve cualquiera del proyecto", async () => {
    expect((await pedir("C")).status).toBe(200);
  });
});

describe("Mis leads: cada pregunta del formulario va una sola vez", () => {
  const cola = Array.from({ length: 300 }, (_, i) => ({
    id: `l${i}`,
    respuestas: [
      { pregunta: PREGUNTA, respuesta: i % 2 ? "Sí" : "No" },
      { pregunta: `¿Pregunta ${i % 3}?`, respuesta: "" },
    ],
  }));
  it("no se pierde nada (mismo orden y mismas respuestas)", () => {
    const { preguntas, filas } = compactarRespuestas(cola);
    expect(filas.map((f) => ({ id: f.id, respuestas: descompactarRespuestas(preguntas, f.r) }))).toEqual(cola);
    expect(preguntas).toHaveLength(4);
  });
  it("pesa mucho menos", () => {
    const antes = JSON.stringify(cola).length;
    const despues = JSON.stringify(compactarRespuestas(cola)).length;
    expect(despues).toBeLessThan(antes * 0.4);
  });
});
