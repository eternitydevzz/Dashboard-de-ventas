// Fases 5-6 zona C (Cristian, 17 nov 2026): X4 en la lectura de calendarios de GHL. Si la base no responde, la
// lectura se para; antes lo tomaba como «no hay» (y volvía a crear citas que ya estaban, o se quedaba sin closers).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string } | null };
const base = vi.hoisted(() => ({ citas: [] as { id: string; ghl_cita_id: string }[], falla: "" as "" | "citas" | "miembros" | "leads", inserts: 0 }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const ops: [string, unknown[]][] = [];
      const hay = (m: string) => ops.some(([o]) => o === m);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "not", "gte", "lt", "lte", "order", "limit", "update", "insert", "upsert", "maybeSingle", "single"]) q[m] = (...a: unknown[]) => (ops.push([m, a]), q);
      const caida = { data: null, error: { message: "base caída" } };
      const responder = (): Resp => {
        if (tabla === "proyectos" && !hay("update")) return { data: { id: "p1", ghl_token: "x", ghl_location_id: "loc", ghl_calendarios: ["cal1"] }, error: null };
        if (tabla === "miembros_proyecto") return base.falla === "miembros" ? caida : { data: [], error: null };
        if (tabla === "leads" && !hay("update")) return base.falla === "leads" ? caida : { data: { id: "l1", estado_caller: "vendido", etiquetas: [], pais: "ES" }, error: null };
        if (tabla === "citas" && hay("insert")) {
          base.inserts++;
          const fila = ops.find(([o]) => o === "insert")![1][0] as { ghl_cita_id: string };
          const c = { id: `ci-${fila.ghl_cita_id}`, ghl_cita_id: fila.ghl_cita_id };
          base.citas.push(c);
          return { data: c, error: null };
        }
        if (tabla === "citas" && !hay("update")) {
          const enLista = ops.find(([o, a]) => o === "in" && a[0] === "ghl_cita_id");
          if (enLista && base.falla === "citas") return caida;
          return { data: enLista ? base.citas.filter((c) => (enLista[1][1] as string[]).includes(c.ghl_cita_id)) : [], error: null };
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
  contactosPrincipales: async () => new Map(),
  datosAgendaGhl: async () => ({}),
  CAMPOS_CITA: "*",
  juntarConCitaAbierta: async () => null,
  guardarLeads: async () => undefined,
  moverAAgendadosOrganico: async () => undefined,
  pipelineCitaGhl: async () => null,
  telefonoClave: (t: string | null) => (t ?? "").replace(/\D/g, ""),
}));
vi.mock("@/lib/ghl", async (original) => ({
  ...(await original<typeof import("@/lib/ghl")>()),
  eventosGhl: async () => [{ id: "g1", startTime: "2026-11-09T12:00:00Z", calendarId: "cal1", contactId: "c1" }],
  nombreCalendarioGhl: async () => "Demo",
  contactoGhl: async () => ({ email: "a@x.com" }),
  estadoCitaGhl: async () => "existe",
}));
vi.mock("@/lib/workflows-motor", () => ({ dispararWorkflows: vi.fn(async () => 0) }));
const { sincronizarCalendarios } = await import("@/lib/ghl-sync");
const ahora = new Date("2026-11-08T12:00:00Z");

beforeEach(() => {
  base.citas = [{ id: "ci-g1", ghl_cita_id: "g1" }]; // la cita ya está en la app
  base.falla = "";
  base.inserts = 0;
});

describe("X4 · ghl-sync: un fallo de la base no se toma como «no hay»", () => {
  it("si falla leer las citas que ya están, no las vuelve a crear", async () => {
    base.falla = "citas";
    await expect(sincronizarCalendarios("p1", { ahora })).rejects.toThrow(/base caída/);
    expect(base.inserts).toBe(0);
  });

  it("si falla leer el equipo, avisa del fallo (no sigue como si no hubiera closers)", async () => {
    base.falla = "miembros";
    await expect(sincronizarCalendarios("p1", { ahora })).rejects.toThrow(/base caída/);
  });

  it("si falla buscar el lead, no crea la cita como si no existiera", async () => {
    base.citas = [];
    base.falla = "leads";
    await expect(sincronizarCalendarios("p1", { ahora })).rejects.toThrow(/base caída/);
    expect(base.inserts).toBe(0);
  });
});
