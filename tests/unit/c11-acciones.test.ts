// C11 (plan Callers, 7 nov): botones nuevos. Base simulada como en arreglos-callers.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { elegirCloser, elegirCloserPorPais } from "@/lib/rotacion";

type Resp = { data: unknown; error: { message: string } | null };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let respuesta: Record<string, Resp>;
let consultas: Consulta[];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => ({ error: null }),
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const tipo = () => (c.ops.some(([o]) => o === "update") ? "update" : c.ops.some(([o]) => o === "insert") ? "insert" : "select");
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "limit", "update", "insert", "maybeSingle", "single"]) q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: Resp) => unknown) => Promise.resolve(respuesta[`${tabla}:${tipo()}`] ?? { data: null, error: null }).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => undefined }));
const { getSesion } = await import("@/lib/sesion");
const { registrarLlamada, confirmarAgenda } = await import("@/app/(panel)/leads/acciones");

const insertDe = (t: string) => consultas.find((c) => c.tabla === t && c.ops.some(([o]) => o === "insert"))?.ops.find(([o]) => o === "insert")?.[1][0] as Record<string, unknown> | undefined;
const updateDe = (t: string) => consultas.find((c) => c.tabla === t && c.ops.some(([o]) => o === "update"))?.ops.find(([o]) => o === "update")?.[1][0] as Record<string, unknown> | undefined;

beforeEach(() => {
  consultas = [];
  vi.mocked(getSesion).mockResolvedValue({ perfil: { id: "u1", rol: "caller" }, proyecto: { id: "p1", zona_horaria: "Europe/Madrid" } } as never);
  respuesta = { "leads:select": { data: { id: "l1", caller_id: "u1", closer_id: null, estado_caller: "nuevo", pipeline_id: null, etapa_id: null }, error: null } };
});

describe("C11 · rotación de closers", () => {
  it("el que tiene menos citas para su %; con todos al 0 %, ninguno", () => {
    expect(elegirCloser([{ perfil_id: "cristian", rotacion_pct: 100, rotacion_cuenta: 9 }, { perfil_id: "junior", rotacion_pct: 0, rotacion_cuenta: 0 }])).toBe("cristian");
    expect(elegirCloser([{ perfil_id: "a", rotacion_pct: 50, rotacion_cuenta: 3 }, { perfil_id: "b", rotacion_pct: 50, rotacion_cuenta: 2 }])).toBe("b");
    expect(elegirCloser([{ perfil_id: "a", rotacion_pct: 0, rotacion_cuenta: 0 }])).toBeNull();
  });
  it("11 nov: el país del lead manda (España, Europa → Facu); sin país o de otro país, la rotación (Thiago 100 %)", () => {
    const c = [
      { perfil_id: "thiago", rotacion_pct: 100, rotacion_cuenta: 7, paises_closer: [] },
      { perfil_id: "facu", rotacion_pct: 0, rotacion_cuenta: 0, paises_closer: ["ES", "IT", "AE"] },
    ];
    expect(elegirCloserPorPais(c, "ES")).toBe("facu");
    expect(elegirCloserPorPais(c, " it ")).toBe("facu");
    expect(elegirCloserPorPais(c, "AR")).toBe("thiago");
    expect(elegirCloserPorPais(c, null)).toBe("thiago");
    expect(elegirCloserPorPais(c, "Sin país")).toBe("thiago");
  });
});

