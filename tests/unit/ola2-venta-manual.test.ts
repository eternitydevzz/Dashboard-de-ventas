// Ola 2 · carril H (Cristian, 14 nov): «Nueva venta» en Ventas, solo CEO y directores. Buscar o crear el lead y la venta
// con «Registrar venta» de siempre. Base simulada; sin nombres reales ("Lead A", "lead-a@ejemplo.test").
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

type Fila = Record<string, unknown>;
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let consultas: Consulta[];
let tablas: Record<string, Fila[]>;

// «%a\_b%» de ilike → expresión regular (sin mayúsculas)
const comoIlike = (patron: string) => new RegExp(`^${patron.replace(/\\([%_\\])|([%_])|([.*+?^${}()|[\]])/g, (_, esc, com, esp) => (esc ? `\\${esc}` : com === "%" ? ".*" : com === "_" ? "." : `\\${esp}`))}$`, "i");
function filtrar(filas: Fila[], ops: [string, unknown[]][]) {
  const r = filas.filter((f) =>
    ops.every(([o, a]) => {
      if (o === "eq") return f[a[0] as string] === a[1];
      if (o === "ilike") return comoIlike(String(a[1])).test(String(f[a[0] as string] ?? ""));
      if (o === "or")
        return String(a[0]).split(",").some((c) => {
          const [col, op, ...v] = c.split(".");
          return op === "ilike" && comoIlike(v.join(".")).test(String(f[col] ?? ""));
        });
      return true;
    })
  );
  const limite = ops.find(([o]) => o === "limit")?.[1][0] as number | undefined;
  return limite ? r.slice(0, limite) : r;
}
const base = () => ({
  from: (tabla: string) => {
    const c: Consulta = { tabla, ops: [] };
    consultas.push(c);
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "ilike", "in", "not", "or", "order", "range", "limit", "lt", "gte", "is", "insert", "update", "single", "maybeSingle"]) q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
    q.then = (r: (v: unknown) => unknown) => {
      const una = c.ops.some(([o]) => o === "single" || o === "maybeSingle");
      const insert = c.ops.find(([o]) => o === "insert");
      if (insert) {
        const fila = { id: "nuevo", creado_en: "2026-11-14T12:00:00Z", ...(insert[1][0] as Fila) };
        tablas[tabla] = [...(tablas[tabla] ?? []), fila];
        return Promise.resolve({ data: una ? { id: fila.id } : null, error: null }).then(r);
      }
      const filas = filtrar(tablas[tabla] ?? [], c.ops);
      return Promise.resolve({ data: una ? filas[0] ?? null : filas, error: null }).then(r);
    };
    return q;
  },
  rpc: async () => ({ data: null, error: null }),
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: base }));

let sesion: { perfil: Fila; proyecto: Fila };
vi.mock("@/lib/permisos", () => ({ exigirPagina: async () => sesion, exigirSeccion: async () => sesion }));
vi.mock("@/lib/datos", async (original) => ({
  ...(await original<typeof import("@/lib/datos")>()),
  equipo: async () => [
    { id: "closer-1", nombre: "Closer Uno", rol: "closer" },
    { id: "caller-1", nombre: "Caller Uno", rol: "caller" },
    { id: "jefe-1", nombre: "Director", rol: "director" },
  ],
  idsDePrueba: async () => new Set<string>(),
}));
vi.mock("@/lib/mercado-datos", () => ({ mercadosDelProyecto: async () => ({}), miMoneda: async () => "USD", miMercado: async () => null }));
vi.mock("@/lib/leads", async (original) => ({ ...(await original<typeof import("@/lib/leads")>()), primeraEtapa: async () => "etapa-1" }));

const { getSesion } = await import("@/lib/sesion");
const { default: VentasPage } = await import("@/app/(panel)/ventas/page");
const { NuevaVenta } = await import("@/app/(panel)/ventas/nueva-venta");
const { buscarLeadsVenta, crearLeadVenta } = await import("@/app/(panel)/ventas/acciones");

const como = (rol: string) => {
  sesion.perfil = { id: `${rol}-1`, nombre: rol, rol };
  vi.mocked(getSesion).mockResolvedValue(sesion as never);
};
const form = (campos: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
};
const lead = (id: string, extra: Fila = {}): Fila => ({ id, nombre: `Lead ${id}`, apellido: "", email: null, telefono: null, telefono_clave: "", proyecto_id: "p1", creado_en: "2026-11-01T10:00:00Z", ...extra });
const inserts = () => consultas.filter((c) => c.tabla === "leads" && c.ops.some(([o]) => o === "insert"));

// Busca en el árbol que devuelve la página (también en props como `acciones`) el elemento de un componente
function buscar(nodo: unknown, tipo: unknown): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(nodo)) return nodo.map((n) => buscar(n, tipo)).find(Boolean) ?? null;
  if (!isValidElement(nodo)) return null;
  const el = nodo as ReactElement<Record<string, unknown>>;
  if (el.type === tipo) return el;
  return Object.values(el.props).map((v) => buscar(v as ReactNode, tipo)).find(Boolean) ?? null;
}
const pagina = () => VentasPage({ searchParams: Promise.resolve({}) } as never);

beforeEach(() => {
  consultas = [];
  sesion = { perfil: {}, proyecto: { id: "p1", nombre: "Proyecto", zona_horaria: "Europe/Madrid", moneda: "USD" } };
  tablas = {
    ventas: [],
    pagos: [],
    productos: [{ id: "prod-1", proyecto_id: "p1", nombre: "Grupal", precio: 1997, activo: true, orden: 0 }],
    pipelines: [{ id: "web", proyecto_id: "p1", tipo: "normal", orden: 0 }],
    leads: [],
  };
});

