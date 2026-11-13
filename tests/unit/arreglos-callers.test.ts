// Plan Callers (docs/plan-callers.md, apartado 5), fase de arreglos (Cristian, 7 nov 2026): F3, F4, F13 y F22.
// La base se simula: cada consulta apunta lo que pidió y devuelve lo que diga `respuesta` (tabla:select|update|insert).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string } | null; count?: number | null };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let respuesta: Record<string, Resp>;
let consultas: Consulta[];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const tipo = () => (c.ops.some(([o]) => o === "update") ? "update" : c.ops.some(([o]) => o === "insert") ? "insert" : "select");
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "gte", "lte", "order", "range", "limit", "update", "insert", "maybeSingle", "single", "neq", "or"])
        q[m] = (...args: unknown[]) => {
          c.ops.push([m, args]);
          return q;
        };
      q.then = (r: (v: Resp) => unknown, f?: (e: unknown) => unknown) => Promise.resolve(respuesta[`${tabla}:${tipo()}`] ?? { data: null, error: null }).then(r, f);
      return q;
    },
  }),
}));
const exigirSeccion = vi.fn(async (...s: string[]) => void s);
vi.mock("@/lib/permisos", () => ({ exigirSeccion: (...s: string[]) => exigirSeccion(...s) }));
vi.mock("@/lib/guiones-datos", () => ({
  rolDelGuion: () => "caller",
  cargarGuion: async () => ({ guion: { pasos: [{ id: "p1", titulo: "Saludo", texto: "", checklist: ["a"], pistas: [] }], objeciones: [] } }),
}));

const { getSesion } = await import("@/lib/sesion");
const { registrarLlamada } = await import("@/app/(panel)/leads/acciones");
const { guardarMarcasGuion } = await import("@/app/(panel)/guiones/acciones");
const { kpisHoyCola } = await import("@/lib/kpis-cola");
const { nombresCortos } = await import("@/lib/formato");

const perfil = { id: "u1", rol: "caller", nombre: "Cris" };
const proyecto = { id: "p1", zona_horaria: "Europe/Madrid" };
const lead = { id: "l1", proyecto_id: "p1", caller_id: "u1", closer_id: null, estado_caller: "nuevo", pipeline_id: "pip1", etapa_id: "e0" };
const fallo = { data: null, error: { message: "la base no responde" } };
const inserts = (tabla: string) => consultas.filter((c) => c.tabla === tabla && c.ops.some(([o]) => o === "insert"));

beforeEach(() => {
  consultas = [];
  exigirSeccion.mockReset();
  exigirSeccion.mockResolvedValue(undefined);
  vi.mocked(getSesion).mockResolvedValue({ perfil, proyecto } as never);
  respuesta = { "leads:select": { data: lead, error: null }, "etapas:select": { data: [{ id: "e1", nombre: "Descartados" }], error: null } };
});

describe("F3 · si falla guardar el estado, no dice «Guardado»", () => {
  it("falla el cambio de estado del lead: devuelve error y no apunta la llamada", async () => {
    respuesta["leads:update"] = fallo;
    const r = await registrarLlamada("l1", "no_responde", "");
    expect(r).toMatchObject({ error: expect.any(String) });
    expect(inserts("actividades")).toHaveLength(0);
  });
  it("todo bien: no hay error y la llamada queda apuntada", async () => {
    respuesta["leads:update"] = { data: null, error: null };
    const r = await registrarLlamada("l1", "no_responde", "");
    expect(r).toBeUndefined();
    expect(inserts("actividades")).toHaveLength(1);
  });
  it("falla mover la columna del pipeline de origen: también devuelve error", async () => {
    let n = 0;
    // la 1.ª escritura (estado) va bien; la 2.ª (columna «Descartados») falla
    Object.defineProperty(respuesta, "leads:update", { get: () => (n++ === 0 ? { data: null, error: null } : fallo) });
    const r = await registrarLlamada("l1", "no_interesa", "", 3);
    expect(r).toMatchObject({ error: expect.any(String) });
  });
});

describe("F22 · guardar las marcas del guion pide permiso de sección", () => {
  it("sin la sección, no guarda", async () => {
    exigirSeccion.mockRejectedValue(Object.assign(new (await import("@/lib/resultado")).ErrorUsuario("No tienes acceso a esta sección.")));
    const r = await guardarMarcasGuion("l1", { p1: [0] }, "no_contesta");
    expect(r).toMatchObject({ error: "No tienes acceso a esta sección." });
    expect(inserts("guion_marcas")).toHaveLength(0);
  });
  it("pide las mismas secciones que el resto de acciones del lead", async () => {
    await guardarMarcasGuion("l1", { p1: [0] }, "no_contesta");
    expect(exigirSeccion).toHaveBeenCalledWith("cola", "crm", "agendas", "clientes");
  });
});

describe("F4 · KPIs de hoy de la cola: solo de este proyecto", () => {
  it("las consultas filtran por proyecto y persona (C11: sin ventas, F6)", async () => {
    respuesta["actividades:select"] = { data: [{ tipo: "llamada", resultado: "llamado", lead_id: "l1" }], error: null };
    respuesta["citas:select"] = { data: null, error: null, count: 2 };
    const k = await kpisHoyCola("p1", "u1", "2026-11-07T00:00:00.000Z");
    expect(k).toEqual({ acts: [{ tipo: "llamada", resultado: "llamado", lead_id: "l1" }], citas: 2 });
    for (const t of ["actividades", "citas"]) {
      const c = consultas.find((x) => x.tabla === t)!;
      expect(c.ops).toContainEqual(["eq", ["proyecto_id", "p1"]]);
    }
    expect(consultas.some((c) => c.tabla === "ventas")).toBe(false);
  });
  it("las actividades se leen paginadas con orden fijo (D43: más de 1.000 en un día)", async () => {
    respuesta["actividades:select"] = { data: [], error: null };
    respuesta["citas:select"] = { data: null, error: null, count: 0 };
    await kpisHoyCola("p1", "u1", "2026-11-07T00:00:00.000Z");
    const c = consultas.find((x) => x.tabla === "actividades")!;
    expect(c.ops).toContainEqual(["order", ["id"]]);
    expect(c.ops).toContainEqual(["range", [0, 999]]);
  });
  it("si falla una consulta, error en vez de enseñar 0 (13 nov)", async () => {
    respuesta["actividades:select"] = { data: [], error: null };
    respuesta["citas:select"] = fallo;
    await expect(kpisHoyCola("p1", "u1", "2026-11-07T00:00:00.000Z")).rejects.toThrow("la base no responde");
    respuesta["actividades:select"] = fallo;
    respuesta["citas:select"] = { data: null, error: null, count: 0 };
    await expect(kpisHoyCola("p1", "u1", "2026-11-07T00:00:00.000Z")).rejects.toThrow("la base no responde");
  });
});

describe("F13 · selector de callers del jefe: se distinguen dos con el mismo nombre", () => {
  it("nombre de pila si es único; si se repite, con la inicial del apellido", () => {
    const m = nombresCortos([
      { id: "a", nombre: "Ana López" },
      { id: "b", nombre: "Ana Martín" },
      { id: "c", nombre: "Hanna" },
      { id: "d", nombre: "Ana" },
    ]);
    expect(m.get("a")).toBe("Ana L.");
    expect(m.get("b")).toBe("Ana M.");
    expect(m.get("c")).toBe("Hanna");
    expect(m.get("d")).toBe("Ana");
  });
});
