// Fase 3 (Cristian, 13 nov 2026): quién ve qué en el Ranking (mercado, bajas y ranking de closers para callers)
import { describe, expect, it } from "vitest";
import { calcularRanking } from "@/lib/kpis";
import type { Base } from "@/lib/metricas";
import { rangoDe } from "@/lib/formato";
import type { Mercado } from "@/lib/mercado";
import type { Perfil } from "@/lib/tipos";

const NY = "America/New_York";
const todo = rangoDe("todo", NY);
const persona = (id: string, rol: Perfil["rol"], extra: Partial<Perfil> & { baja?: true } = {}): Perfil =>
  ({ id, nombre: id, email: `${id}@t`, rol, telefono: null, whatsapp: null, admin_activo: false, onboarding_completo: true, activo: true, ...extra }) as Perfil;

const gente = {
  callerEs: persona("callerEs", "caller"),
  callerLa: persona("callerLa", "caller"),
  closerEs: persona("closerEs", "closer"),
  closerLa: persona("closerLa", "closer"),
  ceo: persona("ceo", "ceo"),
  director: persona("director", "director"),
  // Dado de baja y quitado del proyecto: sin fila en miembros_proyecto
  callerBaja: persona("callerBaja", "caller", { baja: true }),
  closerBaja: persona("closerBaja", "closer", { baja: true }),
};
const mercados: Record<string, Mercado> = { callerEs: "es", callerLa: "latam", closerEs: "es", closerLa: "latam", ceo: "latam", director: "es" };

const llamada = (perfil: string) => ({ lead_id: `l-${perfil}`, perfil_id: perfil, tipo: "llamada", resultado: "contestado", creado_en: "2026-10-03T15:00:00Z" });
const base = (): Base => ({
  gente: Object.values(gente),
  leads: [],
  // Los de baja tienen actividad: sin el filtro saldrían (calcularKpis los deja si hicieron algo)
  actividades: ["callerEs", "callerLa", "callerBaja"].map(llamada),
  citas: ["closerEs", "closerLa", "closerBaja"].map((c) => ({ id: `c-${c}`, lead_id: `l-${c}`, closer_id: c, agendada_por: null, creado_en: "2026-10-01T16:00:00Z", fecha: "2026-10-02T18:00:00Z", estado: "cerrada" })),
  ventas: [],
  pagos: [],
});

const apagado = { ranking_mostrar_bajas: false, ranking_closers_para_callers: false };
const ver = (quien: Perfil, jefe: boolean, pedido: unknown = undefined, proyecto = apagado) => {
  const r = calcularRanking(base(), todo, NY, { perfil: quien, jefe, mercados, pedido, proyecto });
  return { mercado: r.mercado, callers: r.callers.map((c) => c.perfil.id).sort(), closers: r.closers?.map((c) => c.perfil.id).sort() ?? null };
};

describe("Ranking por mercado: callers y closers ven solo el suyo", () => {
  it("caller de España: solo callers de España; sin ranking de closers", () => {
    expect(ver(gente.callerEs, false)).toEqual({ mercado: "es", callers: ["callerEs"], closers: null });
  });

  it("caller de Latam: solo callers de Latam, aunque pida ?mercado=es o «todos»", () => {
    for (const pedido of [undefined, "es", "todos", ""]) expect(ver(gente.callerLa, false, pedido)).toEqual({ mercado: "latam", callers: ["callerLa"], closers: null });
  });

  it("closer de España: callers y closers de España, aunque pida ?mercado=latam", () => {
    expect(ver(gente.closerEs, false, "latam")).toEqual({ mercado: "es", callers: ["callerEs"], closers: ["closerEs"] });
  });

  it("sin mercado elegido (o sin fila) cuenta como Latam", () => {
    const sinFila = persona("nuevo", "closer");
    expect(ver(sinFila, false).mercado).toBe("latam");
  });
});

describe("Ranking por mercado: los jefes eligen", () => {
  it("CEO y director con es / latam / todos", () => {
    for (const jefe of [gente.ceo, gente.director]) {
      expect(ver(jefe, true, "es")).toEqual({ mercado: "es", callers: ["callerEs"], closers: ["closerEs"] });
      expect(ver(jefe, true, "latam")).toEqual({ mercado: "latam", callers: ["callerLa"], closers: ["closerLa"] });
      expect(ver(jefe, true, undefined)).toEqual({ mercado: null, callers: ["callerEs", "callerLa"], closers: ["closerEs", "closerLa"] });
    }
  });
});

describe("Ranking: los de baja", () => {
  it("apagado (por defecto): no salen, ni en «Todos»", () => {
    expect(ver(gente.ceo, true)).toMatchObject({ callers: ["callerEs", "callerLa"], closers: ["closerEs", "closerLa"] });
    expect(ver(gente.ceo, true, undefined, {} as typeof apagado)).toMatchObject({ callers: ["callerEs", "callerLa"] });
  });

  it("encendido: salen en «Todos»; sin fila en miembros_proyecto no se cuelan en Latam ni en España", () => {
    const on = { ...apagado, ranking_mostrar_bajas: true };
    expect(ver(gente.ceo, true, undefined, on)).toEqual({ mercado: null, callers: ["callerBaja", "callerEs", "callerLa"], closers: ["closerBaja", "closerEs", "closerLa"] });
    expect(ver(gente.ceo, true, "latam", on)).toEqual({ mercado: "latam", callers: ["callerLa"], closers: ["closerLa"] });
    expect(ver(gente.callerLa, false, undefined, on).callers).toEqual(["callerLa"]);
  });

  it("encendido y aún con su fila (desactivado, no quitado): sale en su mercado", () => {
    const on = { ...apagado, ranking_mostrar_bajas: true };
    const r = calcularRanking(base(), todo, NY, { perfil: gente.ceo, jefe: true, mercados: { ...mercados, callerBaja: "es" }, pedido: "es", proyecto: on });
    expect(r.callers.map((c) => c.perfil.id).sort()).toEqual(["callerBaja", "callerEs"]);
  });
});

describe("Ranking: closers para callers", () => {
  it("encendido: el caller ve el ranking de closers de su mercado", () => {
    const on = { ...apagado, ranking_closers_para_callers: true };
    expect(ver(gente.callerEs, false, undefined, on)).toEqual({ mercado: "es", callers: ["callerEs"], closers: ["closerEs"] });
  });

  it("un caller que también cierra sí lo ve", () => {
    const mixto = persona("callerEs", "caller", { tambien_closer: true } as Partial<Perfil>);
    expect(ver(mixto, false).closers).not.toBeNull();
  });
});

describe("Ranking: orden", () => {
  it("callers por agendados y closers por facturación, como antes", () => {
    const b = base();
    b.citas.push({ id: "x", lead_id: "lx", closer_id: "closerLa", agendada_por: "callerLa", creado_en: "2026-10-01T16:00:00Z", fecha: "2026-10-02T18:00:00Z", estado: "cerrada" });
    b.ventas.push({ id: "v", lead_id: "lx", vendedor_id: "closerLa", facturacion: 1000, cash_collected: 0, fecha: "2026-10-02T19:00:00Z", producto_id: null });
    const r = calcularRanking(b, todo, NY, { perfil: gente.ceo, jefe: true, mercados, pedido: null, proyecto: apagado });
    expect(r.callers[0].perfil.id).toBe("callerLa");
    expect(r.closers?.[0].perfil.id).toBe("closerLa");
  });
});
