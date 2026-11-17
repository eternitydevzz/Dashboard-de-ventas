// A3 y A4 (Jose, 17 nov 2026): la campana del CEO no cuenta las citas ya pasadas sin closer; en lo visible, «Latam» pasa
// a «USA» (el valor interno sigue siendo "latam"); y la agenda del MCP, para quien es caller y closer, como la pantalla.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MERCADOS, OPCIONES_FILTRO_MERCADO, mercadoValido } from "@/lib/mercado";

// Base falsa (como avisos-ceo.test.ts): se apuntan los filtros de cada consulta
type Op = [string, unknown[]];
let consultas: { tabla: string; ops: Op[] }[];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const ops: Op[] = [];
      consultas.push({ tabla, ops });
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "or", "gte", "lt", "order", "limit", "maybeSingle"]) q[m] = (...a: unknown[]) => (ops.push([m, a]), q);
      q.then = (r: (v: unknown) => unknown) => Promise.resolve(tabla === "citas" ? { count: 0, data: null, error: null } : { data: [], error: null }).then(r);
      return q;
    },
  }),
}));
const { avisosCeo } = await import("@/lib/avisos-ceo");

beforeEach(() => {
  consultas = [];
});

const leer = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), "utf8");

describe("A3: la campana no cuenta las citas pasadas sin closer", () => {
  it("la consulta de citas lleva gte(fecha, ahora)", async () => {
    await avisosCeo("p1");
    const ops = consultas.find((c) => c.tabla === "citas")!.ops;
    const gte = ops.find(([m, a]) => m === "gte" && a[0] === "fecha");
    expect(gte).toBeDefined();
    const cuando = Date.parse(String(gte![1][1]));
    expect(Number.isNaN(cuando)).toBe(false);
    expect(Math.abs(Date.now() - cuando)).toBeLessThan(60_000);
  });
});

describe("A4: «Latam» pasa a «USA» en lo visible", () => {
  it("MERCADOS y OPCIONES_FILTRO_MERCADO dicen USA para latam", () => {
    expect(MERCADOS.find((m) => m.v === "latam")?.t).toBe("USA");
    expect(OPCIONES_FILTRO_MERCADO.find((m) => m.v === "latam")?.t).toBe("USA");
    expect(MERCADOS.find((m) => m.v === "es")?.t).toBe("España");
  });

  it("el valor interno sigue siendo latam", () => {
    expect(mercadoValido("latam")).toBe("latam");
    expect(mercadoValido("es")).toBe("es");
  });

  const ARCHIVOS = [
    "src/lib/avisos-ceo.ts",
    "src/lib/mercado.ts",
    "src/components/mercado-equipo.tsx",
    "src/components/selector-mercado.tsx",
    "src/app/(panel)/admin/popups.tsx",
    "src/lib/mcp/lectura.ts",
    "src/lib/mcp/equipo.ts",
    "src/app/api/mcp/route.ts",
    "src/app/(panel)/equipo/acciones.ts",
    "src/app/(panel)/equipo/alta.tsx",
    "src/app/(panel)/equipo/cliente.tsx",
    "src/app/(panel)/guiones/editor.tsx",
  ];
  // Sin comentarios («// …» al final o en su línea, «{/* … */}» y líneas de «/* … */»). \b: «deLatam» es un nombre del código, no un texto
  const sinComentario = (l: string) => l.replace(/\{\/\*.*?\*\/\}/g, "").replace(/(^|\s)\/\/.*$/, "").replace(/^\s*\/?\*.*$/, "");
  it.each(ARCHIVOS)("%s no enseña «Latam» ni «LATAM»", (r) => {
    const malas = leer(r).split("\n").map(sinComentario).filter((l) => /\bLatam\b|LATAM/.test(l));
    expect(malas).toEqual([]);
  });
});

describe("agenda del MCP: quien es caller y closer, como la pantalla Agendas", () => {
  it("usa el modo «o» para el caller que también es closer", () => {
    const s = leer("src/lib/mcp/lectura.ts");
    expect(s).not.toContain('const mirar = perfil.rol === "caller";');
    expect(s).toContain('const doble = perfil.rol === "caller" && esCloser(perfil);');
    expect(s).toContain('const mirar = perfil.rol === "caller" && !esCloser(perfil);');
    expect(s).toContain("mirar || doble ? perfil.id : null");
    expect(s).toContain('doble ? "o" : "y"');
  });
});
