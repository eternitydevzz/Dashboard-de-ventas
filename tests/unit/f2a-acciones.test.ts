// Fase 2 · zona a (Dinero): borrar una venta va en una función de la base (borrar_venta, todo o nada); mover una
// venta en Agendas comprueba antes que su cita se puede mover (si no, no se borra nada); y una cita cerrada no cambia
// de closer. Base simulada: guarda las consultas y las llamadas a funciones; contesta `responder`. Datos inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string } | null; count?: number };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let consultas: Consulta[];
let llamadas: { fn: string; args: Record<string, unknown> }[];
let responder: (c: Consulta) => Resp | undefined;
let rpc: Record<string, Resp>;
const tipo = (c: Consulta) => ["delete", "upsert", "update", "insert"].find((o) => c.ops.some(([x]) => x === o)) ?? "select";
const tiene = (c: Consulta, op: string, ...a: unknown[]) => c.ops.some(([o, x]) => o === op && a.every((v, i) => x[i] === v));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      llamadas.push({ fn, args });
      return Promise.resolve(rpc[fn] ?? { data: null, error: null });
    },
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "neq", "gt", "order", "limit", "update", "insert", "delete", "maybeSingle", "single"])
        q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: Resp) => unknown, f?: (e: unknown) => unknown) => Promise.resolve(responder(c) ?? { data: tipo(c) === "update" ? [{ id: "x" }] : null, error: null }).then(r, f);
      return q;
    },
  }),
}));
vi.mock("@/lib/permisos", async () => ({ exigirSeccion: async () => (await import("@/lib/sesion")).getSesion() }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => undefined }));
vi.mock("@/lib/datos", async (original) => ({ ...(await original<typeof import("@/lib/datos")>()), registrarActividad: async () => undefined }));
vi.mock("@/lib/refrescar", () => ({ refrescarPantalla: () => undefined }));
vi.mock("@/lib/ghl", () => ({ borrarCitaGhl: vi.fn(), cambiarUsuarioCitaGhl: vi.fn() }));
vi.mock("@/lib/agenda-libre", () => ({ closerLibreA: vi.fn(async () => ({ libre: true })) }));

const { getSesion } = await import("@/lib/sesion");
const { closerLibreA } = await import("@/lib/agenda-libre");
const { borrarVenta } = await import("@/app/(panel)/ventas/acciones");
const { cambiarCloserCita, moverVenta } = await import("@/app/(panel)/closer/acciones");

const VENTA = { id: "v1", lead_id: "l1", vendedor_id: "ceo", fecha: "2026-11-10T10:00:00Z" };
const CITA = { id: "c1", lead_id: "l1", closer_id: "k1", estado: "seguimiento", nota: null, fecha: "2026-11-10T10:00:00Z", origen: "manual" };
const de = (tabla: string, t: string) => consultas.filter((c) => c.tabla === tabla && tipo(c) === t);
let ventasDelLead: number;

beforeEach(() => {
  consultas = [];
  llamadas = [];
  rpc = { borrar_venta: { data: "c1", error: null } };
  ventasDelLead = 1;
  vi.mocked(closerLibreA).mockResolvedValue({ libre: true } as never);
  vi.mocked(getSesion).mockResolvedValue({ perfil: { id: "ceo", rol: "ceo" }, proyecto: { id: "p1", nombre: "Eternity", zona_horaria: "Europe/Madrid" } } as never);
  responder = (c) => {
    if (c.tabla === "ventas" && tipo(c) === "select") return tiene(c, "eq", "id", "v1") ? { data: VENTA, error: null } : { data: null, error: null, count: ventasDelLead };
    if (c.tabla === "citas" && tipo(c) === "select") return tiene(c, "eq", "estado", "cerrada") ? { data: { id: "c1" }, error: null } : { data: CITA, error: null };
    if (c.tabla === "liquidaciones") return { data: null, error: null, count: 0 };
    if (c.tabla === "proyectos") return { data: { ghl_token: null }, error: null };
    return undefined;
  };
});

