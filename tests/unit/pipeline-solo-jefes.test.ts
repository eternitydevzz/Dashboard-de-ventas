// Cristian, 15 nov: «Todos los leads» solo para CEO y directores (marca pipelines.solo_jefes).
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
const { calcularNivel, nivelEnCrm } = await import("@/lib/pipelines");

const persona = (rol: "ceo" | "director" | "caller" | "closer", admin = false) => ({ id: rol, rol, admin_activo: admin }) as never;
const todos = { id: "todos", tipo: "normal" as const, solo_jefes: true };
const normal = { id: "bib", tipo: "normal" as const };

describe("pipeline solo para jefes", () => {
  it("caller y closer: sin acceso (también en el CRM, donde el caller vería «solo mirar» un pipeline normal)", () => {
    expect(calcularNivel(persona("caller"), todos, [])).toBe("sin_acceso");
    expect(nivelEnCrm(persona("caller"), todos, [])).toBe("sin_acceso");
    expect(nivelEnCrm(persona("closer"), todos, [])).toBe("sin_acceso");
  });
  it("CEO y directores (con o sin Administración): lo ven", () => {
    expect(nivelEnCrm(persona("ceo"), todos, [])).toBe("editar");
    expect(nivelEnCrm(persona("director", true), todos, [])).toBe("editar");
    expect(nivelEnCrm(persona("director"), todos, [])).toBe("ver");
  });
  it("un pipeline normal no cambia: el caller con «Sin acceso» de su rol lo sigue viendo para mirar", () => {
    expect(nivelEnCrm(persona("caller"), normal, [{ pipeline_id: "bib", rol: "caller", perfil_id: null, nivel: "sin_acceso" }])).toBe("ver");
  });
});
