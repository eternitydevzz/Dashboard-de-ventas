// A2 (Cristian, 17 nov 2026): quien es caller y también closer (Facu) usa Agendas y el pipeline «Closers» como un
// closer y, además, ve las citas que agendó como caller. Las que agendó con OTRO closer: solo mirar (D1, Jose).
// Un caller que NO es closer sigue exactamente igual.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
const { nivelDefecto, calcularNivel } = await import("@/lib/pipelines");
const { closersVisibles } = await import("@/lib/agendas-datos");

const leer = (ruta: string) => readFileSync(new URL(`../../src/${ruta}`, import.meta.url), "utf8");
const persona = (id: string, rol: "ceo" | "director" | "caller" | "closer", tambien_closer = false) => ({ id, nombre: id, rol, tambien_closer, admin_activo: false, activo: true }) as never;
const facu = persona("facu", "caller", true);
const pepe = persona("pepe", "caller");
const gente = [facu, pepe, persona("ana", "closer"), persona("luis", "closer"), persona("jefe", "ceo")];
const closers = { id: "cl", tipo: "closers" as const };

describe("A2 · nivel del pipeline «Closers»", () => {
  it("por defecto: caller y closer, «Ver»; caller solo, «Sin acceso» (como hoy)", () => {
    expect(nivelDefecto("closers", "caller", true)).toBe("ver");
    expect(nivelDefecto("closers", "caller")).toBe("sin_acceso");
    expect(nivelDefecto("closers", "closer")).toBe("ver");
  });
  it("con filas por rol: a quien es closer le vale la fila de «closer», no la de «caller»", () => {
    const filas = [{ pipeline_id: "cl", rol: "caller", perfil_id: null, nivel: "sin_acceso" as const }];
    expect(calcularNivel(facu, closers, filas)).toBe("ver");
    expect(calcularNivel(pepe, closers, filas)).toBe("sin_acceso");
    expect(calcularNivel(facu, closers, [...filas, { pipeline_id: "cl", rol: "closer", perfil_id: null, nivel: "sin_acceso" as const }])).toBe("sin_acceso");
  });
  it("la fila de la persona sigue mandando", () => {
    expect(calcularNivel(facu, closers, [{ pipeline_id: "cl", rol: null, perfil_id: "facu", nivel: "sin_acceso" }])).toBe("sin_acceso");
  });
});

describe("A2 · qué closers ve cada uno en Agendas", () => {
  it("caller y closer: como un closer, solo él", () => {
    expect(closersVisibles(facu, gente, null).ids).toEqual(["facu"]);
  });
  it("caller solo: igual que hoy (todos los closers; la carga filtra lo que agendó)", () => {
    const r = closersVisibles(pepe, gente, null);
    expect(r.ids).toEqual(["facu", "ana", "luis"]);
    expect(r.closers.map((c) => c.id)).toEqual(["facu", "ana", "luis"]);
  });
});

describe("A2 · lo que exigía rol «closer» ahora acepta a quien es closer", () => {
  it.each(["app/(panel)/closer/acciones.ts", "app/(panel)/closer/llamadas/acciones-fathom.ts", "app/(panel)/closer/llamadas/exportar/route.ts", "app/(panel)/closer/reporte/route.ts"])("%s", (ruta) => {
    const f = leer(ruta);
    expect(f).not.toMatch(/rol !== "closer"\)/);
    expect(f).toMatch(/esCloser\(/);
  });
  it("Agendas: ya no pone a todo caller en «solo mirar»", () => {
    const f = leer("app/(panel)/closer/llamadas/page.tsx");
    expect(f).not.toContain(`mirar = perfil.rol === "caller";`);
    expect(f).toContain(`const doble = perfil.rol === "caller" && esCloser(perfil);`);
    expect(f).toContain(`const mirar = perfil.rol === "caller" && !esCloser(perfil);`);
  });
  it("las citas que agendó con otro closer: solo mirar (D1)", () => {
    expect(leer("app/(panel)/closer/llamadas/page.tsx")).toMatch(/soloMirarIds=/);
    expect(leer("app/(panel)/closer/llamadas/tablero-closers.tsx")).toMatch(/soloMirarIds\?: string\[\]/);
    expect(leer("lib/tablero-closers.ts")).toMatch(/modo: "y" \| "o" = "y"/);
  });
});