describe("C11 · botones de resultado", () => {
  const insertsDe = (t: string) => consultas.filter((c) => c.tabla === t).flatMap((c) => c.ops.filter(([o]) => o === "insert").map(([, a]) => a[0] as Record<string, unknown>));
  it("«Link de agenda» lleva a «Link enviado», apunta una llamada (KPI «Llamadas hoy») y no toca las estrellas", async () => {
    expect(await registrarLlamada("l1", "link_enviado", "")).toBeUndefined();
    expect(updateDe("leads")).toEqual({ estado_caller: "link_enviado", llamar_en: null });
    expect(insertsDe("actividades")).toEqual([expect.objectContaining({ tipo: "llamada", resultado: "link_enviado" })]);
  });
  it("«Wsp enviado» apunta una llamada y un WhatsApp (10 nov); «No responde», un cambio de columna", async () => {
    await registrarLlamada("l1", "wsp_enviado", "");
    expect(insertsDe("actividades")).toEqual([expect.objectContaining({ tipo: "llamada", resultado: "wsp_enviado" }), expect.objectContaining({ tipo: "whatsapp", resultado: "wsp_enviado" })]);
    consultas = [];
    await registrarLlamada("l1", "no_responde", "");
    expect(insertDe("actividades")).toMatchObject({ tipo: "cambio_etapa", resultado: "no_responde" });
  });
  it("«Seguimiento» pide estrellas de 2 a 5, como hoy, y las guarda", async () => {
    expect(await registrarLlamada("l1", "seguimiento", "")).toMatchObject({ error: expect.stringMatching(/2 a 5/) });
    consultas = [];
    await registrarLlamada("l1", "seguimiento", "quiere pensarlo", 4);
    expect(updateDe("leads")).toEqual({ estado_caller: "seguimiento", llamar_en: null, estrellas_caller: 4 });
  });
  it("«Llamar luego» guarda cuándo (opcional, en la hora del proyecto); los demás estados no", async () => {
    await registrarLlamada("l1", "llamar_luego", "", 3, "2026-11-12T17:00");
    expect(updateDe("leads")).toEqual({ estado_caller: "llamar_luego", llamar_en: "2026-11-12T16:00:00.000Z", estrellas_caller: 3 }); // Madrid = UTC+1
    expect(insertDe("actividades")?.nota).toMatch(/Llamar el 12 nov/);
    consultas = [];
    await registrarLlamada("l1", "llamar_luego", "", 3);
    expect(updateDe("leads")).toEqual({ estado_caller: "llamar_luego", llamar_en: null, estrellas_caller: 3 });
    consultas = [];
    await registrarLlamada("l1", "seguimiento", "", 3, "2026-11-12T17:00");
    expect(updateDe("leads")).toMatchObject({ llamar_en: null });
    expect(await registrarLlamada("l1", "llamar_luego", "", 3, "mañana")).toMatchObject({ error: "Fecha no válida." });
  });
  it("estados que no son un resultado, rechazados (p. ej. el viejo «no_contesta»)", async () => {
    expect(await registrarLlamada("l1", "no_contesta" as never, "")).toMatchObject({ error: "Resultado no válido." });
  });
  it("un caller no mueve un lead que ya compró", async () => {
    respuesta["leads:select"] = { data: { id: "l1", caller_id: "u1", closer_id: null, estado_caller: "vendido" }, error: null };
    expect(await registrarLlamada("l1", "link_enviado", "")).toMatchObject({ error: expect.stringMatching(/compró/) });
    expect(await registrarLlamada("l1", "llamado" as never, "")).toMatchObject({ error: "Resultado no válido." }); // 10 nov: ya no existe
  });
});

describe("C11 · «Confirma Agenda» confirma también la cita (punto 14)", () => {
  it("sin cita abierta, avisa y no cambia nada", async () => {
    respuesta["citas:select"] = { data: null, error: null };
    expect(await confirmarAgenda("l1")).toMatchObject({ error: expect.stringMatching(/cita abierta/) });
    expect(updateDe("leads")).toBeUndefined();
  });
  it("con cita abierta: la cita a «confirmada» y el lead a «Confirma Agenda»", async () => {
    respuesta["citas:select"] = { data: { id: "c1" }, error: null };
    expect(await confirmarAgenda("l1")).toBeUndefined();
    expect(updateDe("citas")).toEqual({ estado: "confirmada" });
    expect(updateDe("leads")).toEqual({ estado_caller: "confirma_agenda", llamar_en: null });
    expect(insertDe("actividades")).toMatchObject({ tipo: "cambio_etapa", resultado: "confirma_agenda" });
  });
});
