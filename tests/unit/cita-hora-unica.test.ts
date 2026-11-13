// Ola 1 · C2: con el índice citas_closer_hora_unica, si al reagendar otro coge ese hueco a la vez, la cita de antes
// vuelve a como estaba (no se pierde) y sale «Ese hueco acaba de ocuparse, elige otro».
import { beforeEach, describe, expect, it, vi } from "vitest";

let escritos: { op: string; valor: unknown }[];
let errorInsert: { code: string; message: string } | null;
const CITA = { id: "c1", proyecto_id: "p", lead_id: "l1", closer_id: "luis", agendada_por: "dani", estado: "confirmada", nota: null, fecha: "2026-11-14T15:00:00Z", origen: "manual" };
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => undefined }));
vi.mock("@/lib/agenda-libre", () => ({ closerLibreA: async () => ({ libre: true }) }));
vi.mock("@/lib/auth", () => ({
  getSesion: async () => ({ perfil: { id: "jefe", rol: "ceo" }, proyecto: { id: "p", zona_horaria: "America/New_York" } }),
  esJefe: () => true,
  exigir: async () => undefined,
}));
vi.mock("@/lib/datos", () => {
  const tabla = () => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) c[m] = () => c;
    c.maybeSingle = async () => ({ data: CITA, error: null });
    c.update = (v: unknown) => ({ eq: async () => (escritos.push({ op: "update", valor: v }), { error: null }) });
    c.insert = async (v: unknown) => (escritos.push({ op: "insert", valor: v }), { error: errorInsert });
    return c;
  };
  return { db: () => ({ from: tabla }), escribir: async (p: unknown) => p, registrarActividad: async () => undefined, todas: async () => [] };
});
const { reagendarCita } = await import("@/app/(panel)/closer/acciones");

describe("reagendar con el hueco ocupado a la vez", () => {
  beforeEach(() => {
    escritos = [];
    errorInsert = null;
  });

  it("choca con el índice: la cita vuelve a su estado y el aviso es claro", async () => {
    errorInsert = { code: "23505", message: 'duplicate key value violates unique constraint "citas_closer_hora_unica"' };
    const r = await reagendarCita("c1", "2026-11-15T10:00");
    expect(r).toEqual({ error: "Ese hueco acaba de ocuparse, elige otro." });
    expect(escritos.map((e) => e.op)).toEqual(["update", "insert", "update"]);
    expect(escritos[2].valor).toEqual({ estado: "confirmada" }); // deshecho
  });

  it("sin choque, como siempre: la vieja reagendada y una nueva", async () => {
    const r = await reagendarCita("c1", "2026-11-15T10:00");
    expect(r).toBeUndefined(); // sin error
    expect(escritos.map((e) => e.op)).toEqual(["update", "insert"]);
    expect(escritos[0].valor).toEqual({ estado: "reagendada" });
  });
});
