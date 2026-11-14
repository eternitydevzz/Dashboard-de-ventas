// Fase 3 (Cristian, 13 nov): una sola agenda por lead («manda la última») y crédito del caller según el canal.
// Base en memoria con datos inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const base = vi.hoisted(() => ({ tablas: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const filtros: ((f: Fila) => boolean)[] = [];
      let cambio: Fila | null = null;
      let nueva: Fila | null = null;
      let uno = false;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit"]) q[m] = () => q;
      q.eq = (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q);
      q.in = (c: string, v: unknown[]) => (filtros.push((f) => v.includes(f[c])), q);
      q.update = (c: Fila) => ((cambio = c), q);
      q.insert = (c: Fila) => ((nueva = c), q);
      q.maybeSingle = q.single = () => ((uno = true), q);
      const responder = () => {
        const filas = (base.tablas[tabla] ??= []);
        if (nueva) return filas.push({ ...nueva }), { data: nueva, error: null };
        // copias, como la base real: lo leído no cambia si luego se actualiza la fila
        const elegidas = filas.filter((f) => filtros.every((x) => x(f)));
        if (cambio) for (const f of elegidas) Object.assign(f, cambio);
        const copias = elegidas.map((f) => ({ ...f }));
        return { data: uno ? copias[0] ?? null : copias, error: null };
      };
      q.then = (r: (v: unknown) => unknown) => Promise.resolve(responder()).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/cifrado", () => ({ descifrar: () => "token" }));
vi.mock("@/lib/ghl", async (original) => ({ ...(await original<typeof import("@/lib/ghl")>()), borrarCitaGhl: vi.fn(async () => true) }));
vi.mock("@/lib/aviso-closer", () => ({ avisarCloserAgenda: vi.fn(async () => undefined) }));
const { borrarCitaGhl } = await import("@/lib/ghl");
const { avisarCloserAgenda } = await import("@/lib/aviso-closer");
const { juntarConCitaAbierta, datosAgendaGhl } = await import("@/lib/leads");

const ahora = new Date("2026-11-20T10:00:00Z");
const manana = "2026-11-21T16:00:00.000Z";
const pasado = "2026-11-22T18:00:00.000Z";

beforeEach(() => {
  vi.mocked(borrarCitaGhl).mockClear();
  vi.mocked(avisarCloserAgenda).mockClear();
  base.tablas = {
    proyectos: [{ id: "p1", zona_horaria: "Europe/Madrid", ghl_token: "x" }],
    leads: [{ id: "l1", caller_id: "caller-ana", estrellas_caller: 4 }],
    // El caller agendó a mano (la app la creó también en GHL como «g-vieja»)
    citas: [{ id: "c1", proyecto_id: "p1", lead_id: "l1", estado: "pendiente", fecha: manana, closer_id: "closer-luis", agendada_por: "caller-ana", ghl_cita_id: "g-vieja", origen: "manual", creado_en: "2026-11-19T09:00:00Z" }],
    actividades: [],
  };
});

describe("una sola agenda por lead", () => {
  it("cita del caller + reserva por el link = 1 cita con la hora y el closer de la última", async () => {
    const r = await juntarConCitaAbierta("p1", "l1", { fecha: pasado, closerId: "closer-marta", ghlCitaId: "g-link", origen: "ghl", agendadaPor: null, extra: { canal: "directo" } }, { ahora });
    expect(r?.error).toBeNull();
    expect(base.tablas.citas).toHaveLength(1);
    expect(base.tablas.citas[0]).toMatchObject({ id: "c1", fecha: pasado, closer_id: "closer-marta", ghl_cita_id: "g-link", origen: "ghl", canal: "directo", creado_en: "2026-11-19T09:00:00Z" });
    // Sin crédito en la nueva: se queda el del caller que agendó a mano
    expect(base.tablas.citas[0].agendada_por).toBe("caller-ana");
    // En GHL queda un solo evento: el viejo se borra
    expect(borrarCitaGhl).toHaveBeenCalledWith(expect.objectContaining({ citaId: "g-vieja" }));
    expect(base.tablas.actividades.some((a) => String(a.nota).startsWith("Agenda juntada"))).toBe(true);
    expect(avisarCloserAgenda).toHaveBeenCalledTimes(1);
    expect(avisarCloserAgenda).toHaveBeenCalledWith({ proyectoId: "p1", closerId: "closer-marta", citaId: "c1", motivo: "cambio" });
  });

  it("la nueva con crédito se lo queda", async () => {
    await juntarConCitaAbierta("p1", "l1", { fecha: pasado, closerId: null, ghlCitaId: null, origen: "manual", agendadaPor: "director-eva" }, { ahora });
    expect(base.tablas.citas[0]).toMatchObject({ agendada_por: "director-eva", closer_id: "closer-luis", ghl_cita_id: null });
    expect(borrarCitaGhl).toHaveBeenCalledTimes(1);
  });

  it("sin cita abierta no hace nada (se crea como siempre)", async () => {
    base.tablas.citas[0].estado = "cerrada";
    expect(await juntarConCitaAbierta("p1", "l1", { fecha: pasado, closerId: "closer-marta", ghlCitaId: "g-link", origen: "ghl", agendadaPor: null }, { ahora })).toBeNull();
    expect(base.tablas.citas[0]).toMatchObject({ fecha: manana, ghl_cita_id: "g-vieja" }); // la cerrada no se toca
    expect(borrarCitaGhl).not.toHaveBeenCalled();
    expect(avisarCloserAgenda).not.toHaveBeenCalled();
  });

  it("misma cita de GHL, misma hora y closer: no borra en GHL ni avisa", async () => {
    await juntarConCitaAbierta("p1", "l1", { fecha: manana, closerId: "closer-luis", ghlCitaId: "g-vieja", origen: "ghl", agendadaPor: null }, { ahora });
    expect(borrarCitaGhl).not.toHaveBeenCalled();
    expect(avisarCloserAgenda).not.toHaveBeenCalled();
  });

  it("noRepetir (agendar a mano): la misma cita otra vez da el error de duplicada y no toca GHL", async () => {
    const r = await juntarConCitaAbierta("p1", "l1", { fecha: manana, closerId: "closer-luis", ghlCitaId: null, origen: "manual", agendadaPor: "director-eva" }, { ahora, noRepetir: true });
    expect(r?.error?.code).toBe("23505");
    expect(base.tablas.citas[0]).toMatchObject({ ghl_cita_id: "g-vieja", agendada_por: "caller-ana" });
    expect(borrarCitaGhl).not.toHaveBeenCalled();
  });

  it("sinAviso (importar CSV): junta pero no avisa", async () => {
    await juntarConCitaAbierta("p1", "l1", { fecha: pasado, closerId: "closer-marta", ghlCitaId: null, origen: "manual", agendadaPor: "director-eva" }, { ahora, sinAviso: true });
    expect(base.tablas.citas[0].fecha).toBe(pasado);
    expect(avisarCloserAgenda).not.toHaveBeenCalled();
  });
});

describe("crédito del caller según el canal", () => {
  it("solo con canal «callers» la agenda de GHL es del caller del lead", async () => {
    expect(await datosAgendaGhl("l1", "callers")).toEqual({ agendada_por: "caller-ana", estrellas_caller: 4 });
    expect((await datosAgendaGhl("l1", "directo")).agendada_por).toBeNull();
    expect((await datosAgendaGhl("l1", "biblioteca")).agendada_por).toBeNull();
    expect((await datosAgendaGhl("l1", null)).agendada_por).toBeNull();
  });
});
