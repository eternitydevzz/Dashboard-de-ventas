// Plan GHL 2.4 · fase 4d, B2 (Cristian, 8 nov 2026): la lectura de citas de GHL arranca los workflows de cita.
// Cita nueva → «agendada»; cita que pasa a cancelada (estado de GHL o borrada en GHL) → «cancelada».
// Un fallo de los workflows nunca rompe la lectura. Base, GHL y motor simulados (patrón de ghl-429.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANALES_POR_DEFECTO, canalDeOrigen } from "@/lib/canal";

type Resp = { data: unknown; error: { message: string } | null };
let respuesta: Record<string, Resp>;
let insertadas: Record<string, unknown>[]; // filas que se insertan en `citas`
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const ops: string[] = [];
      const tipo = () => (ops.includes("update") ? "update" : ops.includes("insert") ? "insert" : ops.includes("upsert") ? "upsert" : "select");
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "not", "gte", "lt", "lte", "order", "limit", "update", "insert", "upsert", "maybeSingle", "single"]) q[m] = () => (ops.push(m), q);
      q.insert = (fila: Record<string, unknown>) => (ops.push("insert"), tabla === "citas" && insertadas.push(fila), q);
      q.then = (r: (v: Resp) => unknown) => Promise.resolve(respuesta[`${tabla}:${tipo()}`] ?? { data: null, error: null }).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/cifrado", () => ({ descifrar: () => "token" }));
vi.mock("@/lib/leads", () => ({
  columnaCitasGhl: async () => null,
  datosAgendaGhl: async () => ({}),
  guardarLeads: async () => undefined,
  moverAAgendadosOrganico: async () => undefined,
  pipelineCitaGhl: async () => null,
  telefonoClave: (t: string | null) => (t ?? "").replace(/\D/g, ""),
}));
const ghl = vi.hoisted(() => ({ eventos: [] as Record<string, unknown>[], estado: "existe" as string }));
vi.mock("@/lib/ghl", async (original) => ({
  ...(await original<typeof import("@/lib/ghl")>()),
  eventosGhl: async () => ghl.eventos,
  nombreCalendarioGhl: async () => "Software demo",
  contactoGhl: async () => ({ attributionSource: { url: "https://eternity.llc/demo?utm_source=dfy", utmSource: "dfy" } }),
  estadoCitaGhl: async () => ghl.estado,
}));
vi.mock("@/lib/workflows-motor", () => ({ dispararWorkflows: vi.fn(async () => 1), dispararEtiquetas: vi.fn(async () => undefined) }));
const { dispararWorkflows } = await import("@/lib/workflows-motor");
const { sincronizarCalendarios } = await import("@/lib/ghl-sync");

const ahora = new Date("2026-11-08T12:00:00Z");
const FECHA = "2026-11-10T15:00:00.000Z";
const CANAL = canalDeOrigen("https://eternity.llc/demo?utm_source=dfy", "dfy");

beforeEach(() => {
  vi.mocked(dispararWorkflows).mockReset().mockResolvedValue(1);
  ghl.eventos = [];
  ghl.estado = "existe";
  insertadas = [];
  respuesta = {
    "proyectos:select": { data: { id: "p1", ghl_token: "x", ghl_location_id: "loc", ghl_calendarios: ["cal1"] }, error: null },
    "miembros_proyecto:select": { data: [], error: null },
    "pipelines:select": { data: [], error: null },
    "leads:select": { data: { id: "l1", estado_caller: "nuevo", etiquetas: [] }, error: null },
    "citas:select": { data: [], error: null },
    "citas:insert": { data: { id: "ci1", ghl_cita_id: "g1", estado: "pendiente", fecha: FECHA, closer_id: null, canal: CANAL, ghl_calendario: "Software demo", creado_en: ahora.toISOString(), lead_id: "l1" }, error: null },
  };
});

