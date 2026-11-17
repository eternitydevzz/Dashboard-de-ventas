// Fase 8, zona C: colores de columna validados (S1-23), `campo` de asignarDesdeFicha (S2-20), buscador del CRM con
// mayúsculas (A4-12) y lo que solo se ve en pantalla (A2-09, A4-11, A4-16), comprobado en el código.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Consulta = { tabla: string; ops: string[] };
let consultas: Consulta[];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "or", "order", "limit", "update", "insert", "maybeSingle", "single"]) q[m] = () => (c.ops.push(m), q);
      // el lead existe (para llegar a la comprobación de asignarDesdeFicha); lo demás, vacío
      q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: tabla === "leads" && !c.ops.includes("update") ? { id: "l1" } : null, error: null, count: 0 }).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/memoria", () => ({ olvidarTodo: () => undefined, enMemoria: <T,>(_k: string, _ms: number, f: () => T) => f(), UN_MINUTO: 60_000 }));
const sesion = { perfil: { id: "dir", rol: "director", admin_activo: true }, proyecto: { id: "p1" } };
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => sesion }));
vi.mock("@/lib/pipelines", () => ({ exigirNivel: async () => ({ pipeline: { tipo: "normal" } }) }));
const { getSesion } = await import("@/lib/sesion");
vi.mocked(getSesion).mockResolvedValue(sesion as never);
const { crearEtapa, editarEtapa } = await import("@/app/(panel)/crm/acciones");
const { asignarDesdeFicha } = await import("@/app/(panel)/leads/acciones");

const escrituras = () => consultas.filter((c) => c.ops.includes("insert") || c.ops.includes("update"));
beforeEach(() => {
  consultas = [];
});

describe("S1-23 · el color de una columna es #rrggbb", () => {
  it.each(["red", "#fff", "#12345g", "#123456; x", "", "url(x)"])("«%s» no se guarda", async (color) => {
    expect(await crearEtapa("pl1", "Nueva", color)).toEqual({ error: expect.stringMatching(/color/i) });
    expect(await editarEtapa("e1", "Nueva", color)).toEqual({ error: expect.stringMatching(/color/i) });
    expect(escrituras()).toHaveLength(0);
  });
  it("un color bueno sí se guarda", async () => {
    expect(await crearEtapa("pl1", "Nueva", "#2F55d4")).toBeUndefined();
    expect(escrituras()).toHaveLength(1);
  });
});

describe("S2-20 · asignarDesdeFicha solo cambia caller_id o closer_id", () => {
  it("otro campo: error y no escribe", async () => {
    consultas = [];
    const r = await asignarDesdeFicha("l1", "estado_caller" as never, "");
    expect(r).toEqual({ error: "Campo no válido." });
    expect(escrituras()).toHaveLength(0);
  });
});

const leer = (f: string) => readFileSync(`src/app/(panel)/${f}`, "utf8");

describe("Pantallas (sin navegador, en el código)", () => {
  it("A2-09: el enlace de cada caller conserva columna y orden (usa enlaceFiltro)", () => {
    const src = leer("caller/page.tsx");
    expect(src).toContain("href={enlaceFiltro(filtro, c.id)}");
    expect(src).not.toContain("/caller?caller=${c.id}");
  });
  it("A4-11: el buscador de Agendas se aplica al escribir, a los 300 ms", () => {
    expect(leer("closer/llamadas/cliente.tsx")).toMatch(/setTimeout\(aplicar, 300\)/);
  });
  it("A4-16: «Mover a…» solo se esconde con ratón (en tablet táctil se ve)", () => {
    const src = leer("closer/llamadas/tablero-closers.tsx");
    expect(src).toContain("pointer-fine:hidden");
    expect(src).not.toContain("sm:hidden");
  });
});
