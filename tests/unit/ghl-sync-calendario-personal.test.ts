// Calendario por closer (Jose, 25 nov 2026): en la lectura de GHL, la cita que entra en el calendario personal de una
// persona se queda con ella (closer y «agendó») y no pasa por el reparto; la del Calendar Principal, como siempre.
// Base en memoria como en ghl-sync-agenda-unica.test.ts. Datos inventados.
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
// El reparto, si se le pregunta, siempre dice Facu
vi.mock("@/lib/rotacion", () => ({ closerDeLaRotacion: vi.fn(async () => "facu") }));
const ghl = vi.hoisted(() => ({ eventos: [] as Record<string, unknown>[] }));
vi.mock("@/lib/ghl", async (original) => ({
  ...(await original<typeof import("@/lib/ghl")>()),
  eventosGhl: async () => ghl.eventos,
  nombreCalendarioGhl: async ({ calendarId }: { calendarId: string }) => (calendarId === "cal-yara" ? "0. Calendar Yara" : "0. Calendar Principal"),
  contactoGhl: async () => ({ email: "lucia@ejemplo.test", lastAttributionSource: { utmSource: "callers", url: "https://web.ejemplo.test/agenda?utm_source=callers&closer=yara" } }),
  estadoCitaGhl: async () => "sigue",
  borrarCitaGhl: vi.fn(async () => true),
  cambiarUsuarioCitaGhl: vi.fn(async () => undefined),
}));
vi.mock("@/lib/workflows-motor", () => ({ dispararWorkflows: vi.fn(async () => 1), dispararEtiquetas: vi.fn(async () => 1) }));
vi.mock("@/lib/aviso-closer", () => ({ avisarCloserAgenda: vi.fn(async () => undefined) }));
const { cambiarUsuarioCitaGhl } = await import("@/lib/ghl");
const { sincronizarCalendarios } = await import("@/lib/ghl-sync");

const ahora = new Date("2026-11-25T10:00:00Z");
const manana = "2026-11-26T16:00:00.000Z";
const evento = (id: string, calendarId: string, assignedUserId: string) => ({ id, startTime: manana, calendarId, contactId: "ct1", assignedUserId });
const miembro = (perfil_id: string, rol: string, cal: string, user: string, tambien_closer = false) => ({
  perfil_id,
  proyecto_id: "p1",
  ghl_calendar_id: cal,
  ghl_user_id: user,
  perfiles: { rol, nombre: perfil_id, activo: true, tambien_closer },
});

beforeEach(() => {
  vi.mocked(cambiarUsuarioCitaGhl).mockClear();
  base.tablas = {
    proyectos: [{ id: "p1", zona_horaria: "Europe/Madrid", ghl_token: "x", ghl_location_id: "loc", ghl_calendarios: ["cal-principal", "cal-yara"] }],
    // Como en Maestria (25 nov): Thiago, closer puro, tiene el Calendar Principal en su ficha
    miembros_proyecto: [miembro("yara", "caller", "cal-yara", "u-yara", true), miembro("facu", "closer", "cal-facu", "u-facu"), miembro("thiago", "closer", "cal-principal", "u-thiago")],
    leads: [{ id: "l1", proyecto_id: "p1", ghl_contact_id: "ct1", caller_id: "caller-ana", estrellas_caller: 4, estado_caller: "nuevo", etiquetas: [], pais: "AR" }],
    citas: [],
    actividades: [],
  };
});

describe("lectura de GHL: calendario personal", () => {
  it("cita nueva en el calendario de Yara (lead sin caller): closer y «agendó» = Yara, sin pasar por el reparto", async () => {
    base.tablas.leads[0].caller_id = null;
    ghl.eventos = [evento("g-yara", "cal-yara", "u-yara")];
    await sincronizarCalendarios("p1", { ahora });
    expect(base.tablas.citas).toHaveLength(1);
    expect(base.tablas.citas[0]).toMatchObject({ closer_id: "yara", agendada_por: "yara", ghl_calendario: "0. Calendar Yara" });
    expect(cambiarUsuarioCitaGhl).not.toHaveBeenCalled();
  });

  it("si el lead es de otro caller y llega por su enlace de «callers», la agenda sigue siendo de ese caller (closer = Yara)", async () => {
    ghl.eventos = [evento("g-yara", "cal-yara", "u-yara")];
    await sincronizarCalendarios("p1", { ahora });
    expect(base.tablas.citas[0]).toMatchObject({ canal: "callers", closer_id: "yara", agendada_por: "caller-ana" });
  });

  it("lead de Yara como caller: la agenda es suya", async () => {
    base.tablas.leads[0].caller_id = "yara";
    ghl.eventos = [evento("g-yara", "cal-yara", "u-yara")];
    await sincronizarCalendarios("p1", { ahora });
    expect(base.tablas.citas[0]).toMatchObject({ closer_id: "yara", agendada_por: "yara" });
  });

  it("cita nueva en el Calendar Principal: el reparto como siempre (Facu)", async () => {
    ghl.eventos = [evento("g-pri", "cal-principal", "u-yara")];
    await sincronizarCalendarios("p1", { ahora });
    expect(base.tablas.citas[0]).toMatchObject({ closer_id: "facu", agendada_por: "caller-ana" });
    expect(cambiarUsuarioCitaGhl).toHaveBeenCalledWith(expect.objectContaining({ citaId: "g-pri", usuarioId: "u-facu", calendarId: "cal-facu" }));
  });

  it("el lead tenía una cita abierta con Facu y reserva en el calendario de Yara: 1 sola cita, con Yara", async () => {
    base.tablas.citas = [{ id: "c1", proyecto_id: "p1", lead_id: "l1", estado: "pendiente", fecha: "2026-11-27T09:00:00.000Z", closer_id: "facu", agendada_por: null, ghl_cita_id: "g-vieja", origen: "ghl", canal: null, ghl_calendario: "0. Calendar Principal", creado_en: "2026-11-20T09:00:00Z" }];
    ghl.eventos = [evento("g-yara", "cal-yara", "u-yara")];
    await sincronizarCalendarios("p1", { ahora });
    expect(base.tablas.citas).toHaveLength(1);
    expect(base.tablas.citas[0]).toMatchObject({ id: "c1", closer_id: "yara", ghl_cita_id: "g-yara", fecha: manana });
  });

  it("la lectura siguiente trae la misma cita con otro usuario de GHL: sigue con Yara", async () => {
    base.tablas.citas = [{ id: "c1", proyecto_id: "p1", lead_id: "l1", estado: "pendiente", fecha: manana, closer_id: "yara", agendada_por: "yara", ghl_cita_id: "g-yara", origen: "ghl", canal: "callers", ghl_calendario: "0. Calendar Yara", creado_en: "2026-11-24T09:00:00Z" }];
    ghl.eventos = [evento("g-yara", "cal-yara", "u-facu")];
    await sincronizarCalendarios("p1", { ahora });
    expect(base.tablas.citas[0]).toMatchObject({ closer_id: "yara", agendada_por: "yara" });
  });
});
