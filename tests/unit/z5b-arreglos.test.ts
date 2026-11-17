// Fases 5-6 · zona B: S1-6, X3 (crm), S1-7, S1-17, S1-8, S1-22, S2-7, S2-18 y X4 (listas de Administración).
// Base simulada como en c9-arreglos: cada consulta guarda sus pasos y contesta lo que diga `contestar`.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string; code?: string } | null; count?: number };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let consultas: Consulta[];
let contestar: (c: Consulta) => Resp | undefined;
const tipo = (c: Consulta) => ["delete", "upsert", "update", "insert"].find((o) => c.ops.some(([x]) => x === o)) ?? "select";
const arg = (c: Consulta, op: string) => c.ops.find(([x]) => x === op)?.[1];
const tiene = (c: Consulta, op: string) => c.ops.some(([x]) => x === op);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { createUser: async () => ({ data: { user: { id: "nuevo" } }, error: null }), deleteUser: async () => ({ error: null }) } },
    rpc: async () => ({ data: null, error: null }),
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "not", "is", "ilike", "or", "neq", "gte", "lte", "order", "range", "limit", "update", "insert", "upsert", "delete", "maybeSingle", "single"])
        q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: Resp) => unknown, f?: (e: unknown) => unknown) => Promise.resolve(contestar(c) ?? { data: null, error: null }).then(r, f);
      return q;
    },
  }),
}));
vi.mock("@/lib/permisos", async (original) => ({
  ...(await original<typeof import("@/lib/permisos")>()),
  exigirSeccion: async () => (await import("@/lib/sesion")).getSesion(),
}));
vi.mock("@/lib/pipelines", async (original) => ({ ...(await original<typeof import("@/lib/pipelines")>()), exigirNivel: async () => ({ pipeline: { tipo: "normal" } }) }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => undefined }));
vi.mock("@/lib/datos", async (original) => ({ ...(await original<typeof import("@/lib/datos")>()), equipo: async () => [], registrarActividad: async () => undefined }));
vi.mock("@/lib/permisos-datos", () => ({ cargarDatosPermisos: async () => null }));
vi.mock("@/lib/equipo", () => ({ cargarEquipo: async () => ({ miembros: [], comisionesRol: {} }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "x" }), cookies: async () => ({ get: () => undefined }) }));

const { getSesion } = await import("@/lib/sesion");
const crm = await import("@/app/(panel)/crm/acciones");
const admin = await import("@/app/(panel)/admin/acciones");
const { crearMiembro } = await import("@/app/(panel)/equipo/acciones");
const { guardarMiPerfil } = await import("@/app/(panel)/perfil/acciones");

const fallo: Resp = { data: null, error: { message: "la base no responde" } };
const de = (tabla: string, t: string) => consultas.filter((c) => c.tabla === tabla && tipo(c) === t);
const sesion = (proyecto: Record<string, unknown> = {}) =>
  vi.mocked(getSesion).mockResolvedValue({ perfil: { id: "ceo", rol: "ceo", nombre: "Ana" }, proyectos: [], proyecto: { id: "p1", nombre: "Eternity", zona_horaria: "Europe/Madrid", ...proyecto } } as never);

beforeEach(() => {
  consultas = [];
  contestar = () => undefined;
  sesion();
});

describe("S1-6 · asignarLeads", () => {
  it("quita repetidos y vacíos", async () => {
    expect(await crm.asignarLeads(["a", "a", "", "b"], null)).toBeUndefined();
    expect(arg(de("leads", "update")[0], "in")?.[1]).toEqual(["a", "b"]);
  });
  it("más de 2.000 leads: error y no toca nada", async () => {
    const r = await crm.asignarLeads(Array.from({ length: 2001 }, (_, i) => `n${i}`), null);
    expect(r).toMatchObject({ error: expect.stringMatching(/2000/) });
    expect(de("leads", "update")).toHaveLength(0);
  });
  it("si falla el historial, la pantalla recibe error", async () => {
    contestar = (c) => (c.tabla === "actividades" ? fallo : c.tabla === "leads" && tipo(c) === "update" ? { data: [{ id: "a" }], error: null } : undefined);
    expect(await crm.asignarLeads(["a"], null)).toMatchObject({ error: expect.any(String) });
  });
  it("el historial solo se apunta en los leads de este proyecto (los que se cambiaron)", async () => {
    contestar = (c) => (c.tabla === "leads" && tipo(c) === "update" ? { data: [{ id: "a" }], error: null } : undefined);
    await crm.asignarLeads(["a", "deOtro"], null);
    expect((arg(de("actividades", "insert")[0], "insert")?.[0] as { lead_id: string }[]).map((x) => x.lead_id)).toEqual(["a"]);
  });
});

