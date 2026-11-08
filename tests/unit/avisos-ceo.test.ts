// Plan GHL F1a: los 4 avisos del CEO y el reporte de leads y agendas del día anterior en Madrid.
// Base falsa: cada tabla devuelve lo que pone `filas`, y se apuntan los filtros de cada consulta.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Op = [string, unknown[]];
let filas: Record<string, unknown>;
let consultas: { tabla: string; ops: Op[] }[];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const ops: Op[] = [];
      consultas.push({ tabla, ops });
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "gte", "lt", "order", "maybeSingle"]) q[m] = (...a: unknown[]) => (ops.push([m, a]), q);
      q.then = (r: (v: unknown) => unknown) => {
        const v = filas[tabla];
        return Promise.resolve(typeof v === "number" ? { count: v, data: null, error: null } : { data: v ?? [], error: null }).then(r);
      };
      return q;
    },
  }),
}));
const { avisosCeo, diaAnterior, reporteDia } = await import("@/lib/avisos-ceo");

beforeEach(() => {
  filas = {};
  consultas = [];
});

const iso = (d: Date) => d.toISOString();

describe("diaAnterior en Madrid", () => {
  it("un día normal de invierno (UTC+1)", () => {
    const d = diaAnterior(new Date("2026-11-08T07:00:00Z"));
    expect([d.ymd, iso(d.desde), iso(d.hasta)]).toEqual(["2026-11-07", "2026-11-06T23:00:00.000Z", "2026-11-07T23:00:00.000Z"]);
  });
  it("a las 00:30 de Madrid ya es el día siguiente, aunque en UTC no", () => {
    expect(diaAnterior(new Date("2026-11-08T23:30:00Z")).ymd).toBe("2026-11-08");
  });
  it("cambio de hora de octubre: el día tiene 25 horas", () => {
    const d = diaAnterior(new Date("2026-10-26T07:00:00Z"));
    expect([d.ymd, iso(d.desde), iso(d.hasta)]).toEqual(["2026-10-25", "2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z"]);
  });
  it("cambio de hora de marzo: el día tiene 23 horas", () => {
    const d = diaAnterior(new Date("2026-03-30T06:00:00Z"));
    expect([d.ymd, iso(d.desde), iso(d.hasta)]).toEqual(["2026-03-29", "2026-03-28T23:00:00.000Z", "2026-03-29T22:00:00.000Z"]);
  });
});

describe("avisosCeo", () => {
  it("sin nada raro, no hay avisos", async () => {
    filas = { proyectos: { ghl_ultimo_resultado: "3 nuevas · 1 actualizadas · 0 sin unir · 0 inválidas" }, entradas: [{ id: "e1" }] };
    expect(await avisosCeo("p1")).toEqual([]);
  });

  it("cada uno de los 4 avisos, con cuántos hay", async () => {
    filas = {
      citas: [
        { closer_id: null, estado: "pendiente" },
        { closer_id: null, estado: "confirmada" },
        { closer_id: null, estado: "cancelada" }, // cerrada: no cuenta (porRecuperar)
      ],
      entradas: [{ id: "e1" }, { id: "e2" }],
      webhook_eventos: [{ id: "w1" }],
      workflow_ejecuciones: [{ id: "x1" }, { id: "x2" }, { id: "x3" }],
      proyectos: { ghl_ultimo_resultado: "0 nuevas · 0 actualizadas · 0 sin unir · 0 inválidas · 2 con error" },
    };
    const avisos = await avisosCeo("p1");
    expect(avisos.map((a) => [a.tipo, a.cuantos])).toEqual([
      ["cita_sin_closer", 2],
      ["envio_rojo", 1],
      ["workflow_error", 3],
      ["calendario", 2],
    ]);
    expect(avisos.every((a) => a.texto.length > 0)).toBe(true);
    // Todo es del proyecto: las citas y los workflows filtran por él, y los envíos por sus Entradas
    for (const t of ["citas", "workflow_ejecuciones", "entradas"]) expect(consultas.find((c) => c.tabla === t)!.ops).toContainEqual(["eq", ["proyecto_id", "p1"]]);
    expect(consultas.find((c) => c.tabla === "webhook_eventos")!.ops).toContainEqual(["in", ["entrada_id", ["e1", "e2"]]]);
    expect(consultas.find((c) => c.tabla === "workflow_ejecuciones")!.ops).toContainEqual(["eq", ["estado", "error"]]);
  });
});

describe("reporteDia", () => {
  it("cuenta los leads y las agendas creados el día anterior en Madrid", async () => {
    filas = { leads: 7, citas: 3 };
    expect(await reporteDia("p1", new Date("2026-10-26T07:00:00Z"))).toEqual({ dia: "2026-10-25", leads: 7, agendas: 3 });
    for (const t of ["leads", "citas"]) {
      const ops = consultas.find((c) => c.tabla === t)!.ops;
      expect(ops).toContainEqual(["eq", ["proyecto_id", "p1"]]);
      expect(ops).toContainEqual(["gte", ["creado_en", "2026-10-24T22:00:00.000Z"]]);
      expect(ops).toContainEqual(["lt", ["creado_en", "2026-10-25T23:00:00.000Z"]]);
    }
  });
});