describe("cita nueva leída de GHL → «agendada»", () => {
  it("con su canal, el nombre del calendario y la fecha", async () => {
    ghl.eventos = [{ id: "g1", startTime: FECHA, calendarId: "cal1", contactId: "c1" }];
    const r = await sincronizarCalendarios("p1", { ahora });
    expect(r.nuevas).toBe(1);
    expect(dispararWorkflows).toHaveBeenCalledTimes(1);
    expect(dispararWorkflows).toHaveBeenCalledWith("p1", "l1", { tipo: "cita", evento: "agendada", canal: CANAL, calendario: "Software demo", fecha: FECHA });
  });
  it("una que ya llega cancelada de GHL no es «agendada»", async () => {
    ghl.eventos = [{ id: "g1", startTime: FECHA, calendarId: "cal1", contactId: "c1", appointmentStatus: "cancelled" }];
    await sincronizarCalendarios("p1", { ahora });
    expect(dispararWorkflows).not.toHaveBeenCalledWith("p1", "l1", expect.objectContaining({ evento: "agendada" }));
  });
  it("una cita pasada (la lectura mira 30 días atrás) se crea, pero no dispara: sin disparos en masa al añadir un calendario", async () => {
    ghl.eventos = [{ id: "g1", startTime: "2026-11-01T15:00:00.000Z", calendarId: "cal1", contactId: "c1" }];
    const r = await sincronizarCalendarios("p1", { ahora });
    expect(r.nuevas).toBe(1);
    expect(dispararWorkflows).not.toHaveBeenCalled();
  });
  it("una cita que ya existe en la app no vuelve a disparar", async () => {
    respuesta["citas:select"] = { data: [{ id: "ci1", ghl_cita_id: "g1", estado: "pendiente", fecha: FECHA, closer_id: null, canal: CANAL, ghl_calendario: "Software demo", creado_en: "2026-11-01T00:00:00Z", lead_id: "l1" }], error: null };
    ghl.eventos = [{ id: "g1", startTime: FECHA, calendarId: "cal1", contactId: "c1" }];
    const r = await sincronizarCalendarios("p1", { ahora });
    expect(r.nuevas).toBe(0);
    expect(dispararWorkflows).not.toHaveBeenCalled();
  });
  it("si los workflows fallan, la lectura sigue: la cita queda creada y el fallo va a errores", async () => {
    vi.mocked(dispararWorkflows).mockRejectedValue(new Error("base caída"));
    ghl.eventos = [{ id: "g1", startTime: FECHA, calendarId: "cal1", contactId: "c1" }];
    const r = await sincronizarCalendarios("p1", { ahora });
    expect(r.nuevas).toBe(1);
    expect(r.errores).toEqual([expect.stringContaining("base caída")]);
  });
});

describe("cita que pasa a cancelada → «cancelada»", () => {
  const enApp = { id: "ci1", ghl_cita_id: "g1", estado: "pendiente", fecha: FECHA, closer_id: null, canal: "dfy", ghl_calendario: "Software demo", creado_en: "2026-11-01T00:00:00Z", lead_id: "l1" };
  it("GHL la marca cancelada", async () => {
    respuesta["citas:select"] = { data: [enApp], error: null };
    ghl.eventos = [{ id: "g1", startTime: FECHA, calendarId: "cal1", contactId: "c1", appointmentStatus: "cancelled" }];
    const r = await sincronizarCalendarios("p1", { ahora });
    expect(r.actualizadas).toBe(1);
    expect(dispararWorkflows).toHaveBeenCalledTimes(1);
    expect(dispararWorkflows).toHaveBeenCalledWith("p1", "l1", { tipo: "cita", evento: "cancelada", canal: "dfy", calendario: "Software demo", fecha: FECHA });
  });
  it("sigue abierta (solo cambia la hora): nada", async () => {
    respuesta["citas:select"] = { data: [enApp], error: null };
    ghl.eventos = [{ id: "g1", startTime: "2026-11-10T16:00:00.000Z", calendarId: "cal1", contactId: "c1" }];
    await sincronizarCalendarios("p1", { ahora });
    expect(dispararWorkflows).not.toHaveBeenCalled();
  });
  it("borrada en GHL (ya no viene y GHL dice que no existe)", async () => {
    respuesta["citas:select"] = { data: [{ ...enApp, id: "ci2", ghl_cita_id: "g2", lead_id: "l2" }], error: null };
    ghl.estado = "borrada";
    const r = await sincronizarCalendarios("p1", { ahora });
    expect(r.canceladas).toBe(1);
    expect(dispararWorkflows).toHaveBeenCalledWith("p1", "l2", { tipo: "cita", evento: "cancelada", canal: "dfy", calendario: "Software demo", fecha: FECHA });
  });
  it("borrada, con los workflows fallando: se cancela igual", async () => {
    vi.mocked(dispararWorkflows).mockRejectedValue(new Error("uy"));
    respuesta["citas:select"] = { data: [{ ...enApp, id: "ci2", ghl_cita_id: "g2", lead_id: "l2" }], error: null };
    ghl.estado = "borrada";
    const r = await sincronizarCalendarios("p1", { ahora });
    expect(r.canceladas).toBe(1);
    expect(r.errores).toEqual([expect.stringContaining("uy")]);
  });
});