describe("X3 · asignar a un closer «también closer»", () => {
  const persona = (rol: string, tambien_closer: boolean) => (c: Consulta) =>
    c.tabla === "miembros_proyecto" ? { data: { perfil_id: "facu", perfiles: { rol, tambien_closer } }, error: null } : undefined;
  it("un caller con «también closer» puede recibir leads como closer", async () => {
    contestar = persona("caller", true);
    expect(await crm.asignarLeads(["a"], undefined, "facu")).toBeUndefined();
  });
  it("un caller sin «también closer» no", async () => {
    contestar = persona("caller", false);
    expect(await crm.asignarLeads(["a"], undefined, "facu")).toMatchObject({ error: "Esa persona no es closer de este proyecto." });
  });
  it("como caller sigue haciendo falta el rol caller", async () => {
    contestar = persona("closer", false);
    expect(await crm.asignarLeads(["a"], "facu")).toMatchObject({ error: "Esa persona no es caller de este proyecto." });
  });
});

describe("S1-7 · cambiarEtiquetas, con las reglas de Administración", () => {
  const leads = (etiquetas: string[]) => (c: Consulta) =>
    c.tabla === "leads" && tipo(c) === "select" ? { data: ((arg(c, "in")?.[1] ?? []) as string[]).map((id) => ({ id, etiquetas })), error: null } : undefined;
  it("«Agenda» se guarda en minúsculas", async () => {
    contestar = leads([]);
    await crm.cambiarEtiquetas(["a"], [" Agenda "], []);
    expect(arg(de("leads", "update")[0], "update")?.[0]).toEqual({ etiquetas: ["agenda"] });
  });
  it("con coma o de más de 80 letras, error", async () => {
    contestar = leads([]);
    expect(await crm.cambiarEtiquetas(["a"], ["a,b"], [])).toMatchObject({ error: expect.any(String) });
    expect(await crm.cambiarEtiquetas(["a"], ["x".repeat(81)], [])).toMatchObject({ error: expect.any(String) });
    expect(await crm.cambiarEtiquetas(["a"], ["x".repeat(80)], [])).toBe(1);
  });
  it("450 leads con las mismas etiquetas: 3 escrituras (por trozos), no 450", async () => {
    contestar = leads(["vip"]);
    expect(await crm.cambiarEtiquetas(Array.from({ length: 450 }, (_, i) => `n${i}`), ["nuevo"], [])).toBe(450);
    expect(de("leads", "update").map((c) => (arg(c, "in")?.[1] as string[]).length)).toEqual([200, 200, 50]);
  });
});

describe("S1-17 · moverEtapa no se traga errores", () => {
  const etapas = (update: Resp) => (c: Consulta) => {
    if (c.tabla !== "etapas") return undefined;
    if (tipo(c) === "update") return update;
    if (tiene(c, "maybeSingle")) return { data: { id: "e2", pipeline_id: "pp", nombre: "B", pipelines: { tipo: "normal" } }, error: null };
    return { data: [{ id: "e1" }, { id: "e2" }], error: null };
  };
  it("sube la columna: e2 queda primera", async () => {
    contestar = etapas({ data: null, error: null });
    expect(await crm.moverEtapa("e2", -1)).toBeUndefined();
    expect(de("etapas", "update").map((c) => [arg(c, "eq")?.[1], (arg(c, "update")?.[0] as { orden: number }).orden])).toEqual([["e2", 0], ["e1", 1]]);
  });
  it("si falla guardar, error", async () => {
    contestar = etapas(fallo);
    expect(await crm.moverEtapa("e2", -1)).toMatchObject({ error: expect.any(String) });
  });
});

