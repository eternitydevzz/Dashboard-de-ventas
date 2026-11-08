// Plan GHL E2: un caller con «También closer» ve sus 2 pantallas, cuenta como closer y solo un admin cambia el interruptor.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calcularKpis } from "@/lib/kpis";
import { calcularVendedores, type Base } from "@/lib/metricas";
import { calcularPermisos } from "@/lib/permisos";
import { rangoDe } from "@/lib/formato";
import { esCloser, type Perfil } from "@/lib/tipos";

let actualizado: Record<string, unknown> | null;
let personaBD: { rol: Perfil["rol"] };
let exigirImpl: () => Promise<unknown>;
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/memoria", () => ({ olvidarTodo: () => undefined }));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<object>()), exigir: () => exigirImpl() }));
vi.mock("@/lib/datos", () => {
  // Cadena mínima: select/eq devuelven la misma; maybeSingle y single dan lo de cada tabla; update guarda lo escrito
  const tabla = (nombre: string) => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.maybeSingle = async () => ({ data: { perfil_id: "facu" }, error: null });
    c.single = async () => ({ data: nombre === "perfiles" ? personaBD : null, error: null });
    c.update = (v: Record<string, unknown>) => ({ eq: () => ((actualizado = v), { error: null }) });
    return c;
  };
  return { db: () => ({ from: tabla }), escribir: async (p: unknown) => p };
});
const { guardarTambienCloser } = await import("@/app/(panel)/equipo/ficha-acciones");

const NY = "America/New_York";
const persona = (id: string, rol: Perfil["rol"], tambien_closer = false): Perfil => ({ id, nombre: id, email: `${id}@t`, rol, telefono: null, whatsapp: null, admin_activo: false, onboarding_completo: true, activo: true, tambien_closer });
const octubre = rangoDe("rango", NY, "2026-10-01", "2026-10-31");

describe("esCloser", () => {
  it("closer sí; caller solo con el interruptor", () => {
    expect(esCloser(persona("a", "closer"))).toBe(true);
    expect(esCloser(persona("b", "caller"))).toBe(false);
    expect(esCloser(persona("c", "caller", true))).toBe(true);
    expect(esCloser({ rol: "caller" })).toBe(false); // el campo es opcional
  });
});

describe("Permisos: sus 2 pantallas", () => {
  it("un caller con el interruptor suma lo de siempre de un closer (Agendas) y conserva lo suyo", () => {
    const sin = calcularPermisos("caller", [], []);
    const con = calcularPermisos("caller", [], [], true);
    expect(sin.has("agendas")).toBe(false); // como hoy
    expect(con.has("agendas")).toBe(true);
    expect(con.has("cola")).toBe(true); // «Mis leads» sigue
    expect(con.has("finanzas")).toBe(false); // lo que nunca, nunca
    expect(con.has("equipo")).toBe(false);
  });
  it("manda la persona: si le cierran Agendas en su ficha, no la ve", () => {
    expect(calcularPermisos("caller", [], [{ seccion: "agendas", permitido: false }], true).has("agendas")).toBe(false);
  });
  it("un closer o un director no cambian", () => {
    expect([...calcularPermisos("closer", [], [], true)].sort()).toEqual([...calcularPermisos("closer", [], [])].sort());
    expect([...calcularPermisos("director", [], [], true)].sort()).toEqual([...calcularPermisos("director", [], [])].sort());
  });
});

describe("KPIs y Ranking: también cuenta como closer", () => {
  const base = (facuTambien: boolean): Base =>
    ({
      gente: [persona("facu", "caller", facuTambien), persona("ana", "closer")],
      leads: [],
      actividades: [],
      citas: [{ id: "c1", lead_id: "l1", closer_id: "facu", agendada_por: "ana", creado_en: "2026-10-04T16:00:00Z", fecha: "2026-10-08T18:00:00Z", estado: "cerrada" }],
      ventas: [{ id: "v1", lead_id: "l1", vendedor_id: "facu", facturacion: 1997, cash_collected: 500, fecha: "2026-10-08T15:00:00Z", producto_id: null }],
      pagos: [],
    }) as unknown as Base;
  it("con el interruptor sale en la lista de closers (y sigue en la de callers) con sus citas y ventas", () => {
    const k = calcularKpis(base(true), octubre, NY);
    const facu = k.closers.find((c) => c.perfil.id === "facu");
    expect(facu).toMatchObject({ ventas: 1, facturacion: 1997 });
    expect(k.callers.some((c) => c.perfil.id === "facu")).toBe(true);
    expect(calcularVendedores(base(true), octubre).closers.find((c) => c.perfil.id === "facu")).toMatchObject({ citas: 1, ventas: 1 });
  });
  it("sin el interruptor, como hoy: no sale de closer", () => {
    expect(calcularKpis(base(false), octubre, NY).closers.map((c) => c.perfil.id)).toEqual(["ana"]);
    expect(calcularVendedores(base(false), octubre).closers.map((c) => c.perfil.id)).toEqual(["ana"]);
  });
});

describe("guardarTambienCloser (servidor)", () => {
  beforeEach(() => {
    actualizado = null;
    personaBD = { rol: "caller" };
    exigirImpl = async () => ({ perfil: { id: "ceo", rol: "ceo" }, proyecto: { id: "p1" } });
  });
  it("quien edita fichas lo enciende y lo apaga en un caller", async () => {
    expect(await guardarTambienCloser("facu", true)).toBeUndefined();
    expect(actualizado).toEqual({ tambien_closer: true });
    await guardarTambienCloser("facu", false);
    expect(actualizado).toEqual({ tambien_closer: false });
  });
  it("sin permiso de admin, no guarda nada", async () => {
    exigirImpl = async () => {
      throw new Error("no admin");
    };
    expect(await guardarTambienCloser("facu", true)).toMatchObject({ error: expect.any(String) });
    expect(actualizado).toBeNull();
  });
  it("solo para callers: un closer o un director, rechazado", async () => {
    for (const rol of ["closer", "director"] as const) {
      personaBD = { rol };
      expect(await guardarTambienCloser("facu", true)).toMatchObject({ error: expect.stringMatching(/callers/) });
    }
    expect(actualizado).toBeNull();
  });
});
