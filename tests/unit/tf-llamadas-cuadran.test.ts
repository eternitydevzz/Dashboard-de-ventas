import { describe, expect, it } from "vitest";
import { calcularFunnel, type Base } from "@/lib/metricas";
import { calcularKpis } from "@/lib/kpis";
import { rangoDe } from "@/lib/formato";
import type { Perfil } from "@/lib/tipos";

// A5-06: el Funnel y «Por persona» deben dar las mismas llamadas de callers (1 por lead y día, solo callers)
const NY = "America/New_York";
const persona = (id: string, rol: Perfil["rol"]): Perfil => ({ id, nombre: id, email: `${id}@t`, rol, telefono: null, whatsapp: null, admin_activo: false, onboarding_completo: true, activo: true });
const octubre = rangoDe("rango", NY, "2026-10-01", "2026-10-31");
const act = (lead_id: string, perfil_id: string | null, creado_en: string) => ({ lead_id, perfil_id, tipo: "llamada", resultado: "no_contesta", creado_en });

const base = (): Base => ({
  gente: [persona("carla", "caller"), persona("pepe", "caller"), persona("ana", "closer"), persona("jefa", "director")],
  leads: [],
  citas: [],
  ventas: [],
  pagos: [],
  actividades: [
    act("l1", "carla", "2026-10-03T16:00:00Z"),
    act("l1", "carla", "2026-10-03T18:00:00Z"), // mismo lead y día: 1
    act("l1", "pepe", "2026-10-03T19:00:00Z"), // otro caller, mismo lead y día: el total lo cuenta 1 vez
    act("l2", "pepe", "2026-10-04T16:00:00Z"),
    act("l3", "ana", "2026-10-05T16:00:00Z"), // closer: no es llamada de caller
    act("l4", "jefa", "2026-10-05T16:00:00Z"), // director: tampoco
    act("l5", null, "2026-10-05T16:00:00Z"), // sin persona: tampoco
  ],
});

describe("A5-06: llamadas del Funnel = total de «Por persona»", () => {
  it("sin filtro de vendedor, el Funnel solo cuenta a los callers", () => {
    const f = calcularFunnel(base(), octubre, null, NY);
    const k = calcularKpis(base(), octubre, NY);
    expect(k.totalCallers.llamadas).toBe(2);
    expect(f.llamadasCaller).toBe(k.totalCallers.llamadas);
  });
  it("con un caller elegido, cuadra con su tarjeta", () => {
    const f = calcularFunnel(base(), octubre, persona("pepe", "caller"), NY);
    const pepe = calcularKpis(base(), octubre, NY).callers.find((c) => c.perfil.id === "pepe")!;
    expect(f.llamadasCaller).toBe(pepe.llamadas);
    expect(f.llamadasCaller).toBe(2);
  });
});
