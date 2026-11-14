// Fase 3 (Cristian, 13 nov): en la lectura de GHL, la reserva por el link se junta con la cita que el caller ya
// agendó a mano (manda la última) y el crédito del caller depende del canal. Base en memoria, datos inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const base = vi.hoisted(() => ({ tablas: {} as Record<string, Record<string, unknown>[]>, n: 0 }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const filtros: ((f: Fila) => boolean)[] = [];
      let cambio: Fila | null = null;
      let nueva: Fila | null = null;
      let uno = false;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit", "not", "gte", "lt", "upsert"]) q[m] = () => q;
      q.eq = (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q);
      q.in = (c: string, v: unknown[]) => (filtros.push((f) => v.includes(f[c])), q);
      q.update = (c: Fila) => ((cambio = c), q);
      q.insert = (c: Fila) => ((nueva = c), q);
      q.maybeSingle = q.single = () => ((uno = true), q);
      const responder = () => {
        const filas = (base.tablas[tabla] ??= []);
        if (nueva) {
          const f = { id: `${tabla}-${++base.n}`, creado_en: new Date().toISOString(), canal: null, ...nueva };
          filas.push(f);
          return { data: { ...f }, error: null };
        }
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
vi.mock("@/lib/rotacion", () => ({ closerDeLaRotacion: async () => null }));
const ghl = vi.hoisted(() => ({ eventos: [] as Record<string, unknown>[], utm: "callers" }));
vi.mock("@/lib/ghl", async (original) => ({
  ...(await original<typeof import("@/lib/ghl")>()),
  eventosGhl: async () => ghl.eventos,
  nombreCalendarioGhl: async () => "General",
  contactoGhl: async () => ({ email: "lucia@ejemplo.test", lastAttributionSource: { utmSource: ghl.utm, url: `https://web.ejemplo.test/agenda?utm_source=${ghl.utm}` } }),
  estadoCitaGhl: async () => "sigue",
  borrarCitaGhl: vi.fn(async () => true),
}));
vi.mock("@/lib/workflows-motor", () => ({ dispararWorkflows: vi.fn(async () => 1), dispararEtiquetas: vi.fn(async () => 1) }));
vi.mock("@/lib/aviso-closer", () => ({ avisarCloserAgenda: vi.fn(async () => undefined) }));
const { borrarCitaGhl } = await import("@/lib/ghl");
const { avisarCloserAgenda } = await import("@/lib/aviso-closer");
const { sincronizarCalendarios } = await import("@/lib/ghl-sync");

const ahora = new Date("2026-11-20T10:00:00Z");
const horaCaller = "2026-11-21T16:00:00.000Z";
const horaLink = "2026-11-22T18:00:00.000Z";
const citaCaller = { id: "c1", proyecto_id: "p1", lead_id: "l1", estado: "pendiente", fecha: horaCaller, closer_id: null, agendada_por: "caller-ana", ghl_cita_id: "g-vieja", origen: "manual", canal: null, ghl_calendario: "General", creado_en: "2026-11-19T09:00:00Z" };
const evento = (id: string, fecha: string) => ({ id, startTime: fecha, calendarId: "cal1", contactId: "ct1" });

beforeEach(() => {
  vi.mocked(borrarCitaGhl).mockClear();
  vi.mocked(avisarCloserAgenda).mockClear();
  ghl.utm = "callers";
  base.tablas = {
    proyectos: [{ id: "p1", zona_horaria: "Europe/Madrid", ghl_token: "x", ghl_location_id: "loc", ghl_calendarios: ["cal1"] }],
    leads: [{ id: "l1", proyecto_id: "p1", ghl_contact_id: "ct1", caller_id: "caller-ana", estrellas_caller: 4, estado_caller: "agendado", etiquetas: [], pais: "ES" }],
    citas: [],
    actividades: [],
  };
});

describe("lectura de GHL: una sola agenda por lead", () => {
  it.each([
    ["la vieja llega antes", ["g-vieja", "g-link"]],
    ["la vieja llega después", ["g-link", "g-vieja"]],
  ])("cita del caller + reserva por el link = 1 cita con la hora de la última (%s)", async (_, orden) => {
    base.tablas.citas = [{ ...citaCaller }];
    ghl.eventos = orden.map((id) => evento(id, id === "g-link" ? horaLink : horaCaller));
    await sincronizarCalendarios("p1", { ahora });
    expect(base.tablas.citas).toHaveLength(1);
    expect(base.tablas.citas[0]).toMatchObject({ id: "c1", fecha: horaLink, ghl_cita_id: "g-link", origen: "ghl", canal: "callers", agendada_por: "caller-ana", creado_en: citaCaller.creado_en });
    expect(borrarCitaGhl).toHaveBeenCalledTimes(1);
    expect(borrarCitaGhl).toHaveBeenCalledWith(expect.objectContaining({ citaId: "g-vieja" }));
    expect(avisarCloserAgenda).not.toHaveBeenCalled(); // sin closer no hay a quién avisar
  });

  it("avisa 1 vez al closer de la cita juntada", async () => {
    base.tablas.citas = [{ ...citaCaller, closer_id: "closer-luis" }];
    ghl.eventos = [evento("g-link", horaLink)];
    await sincronizarCalendarios("p1", { ahora });
    expect(avisarCloserAgenda).toHaveBeenCalledTimes(1);
    expect(avisarCloserAgenda).toHaveBeenCalledWith(expect.objectContaining({ citaId: "c1", closerId: "closer-luis", motivo: "cambio" }));
    // Una segunda lectura con lo mismo no vuelve a avisar ni a crear nada
    await sincronizarCalendarios("p1", { ahora });
    expect(avisarCloserAgenda).toHaveBeenCalledTimes(1);
    expect(base.tablas.citas).toHaveLength(1);
  });
});

describe("lectura de GHL: crédito del caller", () => {
  it("reserva nueva por el link de callers: cuenta para el caller del lead", async () => {
    ghl.eventos = [evento("g-link", horaLink)];
    await sincronizarCalendarios("p1", { ahora });
    expect(base.tablas.citas).toHaveLength(1);
    expect(base.tablas.citas[0]).toMatchObject({ canal: "callers", agendada_por: "caller-ana" });
  });

  it("reserva por otro canal (directo): no cuenta para nadie", async () => {
    ghl.utm = "";
    ghl.eventos = [evento("g-link", horaLink)];
    await sincronizarCalendarios("p1", { ahora });
    expect(base.tablas.citas[0].agendada_por).toBeNull();
  });

  it("el canal «callers» que llega en los primeros 15 min pone también el crédito", async () => {
    base.tablas.citas = [{ ...citaCaller, ghl_cita_id: "g-link", origen: "ghl", agendada_por: null, creado_en: new Date(ahora.getTime() - 5 * 60_000).toISOString() }];
    ghl.eventos = [evento("g-link", horaCaller)];
    await sincronizarCalendarios("p1", { ahora });
    expect(base.tablas.citas[0]).toMatchObject({ canal: "callers", agendada_por: "caller-ana" });
  });
});
