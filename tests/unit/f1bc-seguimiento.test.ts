// Fase 1b · zona c: anotarSeguimiento devuelve el id creado y borrarSeguimiento solo borra uno propio, del mismo
// proyecto y de los últimos 15 minutos (filtros en el servidor). Base simulada; datos inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string } | null };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let respuesta: Record<string, Resp>;
let consultas: Consulta[];
const db = () => ({
  from: (tabla: string) => {
    const c: Consulta = { tabla, ops: [] };
    consultas.push(c);
    const tipo = () => ["upsert", "insert", "delete", "update"].find((o) => c.ops.some(([x]) => x === o)) ?? "select";
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "like", "order", "limit", "insert", "upsert", "delete", "maybeSingle", "single"]) q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
    q.then = (r: (v: Resp) => unknown) => Promise.resolve(respuesta[`${tabla}:${tipo()}`] ?? { data: null, error: null }).then(r);
    return q;
  },
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => {} }));
vi.mock("@/lib/datos", () => ({
  db,
  registrarActividad: vi.fn(async () => {}),
  todas: vi.fn(),
  escribir: async (p: PromiseLike<Resp>, t: string) => {
    const r = await p;
    if (r.error) throw new Error(`No se pudo guardar en «${t}»`);
    return r;
  },
}));
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => ({ perfil: { id: "u1", rol: "closer" }, proyecto: { id: "p1" } }), soloLoSuyo: () => false }));
vi.mock("@/app/(panel)/clientes/cargar", () => ({ clientesSuyos: async () => new Set() }));
vi.mock("@/app/(panel)/leads/acciones", () => ({ registrarVenta: vi.fn() }));

const { anotarSeguimiento, borrarSeguimiento } = await import("@/app/(panel)/clientes/acciones");
const op = (c: Consulta, o: string) => c.ops.filter(([x]) => x === o).map(([, a]) => a);

beforeEach(() => {
  consultas = [];
  respuesta = { "ventas:select": { data: { id: "v1" }, error: null }, "seguimientos_cliente:insert": { data: { id: "s1" }, error: null }, "actividades:select": { data: { id: "a1" }, error: null } };
});

describe("anotarSeguimiento", () => {
  it("devuelve el id del seguimiento y el de su línea del historial (buscada desde el inicio de la acción)", async () => {
    const antes = new Date(Date.now() - 1000).toISOString(); // la acción busca con 1 s de margen de reloj
    expect(await anotarSeguimiento("l1", "Hablamos", "2026-11-25")).toEqual({ seguimientoId: "s1", actividadId: "a1" });
    const c = consultas.find((x) => x.tabla === "actividades")!;
    expect(op(c, "eq")).toEqual(expect.arrayContaining([["proyecto_id", "p1"], ["lead_id", "l1"], ["perfil_id", "u1"], ["tipo", "nota"], ["nota", "Seguimiento de cliente: Hablamos"]]));
    expect((op(c, "gte")[0] as string[])[1] >= antes).toBe(true);
  });
  it("sin nota no crea seguimiento y devuelve null", async () => {
    expect(await anotarSeguimiento("l1", "  ", "")).toEqual({ seguimientoId: null, actividadId: null });
    expect(consultas.some((c) => c.tabla === "seguimientos_cliente")).toBe(false);
  });
});

describe("borrarSeguimiento", () => {
  it("filtra por id, proyecto, autor y los últimos 15 minutos", async () => {
    respuesta["seguimientos_cliente:delete"] = { data: [{ id: "s1" }], error: null };
    const antes = Date.now();
    expect(await borrarSeguimiento("s1")).toBeUndefined();
    const c = consultas.find((x) => x.tabla === "seguimientos_cliente")!;
    expect(op(c, "eq")).toEqual(expect.arrayContaining([["id", "s1"], ["proyecto_id", "p1"], ["perfil_id", "u1"]]));
    const [[campo, desde]] = op(c, "gte") as [string, string][];
    expect(campo).toBe("creado_en");
    expect(Math.abs(antes - 15 * 60_000 - Date.parse(desde))).toBeLessThan(5_000);
    expect(consultas.some((x) => x.tabla === "actividades")).toBe(false); // sin id de actividad no se toca el historial
  });
  it("con el id de la actividad, borra solo esa línea: suya, del proyecto, del lead, de tipo nota de seguimiento y reciente", async () => {
    respuesta["seguimientos_cliente:delete"] = { data: [{ id: "s1", lead_id: "l1" }], error: null };
    expect(await borrarSeguimiento("s1", "a1")).toBeUndefined();
    const c = consultas.find((x) => x.tabla === "actividades")!;
    expect(op(c, "delete")).toHaveLength(1);
    expect(op(c, "eq")).toEqual(expect.arrayContaining([["id", "a1"], ["proyecto_id", "p1"], ["perfil_id", "u1"], ["lead_id", "l1"], ["tipo", "nota"]]));
    expect(op(c, "like")).toEqual([["nota", "Seguimiento de cliente:%"]]);
    expect((op(c, "gte")[0] as string[])[0]).toBe("creado_en");
  });
  it("si no borra nada (ajeno, otro proyecto o viejo), da un error claro", async () => {
    respuesta["seguimientos_cliente:delete"] = { data: [], error: null };
    expect(await borrarSeguimiento("s9")).toMatchObject({ error: expect.stringContaining("15 minutos") });
  });
});
