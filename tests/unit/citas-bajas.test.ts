// N5 (13 nov): el jefe mirando «Todos los closers» ve también las citas de closers de baja, con «(baja)».
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Perfil } from "@/lib/tipos";

let filtroOr: string | null;
const filas: Record<string, unknown[]> = { citas: [], ventas: [] };
// Fuera del equipo: Ana (desactivada) y un closer de prueba
const perfilesFuera: Record<string, { id: string; nombre: string; es_prueba: boolean }> = {
  ana: { id: "ana", nombre: "Ana", es_prueba: false },
  prueba: { id: "prueba", nombre: "Prueba", es_prueba: true },
};
vi.mock("@/lib/datos", () => {
  const tabla = (nombre: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order"]) c[m] = () => c;
    c.or = (f: string) => ((filtroOr = f), c);
    c.range = async () => ({ data: filas[nombre], error: null });
    return c;
  };
  return {
    db: () => ({ from: tabla }),
    todas: (q: (a: number, b: number) => PromiseLike<{ data: unknown[] | null }>) => q(0, 999).then((r) => r.data ?? []),
    // Como la de verdad: los que faltan, sin los de prueba y con «(baja)»
    conBajas: async (activos: Perfil[], ids: (string | null)[]) => [
      ...activos,
      ...[...new Set(ids)].filter((x) => x && !activos.some((a) => a.id === x) && perfilesFuera[x] && !perfilesFuera[x].es_prueba).map((x) => ({ ...perfilesFuera[x!], nombre: `${perfilesFuera[x!].nombre} (baja)`, baja: true })),
    ],
  };
});
const { cargarCitasVentas } = await import("@/lib/tablero-closers");
const { quienLlevaba } = await import("@/lib/llamadas");

const persona = (id: string, rol: Perfil["rol"] = "closer"): Perfil => ({ id, nombre: id === "luis" ? "Luis" : id, email: `${id}@t`, rol, telefono: null, whatsapp: null, admin_activo: false, onboarding_completo: true, activo: true });
const cita = (id: string, closer_id: string | null) => ({ id, lead_id: `l${id}`, closer_id, fecha: "2026-11-14T15:00:00Z", estado: "pendiente", leads: null });
const equipoActivo = [persona("luis"), persona("dani", "caller")];

describe("cargarCitasVentas con closers de baja (N5)", () => {
  beforeEach(() => {
    filtroOr = null;
    filas.citas = [cita("1", "luis"), cita("2", "ana"), cita("3", null), cita("4", "prueba")];
    filas.ventas = [];
  });

  it("el jefe con todos: pide también las de fuera del equipo y la de Ana sale con «(baja)»", async () => {
    const { citas, gente } = await cargarCitasVentas("p", ["luis"], null, true, equipoActivo);
    expect(filtroOr).toBe("closer_id.in.(luis),closer_id.is.null,closer_id.not.in.(luis,dani)");
    expect(citas.map((c) => c.id)).toEqual(["1", "2", "3"]); // la del closer de prueba, fuera
    const nombre = (id: string | null) => gente.find((g) => g.id === id)?.nombre ?? "—";
    expect(quienLlevaba(citas[1], nombre)).toBe("Ana (baja)");
    expect(quienLlevaba(citas[0], nombre)).toBe("Luis");
  });

  it("sin el equipo (CRM) o con un closer elegido, como antes", async () => {
    await cargarCitasVentas("p", ["luis"], null, true);
    expect(filtroOr).toBe("closer_id.in.(luis),closer_id.is.null");
    filtroOr = null;
    filas.citas = [cita("1", "luis")];
    const { gente } = await cargarCitasVentas("p", ["luis"], null, false, equipoActivo);
    expect(filtroOr).toBeNull(); // .in, sin .or
    expect(gente).toEqual(equipoActivo);
  });
});