describe("S2-8 · borrarVenta en una función de la base", () => {
  it("llama a borrar_venta y la app ya no borra ni cambia cita y lead por su cuenta", async () => {
    expect(await borrarVenta("v1")).toEqual({ aviso: null, citaId: "c1" });
    expect(llamadas).toEqual([{ fn: "borrar_venta", args: { p_proyecto: "p1", p_venta: "v1" } }]);
    expect(de("ventas", "delete")).toHaveLength(0);
    expect(de("citas", "update")).toHaveLength(0);
    expect(de("leads", "update")).toHaveLength(0);
  });
  it("si otra persona la borró a la vez: «Venta no encontrada.»; si la base falla, mensaje genérico", async () => {
    rpc.borrar_venta = { data: null, error: { message: "borrar_venta: venta no encontrada" } };
    expect(await borrarVenta("v1")).toEqual({ error: "Venta no encontrada." });
    rpc.borrar_venta = { data: null, error: { message: "la base no responde" } };
    expect(await borrarVenta("v1")).toEqual({ error: expect.stringContaining("Algo ha fallado") });
  });
  it("sigue comprobando permisos en la app: un caller no la borra", async () => {
    vi.mocked(getSesion).mockResolvedValue({ perfil: { id: "ceo", rol: "caller" }, proyecto: { id: "p1", zona_horaria: "Europe/Madrid" } } as never);
    expect(await borrarVenta("v1")).toEqual({ error: expect.stringContaining("Solo el director") });
    expect(llamadas).toHaveLength(0);
  });
});

describe("S1-2 · mover una venta en Agendas: primero se comprueba, luego se borra", () => {
  it("reagendar a una hora no libre: no se borra la venta", async () => {
    vi.mocked(closerLibreA).mockResolvedValue({ libre: false, motivo: "ocupado" } as never);
    expect(await moverVenta("v1", { fechaLocal: "2026-11-20T10:00" })).toEqual({ error: expect.stringContaining("No está libre a esa hora") });
    expect(llamadas).toHaveLength(0);
  });
  it("reagendar sin fecha o a un estado no válido: no se borra la venta", async () => {
    expect(await moverVenta("v1", { fechaLocal: "" })).toEqual({ error: "Elige la nueva fecha." });
    expect(await moverVenta("v1", { estado: "cerrada" })).toEqual({ error: "Estado no válido." });
    expect(await moverVenta("v1", { estado: "perdida", estrellas: 9 })).toEqual({ error: "Elige las estrellas (de 1 a 5)." });
    expect(llamadas).toHaveLength(0);
  });
  it("si el lead tiene otra venta (su cita no volvería), no se borra nada", async () => {
    ventasDelLead = 2;
    expect(await moverVenta("v1", { estado: "no_show" })).toEqual({ error: expect.stringContaining("No se ha borrado nada") });
    expect(llamadas).toHaveLength(0);
  });
  it("si se puede: borra la venta y después pone el estado a su cita", async () => {
    expect(await moverVenta("v1", { estado: "no_show" })).toEqual({ aviso: null });
    expect(llamadas.map((l) => l.fn)).toEqual(["borrar_venta"]);
    const cambio = de("citas", "update")[0];
    expect(cambio.ops[0]).toEqual(["update", [expect.objectContaining({ estado: "no_show" })]]);
    expect(tiene(cambio, "eq", "id", "c1")).toBe(true);
  });
  it("reagendar a una hora libre: comprueba la hora antes de borrar y crea la cita nueva", async () => {
    expect(await moverVenta("v1", { fechaLocal: "2026-11-20T10:00" })).toEqual({ aviso: null });
    expect(vi.mocked(closerLibreA).mock.calls[0][1]).toBe("k1");
    expect(llamadas.map((l) => l.fn)).toEqual(["borrar_venta"]);
    expect(de("citas", "insert")).toHaveLength(1);
  });
});

describe("S1-9 · cambiarCloserCita no acepta una cita cerrada", () => {
  it("con venta: error claro y no cambia nada", async () => {
    responder = (c) => (c.tabla === "citas" && tipo(c) === "select" ? { data: { ...CITA, estado: "cerrada", ghl_cita_id: null }, error: null } : c.tabla === "proyectos" ? { data: { ghl_token: null }, error: null } : undefined);
    expect(await cambiarCloserCita("c1", "k2")).toEqual({ error: expect.stringContaining("tiene su venta") });
    expect(de("citas", "update")).toHaveLength(0);
    expect(de("leads", "update")).toHaveLength(0);
  });
});
