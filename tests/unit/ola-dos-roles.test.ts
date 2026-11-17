// Fase 10 (Cristian, 14 nov: «sin tocar comisiones»): la rotación de closers cuenta al caller «también closer».
// Antes, guardarRotacion lo dejaba fuera: con 93 + 7 solo veía 93 y no dejaba guardar.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Perfil } from "@/lib/tipos";

const persona = (id: string, rol: Perfil["rol"], tambien_closer = false): Perfil => ({ id, nombre: id, email: `${id}@t`, rol, telefono: null, whatsapp: null, admin_activo: false, onboarding_completo: true, activo: true, tambien_closer });
let escrito: { id: string; v: Record<string, unknown> }[];

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, refresh: () => undefined }));
vi.mock("@/lib/memoria", async (orig) => ({ ...(await orig<object>()), olvidarTodo: () => undefined }));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<object>()), exigir: async () => ({ perfil: persona("ceo", "ceo"), proyecto: { id: "p1" } }) }));
vi.mock("@/lib/datos", () => {
  const consulta = () => {
    const c: Record<string, unknown> = {};
    let v: Record<string, unknown> | null = null;
    c.select = () => c;
    c.in = () => c;
    c.update = (x: Record<string, unknown>) => ((v = x), c);
    c.eq = (campo: string, valor: string) => (campo === "perfil_id" && v && escrito.push({ id: valor, v }), c);
    c.then = (r: (x: unknown) => unknown) => r({ data: [{ perfil_id: "closer-1", rotacion_pct: 93 }, { perfil_id: "caller-closer", rotacion_pct: 7 }], error: null });
    return c;
  };
  return {
    db: () => ({ from: consulta }),
    escribir: async (p: unknown) => p,
    equipo: async () => [persona("closer-1", "closer"), persona("caller-closer", "caller", true), persona("caller-1", "caller")],
  };
});
const { guardarRotacion } = await import("@/app/(panel)/admin/acciones");

describe("guardarRotacion con un caller «también closer»", () => {
  beforeEach(() => {
    escrito = [];
  });
  it("93 + 7 se guarda y el 7 % es del caller también closer", async () => {
    const r = await guardarRotacion({ "closer-1": 93, "caller-closer": 7 });
    expect(r).toBeUndefined(); // seguro() devuelve lo de la acción (nada) si no hay error
    expect(escrito.map((e) => [e.id, e.v.rotacion_pct])).toEqual([["closer-1", 93], ["caller-closer", 7]]);
  });
  it("un caller sin el interruptor no entra en la rotación", async () => {
    // caller-1 a 0: la suma sigue en 100, así que si el filtro esCloser se rompe, caller-1 se escribiría y la lista cambia
    const r = await guardarRotacion({ "closer-1": 100, "caller-1": 0 });
    expect(r).toBeUndefined();
    expect(escrito.map((e) => [e.id, e.v.rotacion_pct])).toEqual([["closer-1", 100], ["caller-closer", 0]]);
  });
});
