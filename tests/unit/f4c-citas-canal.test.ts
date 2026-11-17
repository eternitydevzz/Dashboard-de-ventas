// Fase 4 · zona c (A5-04): las citas que agenda la app y las reagendadas guardan su canal.
// agendarCita: el canal del lead (su etiqueta «Canal: …», leída con la tabla de canales del proyecto).
// reagendarCita: el canal de la cita de antes. Base simulada; datos inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";

let inserts: { tabla: string; valor: Record<string, unknown> }[];
let lead: Record<string, unknown>;
let cita: Record<string, unknown>;
const h = vi.hoisted(() => ({ rol: "ceo", junta: null as null | { extra: Record<string, unknown> } }));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, refresh: () => undefined }));
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => undefined }));
vi.mock("@/lib/agenda-libre", () => ({ closerLibreA: async () => ({ libre: true }) }));
vi.mock("@/lib/rotacion", async (o) => ({ ...(await o<typeof import("@/lib/rotacion")>()), closerDeLaRotacion: async () => "luis", sumarRotacion: async () => undefined }));
vi.mock("@/lib/mercado-datos", async (o) => ({ ...(await o<typeof import("@/lib/mercado-datos")>()), miMercado: async () => "es" }));
vi.mock("@/lib/auth", () => ({
  getSesion: async () => ({ perfil: { id: "yo", rol: h.rol }, proyecto: { id: "p", zona_horaria: "Europe/Madrid" } }),
  esJefe: () => h.rol !== "caller",
  exigir: async () => undefined,
}));
vi.mock("@/lib/cita-en-ghl", () => ({ crearCitaEnGhl: async () => ({ ok: true }) }));
vi.mock("@/lib/aviso-closer", () => ({ avisarCloserAgenda: async () => undefined }));
vi.mock("@/lib/leads", () => ({ juntarConCitaAbierta: async (_p: string, _l: string, d: { extra: Record<string, unknown> }) => ((h.junta = d), null), datosAgendaGhl: async () => ({}), telefonoClave: (t: string) => t }));
// La tabla del proyecto con YouTube renombrado: el canal sale de la tabla, no de los nombres de siempre
vi.mock("@/lib/canales-datos", async () => {
  const { CANALES_POR_DEFECTO } = await import("@/lib/canal");
  return { canalesDe: async () => CANALES_POR_DEFECTO.map((c) => (c.clave === "yt" ? { ...c, nombre: "YouTube Orgánico" } : c)) };
});
vi.mock("@/lib/datos", () => {
  const tabla = (nombre: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "or", "in", "order", "limit"]) c[m] = () => c;
    c.maybeSingle = async () => ({
      data: nombre === "leads" ? lead : nombre === "citas" ? cita : nombre === "miembros_proyecto" ? { perfil_id: "luis", perfiles: { nombre: "Luis", rol: "closer" } } : null,
      error: null,
    });
    c.update = () => {
      const u: Record<string, unknown> = { eq: () => u, select: async () => ({ data: [{ id: "c1" }], error: null }) };
      u.then = (r: (x: unknown) => unknown) => Promise.resolve({ error: null }).then(r);
      return u;
    };
    c.insert = (v: Record<string, unknown>) => {
      inserts.push({ tabla: nombre, valor: v });
      const i: Record<string, unknown> = { select: () => ({ single: async () => ({ data: { id: "nueva" }, error: null }) }) };
      i.then = (r: (x: unknown) => unknown) => Promise.resolve({ error: null }).then(r);
      return i;
    };
    return c;
  };
  return { db: () => ({ from: tabla }), escribir: async (p: unknown) => p, registrarActividad: async () => undefined, todas: async () => [] };
});

const { agendarCita } = await import("@/app/(panel)/leads/acciones");
const { reagendarCita } = await import("@/app/(panel)/closer/acciones");
const citaGuardada = () => inserts.find((i) => i.tabla === "citas")?.valor;

beforeEach(() => {
  inserts = [];
  h.rol = "ceo";
  h.junta = null;
  lead = { id: "l1", caller_id: null, closer_id: null, pipeline_id: null, pais: null, etiquetas: ["webinar", "Canal: YouTube Orgánico"] };
  cita = { id: "c1", proyecto_id: "p", lead_id: "l1", closer_id: "luis", agendada_por: "dani", estado: "confirmada", nota: null, fecha: "2026-11-24T15:00:00Z", canal: "ig" };
});

describe("f4c · agendarCita guarda el canal del lead", () => {
  it("lead con etiqueta «Canal: …» → la cita lleva su clave (con el nombre de la tabla del proyecto)", async () => {
    expect(await agendarCita("l1", "luis", "2026-11-25T10:00", "")).toEqual({ ok: true });
    expect(citaGuardada()).toMatchObject({ canal: "yt" });
  });

  it("Directo y Otro también se leen", async () => {
    lead.etiquetas = ["Canal: Directo"];
    await agendarCita("l1", "luis", "2026-11-25T10:00", "");
    expect(citaGuardada()).toMatchObject({ canal: "directo" });
  });

  it("lead sin etiqueta de canal (o sin etiquetas) → canal null, como hoy", async () => {
    lead.etiquetas = ["webinar"];
    await agendarCita("l1", "luis", "2026-11-25T10:00", "");
    expect(citaGuardada()).toMatchObject({ canal: null });
    inserts = [];
    delete lead.etiquetas;
    await agendarCita("l1", "luis", "2026-11-25T10:00", "");
    expect(citaGuardada()).toMatchObject({ canal: null });
  });
});

describe("f4c · reagendarCita copia el canal de la cita de antes", () => {
  it("la nueva lleva el mismo canal", async () => {
    await reagendarCita("c1", "2026-11-26T10:00");
    expect(citaGuardada()).toMatchObject({ canal: "ig", lead_id: "l1", closer_id: "luis" });
  });

  it("sin canal en la de antes → null", async () => {
    cita.canal = null;
    await reagendarCita("c1", "2026-11-26T10:00");
    expect(citaGuardada()).toMatchObject({ canal: null });
  });
});

describe("f4c · canal de la cita del caller y al juntar", () => {
  it("Cristian (17 nov): la que agenda un caller desde la app es «callers», como su página de GHL", async () => {
    h.rol = "caller";
    lead.caller_id = "yo";
    expect(await agendarCita("l1", "luis", "2026-11-25T10:00", "", 3)).toEqual({ ok: true });
    expect(citaGuardada()).toMatchObject({ canal: "callers" });
  });

  it("revisor: si se junta con una cita abierta, el canal también va (en extra)", async () => {
    await agendarCita("l1", "luis", "2026-11-25T10:00", "");
    expect(h.junta?.extra).toMatchObject({ canal: "yt" });
  });
});
