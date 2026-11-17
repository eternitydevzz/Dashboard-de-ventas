// S6-3 (auditoría): antes ola-cifras.test.ts leía reportes/page.tsx como texto. Ahora se abre la página con la base
// simulada y se mira lo que de verdad pre-rellena el reporte del caller y qué filtros manda a la base.
import { describe, expect, it, vi } from "vitest";

type Lectura = { tabla: string; ops: [string, unknown[]][] };
const lecturas: Lectura[] = [];
const cadena = (l: Lectura): object =>
  new Proxy(() => {}, {
    get: (_t, p) => (p === "then" ? (ok: (r: unknown) => void) => ok({ data: [], error: null, count: 2 }) : (...a: unknown[]) => (l.ops.push([String(p), a]), cadena(l))),
  });
const act = (lead_id: string, tipo: string, resultado: string | null) => ({ lead_id, tipo, resultado });
// Mismo caso que ola-cifras: A con 2 botones (1 llamada), B y C → 3 llamadas; 1 WhatsApp
const ACTS = [act("A", "cambio_etapa", "no_responde"), act("A", "llamada", "wsp_enviado"), act("A", "whatsapp", "wsp_enviado"), act("B", "cambio_etapa", "descartado"), act("C", "cita", "agendada")];

vi.mock("@/lib/datos", async (orig) => ({
  ...(await orig<object>()),
  db: () => ({ from: (tabla: string) => { const l = { tabla, ops: [] }; lecturas.push(l); return cadena(l); } }),
  equipo: async () => [],
  conBajas: async () => [],
  // A3b-04 / S2-14: cada tabla con sus filas. Citas agendadas: 3 filas de 2 leads → 2 (1 por lead). Reportes: ninguno.
  todas: async (f: (d: number, h: number) => unknown) => {
    f(0, 999);
    const tabla = lecturas.at(-1)!.tabla;
    return tabla === "actividades" ? ACTS : tabla === "citas" ? [{ lead_id: "X" }, { lead_id: "X" }, { lead_id: "Y" }] : [];
  },
}));
vi.mock("@/lib/permisos", async (orig) => ({
  ...(await orig<object>()),
  exigirPagina: async () => ({ perfil: { id: "caller-1", rol: "caller" }, proyecto: { id: "p1", zona_horaria: "America/New_York", preguntas_reporte: null } }),
}));
const { default: ReportesPage } = await import("@/app/(panel)/reportes/page");

// Busca en todo el árbol (también en props como `acciones`) el elemento del componente con ese nombre
function buscar(n: unknown, nombre: string): { props: Record<string, unknown> } | null {
  if (!n || typeof n !== "object") return null;
  if (Array.isArray(n)) return n.map((x) => buscar(x, nombre)).find(Boolean) ?? null;
  const e = n as { type?: { name?: string }; props?: Record<string, unknown> };
  if (e.type?.name === nombre) return e as { props: Record<string, unknown> };
  return Object.values(e.props ?? {}).map((x) => buscar(x, nombre)).find(Boolean) ?? null;
}

describe("Reportes «hoy» del caller", () => {
  it("pre-rellena las llamadas con llamadasHoyCola (3, igual que KPIs) y lee solo el proyecto abierto", async () => {
    const arbol = await ReportesPage({ searchParams: Promise.resolve({}) } as never);
    const nuevo = buscar(arbol, "NuevoReporte");
    expect(nuevo?.props.sugeridos).toEqual({ llamadas: 3, agendas: 2, whatsapps: 1, seguimientos: 0 });
    const deHoy = lecturas.filter((l) => ["actividades", "citas", "ventas"].includes(l.tabla));
    expect(deHoy.map((l) => l.tabla).sort()).toEqual(["actividades", "citas", "citas", "ventas"]);
    for (const l of deHoy) expect(l.ops, l.tabla).toContainEqual(["eq", ["proyecto_id", "p1"]]);
    // S2-14: la lista de reportes se lee por periodo (Mes por defecto), del proyecto abierto
    const rep = lecturas.find((l) => l.tabla === "reportes")!;
    expect(rep.ops).toContainEqual(["eq", ["proyecto_id", "p1"]]);
    expect(rep.ops.map(([op, a]) => `${op}:${a[0]}`)).toEqual(expect.arrayContaining(["gte:fecha", "lt:fecha"]));
  });
});