describe("Venta manual · solo CEO y directores", () => {
  it("un closer o un caller no ven «Nueva venta»; un director y el CEO sí, con los productos del proyecto", async () => {
    for (const rol of ["closer", "caller"]) {
      como(rol);
      expect(buscar(await pagina(), NuevaVenta)).toBeNull();
    }
    for (const rol of ["director", "ceo"]) {
      como(rol);
      const boton = buscar(await pagina(), NuevaVenta);
      expect(boton).not.toBeNull();
      expect((boton!.props.productos as Fila[]).map((p) => p.id)).toEqual(["prod-1"]);
      expect((boton!.props.vendedores as Fila[]).map((p) => p.id)).toEqual(["closer-1", "caller-1"]);
    }
  });
  it("un no jefe no puede buscar ni crear leads desde aquí (la acción da error y no escribe)", async () => {
    tablas.leads = [lead("A")];
    for (const rol of ["closer", "caller"]) {
      como(rol);
      expect(await buscarLeadsVenta("Lead")).toHaveProperty("error");
      expect(await crearLeadVenta(form({ nombre: "Lead Nuevo", email: "nuevo@ejemplo.test" }))).toHaveProperty("error");
    }
    expect(inserts()).toHaveLength(0);
  });
});

describe("Venta manual · buscar el lead", () => {
  beforeEach(() => como("director"));
  it("solo devuelve leads del proyecto abierto y como mucho 10", async () => {
    tablas.leads = [
      ...Array.from({ length: 14 }, (_, i) => lead(`A${i}`)),
      lead("OTRO", { proyecto_id: "p2" }),
    ];
    const r = (await buscarLeadsVenta("lead")) as Fila[];
    expect(r).toHaveLength(10);
    expect(r.every((l) => String(l.id).startsWith("A"))).toBe(true);
    const q = consultas.find((c) => c.tabla === "leads")!;
    expect(q.ops).toContainEqual(["eq", ["proyecto_id", "p1"]]);
    expect(q.ops).toContainEqual(["limit", [10]]);
  });
  it("encuentra por email o teléfono, y con menos de 3 letras no busca", async () => {
    tablas.leads = [lead("A", { email: "lead-a@ejemplo.test" }), lead("B", { telefono: "+34 600 111 222" })];
    expect(((await buscarLeadsVenta("lead-a@")) as Fila[]).map((l) => l.id)).toEqual(["A"]);
    expect(((await buscarLeadsVenta("111 222")) as Fila[]).map((l) => l.id)).toEqual(["B"]);
    consultas = [];
    expect(await buscarLeadsVenta("le")).toEqual([]);
    expect(consultas).toHaveLength(0);
  });
});

describe("Venta manual · crear el lead", () => {
  beforeEach(() => como("director"));
  it("un email que ya existe (aunque cambien las mayúsculas) no crea duplicado: ofrece ese lead", async () => {
    tablas.leads = [lead("A", { email: "lead-a@ejemplo.test" })];
    const r = await crearLeadVenta(form({ nombre: "Lead A", email: "Lead-A@Ejemplo.test" }));
    expect(r).toMatchObject({ existente: { id: "A" } });
    expect(inserts()).toHaveLength(0);
  });
  it("un teléfono que ya existe (últimas 9 cifras, con otro formato) tampoco crea duplicado", async () => {
    tablas.leads = [lead("B", { telefono: "+34 600 111 222", telefono_clave: "600111222" })];
    const r = await crearLeadVenta(form({ nombre: "Lead B", telefono: "0034600111222" }));
    expect(r).toMatchObject({ existente: { id: "B" } });
    expect(inserts()).toHaveLength(0);
  });
  it("si no existe, lo crea como «Nuevo lead» del CRM (primer pipeline, origen manual) y lo devuelve para la venta", async () => {
    const r = await crearLeadVenta(form({ nombre: "Lead Nuevo", email: "nuevo@ejemplo.test" }));
    expect(r).toMatchObject({ lead: { id: "nuevo" } });
    expect(inserts()[0].ops.find(([o]) => o === "insert")![1][0]).toMatchObject({ proyecto_id: "p1", origen: "manual", pipeline_id: "web", etapa_id: "etapa-1", email: "nuevo@ejemplo.test" });
  });
  it("sin nombre o sin email ni teléfono, error y no crea nada", async () => {
    expect(await crearLeadVenta(form({ nombre: "Lead" }))).toHaveProperty("error");
    expect(await crearLeadVenta(form({ email: "x@ejemplo.test" }))).toHaveProperty("error");
    expect(inserts()).toHaveLength(0);
  });
});

describe("Venta manual · la venta es la de siempre", () => {
  it("la ventana usa el formulario «Registrar venta» (FormVenta) y la acción registrarVenta, sin lógica de venta propia", () => {
    const codigo = readFileSync("src/app/(panel)/ventas/nueva-venta.tsx", "utf8");
    expect(codigo).toMatch(/import \{[^}]*\bregistrarVenta\b[^}]*\} from "@\/app\/\(panel\)\/leads\/acciones"/);
    expect(codigo).toMatch(/import \{[^}]*\bFormVenta\b[^}]*\} from "@\/components\/acciones-lead"/);
    expect(codigo).toMatch(/registrarVenta\(lead\.id, fd\)/);
    expect(codigo).not.toMatch(/\.rpc\(|planDePagos|from\("ventas"\)/);
    expect(codigo).toContain("Venta registrada");
  });
});