describe("S1-8 · tramos y preguntas se mezclan con lo guardado en la base, no con la memoria", () => {
  it("guardar los de closers no pisa los de callers guardados hace un momento", async () => {
    sesion({ tramos_comision: null }); // la memoria todavía no tiene los de callers
    const callers = [{ desde: 0, pct: 7 }];
    contestar = (c) => (c.tabla === "proyectos" && tipo(c) === "select" ? { data: { tramos_comision: { caller: callers } }, error: null } : undefined);
    expect(await admin.guardarTramos("closer", [{ desde: 0, pct: 10 }])).toBeUndefined();
    expect(arg(de("proyectos", "update")[0], "update")?.[0]).toEqual({ tramos_comision: { caller: callers, closer: [{ desde: 0, pct: 10 }] } });
  });
  it("preguntas: borrar las de callers no borra las de closers guardadas hace un momento", async () => {
    sesion({ preguntas_reporte: { caller: [] } });
    contestar = (c) => (c.tabla === "proyectos" && tipo(c) === "select" ? { data: { preguntas_reporte: { caller: [], closer: ["q"] } }, error: null } : undefined);
    expect(await admin.guardarPreguntasReporte("caller", null)).toBeUndefined();
    expect(arg(de("proyectos", "update")[0], "update")?.[0]).toEqual({ preguntas_reporte: { closer: ["q"] } });
  });
  it("si no se puede leer lo guardado, error y no escribe", async () => {
    contestar = (c) => (c.tabla === "proyectos" && tipo(c) === "select" ? fallo : undefined);
    expect(await admin.guardarTramos("closer", [{ desde: 0, pct: 10 }])).toMatchObject({ error: expect.any(String) });
    expect(de("proyectos", "update")).toHaveLength(0);
  });
});

describe("S1-22 · una sola forma de crear usuarios (la de Equipo)", () => {
  it("Administración ya no tiene crearUsuario ni FormUsuario", async () => {
    expect("crearUsuario" in admin).toBe(false);
    expect("FormUsuario" in (await import("@/app/(panel)/admin/cliente"))).toBe(false);
  });
});

describe("S2-7 · alta de miembro: el puesto nuevo no se crea si los datos están mal", () => {
  const alta = (email: string) => ({
    nombres: ["Luis"],
    area_id: null,
    puesto_id: null,
    puesto_nuevo: { nombre: "Closer senior", rol_base: "closer" as const },
    comision: null,
    acceso: { modo: "crear" as const, email, password: "12345678", rol: "closer" as const, mercado: "es" as const, telefono: "+34 600 000 000" },
    lider: false,
  });
  it("email mal escrito: error y ningún puesto creado", async () => {
    expect(await crearMiembro(alta("luis@mal"))).toMatchObject({ error: "Pon un email válido." });
    expect(de("puestos", "insert")).toHaveLength(0);
  });
  it("teléfono mal: tampoco se crea el puesto", async () => {
    const a = alta("luis@bien.com");
    expect(await crearMiembro({ ...a, acceso: { ...a.acceso, telefono: "12" } })).toMatchObject({ error: expect.stringMatching(/teléfono/) });
    expect(de("puestos", "insert")).toHaveLength(0);
  });
});

describe("S2-18 · «Mi perfil» cambia el nombre también en el organigrama", () => {
  it("actualiza perfiles y miembros_equipo", async () => {
    expect(await guardarMiPerfil({ nombre: "Facu Cepeda", telefono: "", whatsapp: "" })).toBeUndefined();
    const m = de("miembros_equipo", "update");
    expect(m).toHaveLength(1);
    expect(arg(m[0], "update")?.[0]).toEqual({ nombre: "Facu Cepeda" });
    expect(arg(m[0], "eq")).toEqual(["perfil_id", "ceo"]);
  });
  it("si falla el organigrama, error", async () => {
    contestar = (c) => (c.tabla === "miembros_equipo" ? fallo : undefined);
    expect(await guardarMiPerfil({ nombre: "Facu", telefono: "", whatsapp: "" })).toMatchObject({ error: expect.any(String) });
  });
});

describe("X4 · Administración: si la base falla, error (no «no hay nadie»)", () => {
  const pagina = async (tab: string) => (await import("@/app/(panel)/admin/page")).default({ searchParams: Promise.resolve({ tab }) } as never);
  it("Equipo: la lista de personas", async () => {
    contestar = (c) => (c.tabla === "miembros_proyecto" ? fallo : undefined);
    await expect(pagina("equipo")).rejects.toThrow(/la base no responde/);
  });
  it("Entradas: la lista de entradas", async () => {
    contestar = (c) => (c.tabla === "entradas" ? fallo : undefined);
    await expect(pagina("entradas")).rejects.toThrow(/la base no responde/);
  });
  it("Workflows: la lista de workflows", async () => {
    contestar = (c) => (c.tabla === "workflows" ? fallo : undefined);
    await expect(pagina("workflows")).rejects.toThrow(/la base no responde/);
  });
});