// Plan GHL E1 (Cristian, 8 nov): un caller con «También closer» es closer de las citas de su usuario de GHL
describe("closer de la cita por el usuario de GHL", () => {
  const caller = (tambien_closer: boolean) => ({ perfil_id: "facu", ghl_calendar_id: null, ghl_user_id: "u-facu", perfiles: { rol: "caller", nombre: "Facu", tambien_closer } });
  it("caller con el interruptor: queda de closer", async () => {
    respuesta["miembros_proyecto:select"] = { data: [caller(true)], error: null };
    ghl.eventos = [{ id: "g1", startTime: FECHA, calendarId: "cal1", contactId: "c1", assignedUserId: "u-facu" }];
    await sincronizarCalendarios("p1", { ahora });
    expect(insertadas).toEqual([expect.objectContaining({ closer_id: "facu" })]);
  });
  it("caller sin el interruptor: la cita queda sin closer, como hoy", async () => {
    respuesta["miembros_proyecto:select"] = { data: [caller(false)], error: null };
    ghl.eventos = [{ id: "g1", startTime: FECHA, calendarId: "cal1", contactId: "c1", assignedUserId: "u-facu" }];
    await sincronizarCalendarios("p1", { ahora });
    expect(insertadas).toEqual([expect.objectContaining({ closer_id: null })]);
  });
  it("un closer sigue siendo closer", async () => {
    respuesta["miembros_proyecto:select"] = { data: [{ ...caller(false), perfiles: { rol: "closer", nombre: "Ana", tambien_closer: false } }], error: null };
    ghl.eventos = [{ id: "g1", startTime: FECHA, calendarId: "cal1", contactId: "c1", assignedUserId: "u-facu" }];
    await sincronizarCalendarios("p1", { ahora });
    expect(insertadas).toEqual([expect.objectContaining({ closer_id: "facu" })]);
  });
});

// Plan GHL B2b: los canales salen de la tabla `canales` del proyecto; sin filas, los de siempre
describe("canales del proyecto", () => {
  it("sin filas, los de siempre", async () => {
    ghl.eventos = [{ id: "g1", startTime: FECHA, calendarId: "cal1", contactId: "c1" }];
    await sincronizarCalendarios("p1", { ahora });
    expect(insertadas).toEqual([expect.objectContaining({ canal: "dfy" })]);
  });
  it("con filas, mandan sus alias", async () => {
    const tabla = CANALES_POR_DEFECTO.map((c) => (c.clave === "dfy" ? { ...c, alias: [] } : c.clave === "webinar" ? { ...c, alias: ["dfy"] } : c));
    respuesta["canales:select"] = { data: tabla, error: null };
    ghl.eventos = [{ id: "g1", startTime: FECHA, calendarId: "cal1", contactId: "c1" }];
    await sincronizarCalendarios("p1", { ahora });
    expect(insertadas).toEqual([expect.objectContaining({ canal: "webinar" })]);
  });
});
