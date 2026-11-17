// Fase 8 zona B: lo que cambia de comportamiento en la limpieza de lib (decisiones de Cristian del 17 nov y S3-12).
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ listados: 0 }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ list: async () => (h.listados++, { data: [], error: null }) }) },
    from: () => {
      const q = { select: () => q, eq: () => q, or: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "base caída" } }).then(r) };
      return q;
    },
  }),
}));

const { calcularFunnel } = await import("@/lib/metricas");
const { rangoDe } = await import("@/lib/formato");
const { rangoNav } = await import("@/lib/periodos");
const { enlaceSeguro } = await import("@/lib/popups");
const { closerDeLaRotacion } = await import("@/lib/rotacion");
const { limpiarSubidasHuerfanas } = await import("@/lib/subidas");

afterEach(() => vi.useRealTimers());

describe("A5-08 · Funnel sin «+100 %» si el periodo anterior era 0", () => {
  it("cambioLeads y cambioAgendados son null, no 100", () => {
    const octubre = rangoDe("rango", "UTC", "2026-10-01", "2026-10-31");
    const base = {
      gente: [],
      leads: [{ id: "l1", creado_en: "2026-10-02T15:00:00Z", caller_id: null, closer_id: null }],
      citas: [{ id: "c1", lead_id: "l1", closer_id: null, agendada_por: null, fecha: "2026-10-06T14:00:00Z", estado: "pendiente", creado_en: "2026-10-03T15:00:00Z" }],
      ventas: [],
      actividades: [],
      pagos: [],
    };
    const m = calcularFunnel(base, octubre, null, "UTC");
    expect(m.cambioLeads).toBeNull();
    expect(m.cambioAgendados).toBeNull();
  });
});

describe("A2-02 · «desde» después de «hasta»: se dan la vuelta", () => {
  it("rangoDe", () => {
    const r = rangoDe("rango", "UTC", "2026-10-31", "2026-10-01");
    expect(r.desde?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(r.hasta?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
  it("rangoNav", () => {
    const r = rangoNav("rango", 0, "UTC", "2026-10-31", "2026-10-01");
    expect(r.desde?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(r.hasta?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("A5-07 · el periodo anterior de un mes es el mes anterior entero", () => {
  it("junio → mayo empieza el día 1 (antes, el 2)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    const r = rangoNav("mes", 0, "UTC");
    expect(r.previo?.desde.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(r.previo?.hasta.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
  it("un rango personalizado sigue usando la misma duración justo antes", () => {
    const r = rangoNav("rango", 0, "UTC", "2026-10-11", "2026-10-20");
    expect(r.previo?.desde.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("S3-12", () => {
  it("popups: «/\\evil.com» no es un enlace interno", () => {
    expect(enlaceSeguro("/\\evil.com")).toBeNull();
    expect(enlaceSeguro("/crm")).toBe("/crm");
  });
  it("rotación: un error de base no se disfraza de «no hay closers»", async () => {
    await expect(closerDeLaRotacion("p1")).rejects.toMatchObject({ message: "base caída" });
  });
  it("subidas: en «grabaciones» ni siquiera se listan los archivos", async () => {
    h.listados = 0;
    expect(await limpiarSubidasHuerfanas("grabaciones", "p1")).toBe(0);
    expect(h.listados).toBe(0);
  });
});
