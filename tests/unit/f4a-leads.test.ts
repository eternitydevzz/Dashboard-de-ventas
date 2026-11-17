// Fase 4 zona a: email ajeno al poner al día (A1-01), canal al juntar citas (A5-04) y tope del espejo (S3-11).
// Base en memoria con el índice único (proyecto_id, lower(email)) de leads; datos inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const base = vi.hoisted(() => ({ tablas: {} as Record<string, Record<string, unknown>[]>, n: 0 }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const filtros: ((f: Fila) => boolean)[] = [];
      let accion = "select";
      let valor: Fila | Fila[] | null = null;
      let uno = false;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "range", "limit"]) q[m] = () => q;
      q.eq = (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q);
      q.in = (c: string, v: unknown[]) => (filtros.push((f) => v.includes(f[c])), q);
      q.neq = (c: string, v: unknown) => (filtros.push((f) => f[c] !== v), q);
      // ilike sin comodines (escapados con \): igual sin mirar mayúsculas
      q.ilike = (c: string, v: string) => (filtros.push((f) => String(f[c] ?? "").toLowerCase() === v.replace(/\\(.)/g, "$1").toLowerCase()), q);
      for (const m of ["update", "insert", "upsert", "delete"]) q[m] = (v: Fila) => ((accion = m), (valor = v), q);
      q.maybeSingle = q.single = () => ((uno = true), q);
      const responder = () => {
        const filas = (base.tablas[tabla] ??= []);
        if (accion === "insert" || accion === "upsert") {
          const nuevas = (Array.isArray(valor) ? valor : [valor!]).map((v) => ({ id: `n${++base.n}`, ...v }));
          filas.push(...nuevas);
          return { data: uno ? nuevas[0] : nuevas, error: null };
        }
        const elegidas = filas.filter((f) => filtros.every((x) => x(f)));
        if (accion === "update") {
          const v = valor as Fila;
          // índice único de leads (proyecto_id, lower(email))
          if (tabla === "leads" && typeof v.email === "string" && elegidas.some((e) => filas.some((o) => o !== e && o.proyecto_id === e.proyecto_id && String(o.email ?? "").toLowerCase() === String(v.email).toLowerCase())))
            return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "leads_proyecto_email"' } };
          for (const f of elegidas) Object.assign(f, v);
        }
        const copias = elegidas.map((f) => ({ ...f }));
        return { data: uno ? copias[0] ?? null : copias, error: null };
      };
      q.then = (r: (v: unknown) => unknown) => Promise.resolve(responder()).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/cifrado", () => ({ descifrar: () => "token" }));
vi.mock("@/lib/aviso-closer", () => ({ avisarCloserAgenda: vi.fn(async () => undefined) }));
vi.mock("@/lib/ghl", async (original) => ({ ...(await original<typeof import("@/lib/ghl")>()), borrarCitaGhl: vi.fn(async () => true) }));
const { guardarLeads, juntarConCitaAbierta } = await import("@/lib/leads");
const { espejoGhl } = await import("@/lib/ghl-espejo");

const proyecto = { id: "p1" } as Parameters<typeof guardarLeads>[0];
const entrada = (o: Fila) => ({ ghl_contact_id: null, nombre: "", apellido: "", email: null, telefono: null, etiquetas: [], respuestas: [], creado_en: null, ...o }) as Parameters<typeof guardarLeads>[1][number];

beforeEach(() => {
  base.n = 0;
  base.tablas = { leads: [], ghl_contactos_unidos: [], actividades: [], tarjetas_extra: [] };
});

describe("A1-01 · GHL trae un email que ya es de otro lead", () => {
  it("no se pone el email (sin romper) y el resto de datos sí", async () => {
    base.tablas.leads = [
      { id: "a", proyecto_id: "p1", ghl_contact_id: "g1", email: null, nombre: "", etiquetas: [], respuestas: [] },
      { id: "b", proyecto_id: "p1", ghl_contact_id: "g2", email: "ana@x.com", nombre: "Ana", etiquetas: [], respuestas: [] },
      { id: "c", proyecto_id: "p1", ghl_contact_id: "g3", email: null, nombre: "", etiquetas: [], respuestas: [] },
    ];
    const g = await guardarLeads(proyecto, [entrada({ ghl_contact_id: "g1", email: "uno@x.com", nombre: "Uno" }), entrada({ ghl_contact_id: "g3", email: "ana@x.com", nombre: "Lucía" })], { pipelineId: null, origen: "ghl", perfilId: null, repartir: false });
    expect(g.actualizados).toBe(2);
    const [a, b, c] = base.tablas.leads;
    expect(a).toMatchObject({ email: "uno@x.com", nombre: "Uno" });
    expect(b).toMatchObject({ email: "ana@x.com", nombre: "Ana" }); // en la base los emails van en minúsculas (0 de 2.599 con mayúsculas, 17 nov)
    expect(c).toMatchObject({ email: null, nombre: "Lucía" });
  });

  it("dos leads sin email que reciben el mismo en la misma tanda: solo lo recibe el primero", async () => {
    base.tablas.leads = ["g1", "g2"].map((g) => ({ id: g, proyecto_id: "p1", ghl_contact_id: g, email: null, etiquetas: [], respuestas: [] }));
    await guardarLeads(proyecto, [entrada({ ghl_contact_id: "g1", email: "mismo@x.com" }), entrada({ ghl_contact_id: "g2", email: "mismo@x.com" })], { pipelineId: null, origen: "ghl", perfilId: null, repartir: false });
    expect(base.tablas.leads.map((l) => l.email)).toEqual(["mismo@x.com", null]);
  });
});

