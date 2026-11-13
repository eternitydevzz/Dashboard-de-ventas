// Plan GHL 4.5: como mucho MAX_CITAS_NUEVAS citas nuevas por lectura (cada una lee su contacto de GHL y hace ~10
// consultas); las demás entran en la siguiente lectura. Base con memoria: lo que se inserta en `citas` se ve después.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string } | null };
type Cita = { id: string; ghl_cita_id: string; estado: string; fecha: string; closer_id: null; canal: null; ghl_calendario: string; creado_en: string; lead_id: string };
let citas: Cita[];
let lecturasProyecto = 0;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const ops: [string, unknown[]][] = [];
      const hay = (m: string) => ops.some(([o]) => o === m);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "not", "gte", "lt", "lte", "order", "limit", "update", "insert", "upsert", "maybeSingle", "single"]) q[m] = (...a: unknown[]) => (ops.push([m, a]), q);
      const responder = (): Resp => {
        if (tabla === "proyectos" && !hay("update")) return lecturasProyecto++, { data: { id: "p1", ghl_token: "x", ghl_location_id: "loc", ghl_calendarios: ["cal1"] }, error: null };
        if (tabla === "leads") return { data: { id: "l1", estado_caller: "nuevo", etiquetas: [] }, error: null };
        if (tabla === "citas" && hay("insert")) {
          const fila = ops.find(([o]) => o === "insert")![1][0] as { ghl_cita_id: string; fecha: string; estado: string };
          const c: Cita = { id: `ci-${fila.ghl_cita_id}`, ghl_cita_id: fila.ghl_cita_id, estado: fila.estado, fecha: fila.fecha, closer_id: null, canal: null, ghl_calendario: "Demo", creado_en: new Date().toISOString(), lead_id: "l1" };
          citas.push(c);
          return { data: c, error: null };
        }
        if (tabla === "citas" && !hay("update")) {
          const enLista = ops.find(([o, a]) => o === "in" && a[0] === "ghl_cita_id");
          return { data: enLista ? citas.filter((c) => (enLista[1][1] as string[]).includes(c.ghl_cita_id)) : [], error: null };
        }
        return { data: [], error: null };
      };
      q.then = (r: (v: Resp) => unknown) => Promise.resolve(responder()).then(r);
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
const ghl = vi.hoisted(() => ({ eventos: [] as Record<string, unknown>[] }));
vi.mock("@/lib/ghl", async (original) => ({
  ...(await original<typeof import("@/lib/ghl")>()),
  eventosGhl: async () => ghl.eventos,
  nombreCalendarioGhl: async () => "Demo",
  contactoGhl: async () => ({ email: "a@x.com" }),
  estadoCitaGhl: async () => "existe",
}));
vi.mock("@/lib/workflows-motor", () => ({ dispararWorkflows: vi.fn(async () => 1) }));
const { dispararWorkflows } = await import("@/lib/workflows-motor");
const { sincronizarCalendarios, MAX_CITAS_NUEVAS } = await import("@/lib/ghl-sync");

const ahora = new Date("2026-11-08T12:00:00Z");

beforeEach(() => {
  citas = [];
  vi.mocked(dispararWorkflows).mockClear();
  ghl.eventos = Array.from({ length: 30 }, (_, i) => ({ id: `g${i + 1}`, startTime: new Date(ahora.getTime() + (i + 1) * 3_600_000).toISOString(), calendarId: "cal1", contactId: `c${i + 1}` }));
});

describe("tope de citas nuevas por lectura", () => {
  it("el tope es 20", () => {
    expect(MAX_CITAS_NUEVAS).toBe(20);
  });

  it("con 30 nuevas: la 1.ª lectura crea 20, la 2.ª las 10 restantes y la 3.ª ninguna, sin duplicados", async () => {
    expect((await sincronizarCalendarios("p1", { ahora })).nuevas).toBe(20);
    expect(citas).toHaveLength(20);
    expect((await sincronizarCalendarios("p1", { ahora })).nuevas).toBe(10);
    expect((await sincronizarCalendarios("p1", { ahora })).nuevas).toBe(0);
    expect(citas.map((c) => c.ghl_cita_id).sort()).toEqual(ghl.eventos.map((e) => e.id as string).sort());
    // Cada cita nueva (futura) dispara sus workflows una sola vez
    expect(dispararWorkflows).toHaveBeenCalledTimes(30);
  });

  it("las que ya existen no cuentan: con 25 ya en la app y 5 cancelándose, se actualizan las 5 y se crean las 5 nuevas", async () => {
    await sincronizarCalendarios("p1", { ahora });
    await sincronizarCalendarios("p1", { ahora }); // las 30 ya en la app
    ghl.eventos = [
      ...ghl.eventos.slice(0, 25).map((e, i) => (i < 5 ? { ...e, appointmentStatus: "cancelled" } : e)),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `n${i + 1}`, startTime: new Date(ahora.getTime() + 86_400_000).toISOString(), calendarId: "cal1", contactId: `cn${i + 1}` })),
    ];
    const r = await sincronizarCalendarios("p1", { ahora });
    expect(r.actualizadas).toBe(5);
    expect(r.nuevas).toBe(5);
  });

  it("D43: con el proyecto ya leído (la lectura de cada minuto) no lo vuelve a pedir", async () => {
    lecturasProyecto = 0;
    const proyecto = { id: "p1", ghl_token: "x", ghl_location_id: "loc", ghl_calendarios: ["cal1"] } as unknown as NonNullable<Parameters<typeof sincronizarCalendarios>[1]>["proyecto"];
    expect((await sincronizarCalendarios("p1", { ahora, proyecto })).nuevas).toBe(20);
    expect(lecturasProyecto).toBe(0);
    await sincronizarCalendarios("p1", { ahora });
    expect(lecturasProyecto).toBe(1);
  });
});
