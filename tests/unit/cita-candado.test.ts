// Ola 6 · C6: una cita cerrada (tiene su venta) no vuelve a otro estado a mano ni con la IA; y al reagendar, si la
// vuelta atrás de la cita vieja falla, se avisa (antes se ignoraba y la cita se quedaba «reagendada» sin nueva).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Paso = [string, unknown[]];
let updates: Paso[][];
let filasCambiadas: { id: string }[];
let errorInsert: { code: string; message: string } | null;
let errorVuelta: { message: string } | null;
const CITA = { id: "c1", proyecto_id: "p", lead_id: "l1", closer_id: "luis", agendada_por: "dani", estado: "confirmada", nota: null, fecha: "2026-11-14T15:00:00Z" };
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => undefined }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => undefined }));
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
    c.update = (v: unknown) => {
      const pasos: Paso[] = [["update", [v]]];
      updates.push(pasos);
      const u: Record<string, unknown> = {};
      for (const m of ["eq", "neq", "not"]) u[m] = (...a: unknown[]) => (pasos.push([m, a]), u);
      u.select = async () => ({ data: filasCambiadas, error: null });
      // La vuelta atrás del reagendado (sin select): la 2.ª escritura de la cita
      u.then = (r: (x: unknown) => unknown) => Promise.resolve({ error: updates.length > 1 ? errorVuelta : null }).then(r);
      return u;
    };
    c.insert = async () => ({ error: errorInsert });
    return c;
  };
  // Como el de verdad: si la escritura falla, corta
  const escribir = async (p: PromiseLike<{ error: { message: string } | null }>, t: string) => {
    const r = await p;
    if (r.error) throw new Error(`No se pudo guardar en «${t}»: ${r.error.message}`);
    return r;
  };
  return { db: () => ({ from: tabla }), escribir, registrarActividad: async () => undefined, todas: async () => [] };
});
const { cambiarEstadoCita, reagendarCita } = await import("@/app/(panel)/closer/acciones");

beforeEach(() => {
  updates = [];
  filasCambiadas = [{ id: "c1" }];
  errorInsert = null;
  errorVuelta = null;
});

describe("cambiar el estado de una cita", () => {
  it("el cambio solo toca la cita si no está cerrada", async () => {
    expect(await cambiarEstadoCita("c1", "no_show", "")).toBeUndefined();
    expect(updates[0]).toContainEqual(["neq", ["estado", "cerrada"]]);
  });

  it("si ya estaba cerrada (0 filas), avisa y no apunta nada más", async () => {
    filasCambiadas = [];
    expect(await cambiarEstadoCita("c1", "pendiente", "")).toEqual({ error: "Esta cita acaba de cambiar. Recarga la página y vuelve a intentarlo." });
    expect(updates).toHaveLength(1);
  });
});

describe("reagendar: vuelta atrás", () => {
  it("si la nueva no entra y la vuelta atrás también falla, error (no «hueco ocupado»)", async () => {
    errorInsert = { code: "23505", message: 'duplicate key value violates unique constraint "citas_closer_hora_unica"' };
    errorVuelta = { message: "la base no responde" };
    const r = await reagendarCita("c1", "2026-11-15T10:00");
    expect(r).toMatchObject({ error: expect.any(String) });
    expect(r).not.toEqual({ error: "Ese hueco acaba de ocuparse, elige otro." });
  });

  it("si la vuelta atrás va bien, el aviso de siempre", async () => {
    errorInsert = { code: "23505", message: 'duplicate key value violates unique constraint "citas_closer_hora_unica"' };
    expect(await reagendarCita("c1", "2026-11-15T10:00")).toEqual({ error: "Ese hueco acaba de ocuparse, elige otro." });
  });
});