describe("A5-04 · al juntar citas no se pierde el canal", () => {
  beforeEach(() => {
    base.tablas.proyectos = [{ id: "p1", zona_horaria: "Europe/Madrid", ghl_token: "x" }];
    base.tablas.citas = [{ id: "c1", proyecto_id: "p1", lead_id: "l1", estado: "pendiente", fecha: "2026-11-21T16:00:00.000Z", closer_id: "k1", agendada_por: null, ghl_cita_id: "g-vieja", canal: "callers", ghl_calendario: "Cal A", origen_url: "https://web/a" }];
  });

  it("la que entra sin canal no borra el de la que se queda", async () => {
    await juntarConCitaAbierta("p1", "l1", { fecha: "2026-11-22T18:00:00.000Z", closerId: null, ghlCitaId: "g-nueva", origen: "ghl", agendadaPor: null, extra: { ghl_calendario: "Cal B", canal: null, origen_url: null } }, { sinAviso: true });
    expect(base.tablas.citas[0]).toMatchObject({ canal: "callers", origen_url: "https://web/a", ghl_calendario: "Cal B", ghl_cita_id: "g-nueva" });
  });

  it("si la que entra sí tiene canal, manda la nueva", async () => {
    base.tablas.citas[0] = { ...base.tablas.citas[0], canal: null, origen_url: null };
    await juntarConCitaAbierta("p1", "l1", { fecha: "2026-11-22T18:00:00.000Z", closerId: null, ghlCitaId: "g-nueva", origen: "ghl", agendadaPor: null, extra: { ghl_calendario: "Cal B", canal: "directo", origen_url: "https://web/b" } }, { sinAviso: true });
    expect(base.tablas.citas[0]).toMatchObject({ canal: "directo", origen_url: "https://web/b" });
  });
});

describe("S3-11 · el espejo avisa cuando llega al tope de oportunidades", () => {
  const fetchGhl = (paginas: number) =>
    (async (url: string) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/opportunities/pipelines")) return new Response(JSON.stringify({ pipelines: [{ id: "pg", name: "2. Webinar 1", stages: [{ id: "s1", name: "Nuevo" }] }] }));
      const pag = Number(u.searchParams.get("startAfter") ?? 0);
      // stage «otra» (no está en el pipeline): así no hay nada que mover
      const ops = Array.from({ length: 100 }, (_, i) => ({ id: `o${pag}-${i}`, contactId: `k${pag}-${i}`, pipelineStageId: "otra" }));
      return new Response(JSON.stringify({ opportunities: ops, meta: pag + 1 < paginas ? { startAfter: pag + 1, startAfterId: "x" } : {} }));
    }) as unknown as typeof fetch;

  beforeEach(() => {
    base.tablas.ghl_espejo = [];
    base.tablas.pipelines = [{ id: "pa", proyecto_id: "p1", nombre: "2. Webinar 1", tipo: "normal" }];
    base.tablas.etapas = [{ id: "e1", pipeline_id: "pa", nombre: "Nuevo", orden: 0 }];
  });
  const p = { id: "p1", ghl_location_id: "loc" } as Parameters<typeof espejoGhl>[0];

  it("con más de 2.000 oportunidades deja un aviso", async () => {
    const r = await espejoGhl(p, "tok", new Map(), { fetchImpl: fetchGhl(25) });
    expect(r.avisos.some((a) => a.includes("2. Webinar 1") && a.includes("2.000"))).toBe(true);
  });

  it("con menos, ningún aviso", async () => {
    const r = await espejoGhl(p, "tok", new Map(), { fetchImpl: fetchGhl(3) });
    expect(r.avisos).toEqual([]);
  });
});
