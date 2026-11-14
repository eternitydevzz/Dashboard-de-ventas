// Ola 2 · V1 (Cristian, 14 nov: «mejorar la velocidad como sea»): Agendas sin precargas y con menos lecturas a la base.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const desde: string[] = []; // cada db().from(tabla), en orden
const filas: Record<string, unknown[]> = {};
vi.mock("@/lib/datos", () => {
  const tabla = (nombre: string) => {
    desde.push(nombre);
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "or", "order"]) c[m] = () => c;
    c.range = async () => ({ data: filas[nombre] ?? [], error: null });
    c.maybeSingle = async () => ({ data: (filas[nombre] ?? [])[0] ?? null, error: null });
    c.then = (ok: (r: unknown) => unknown) => ok({ data: filas[nombre] ?? [], error: null });
    return c;
  };
  return {
    db: () => ({ from: tabla }),
    todas: (q: (a: number, b: number) => PromiseLike<{ data: unknown[] | null }>) => q(0, 999).then((r) => r.data ?? []),
    conBajas: async (activos: unknown[]) => activos,
  };
});
const { cargarCitasVentas, etapasCloser } = await import("@/lib/tablero-closers");

const etapa = (id: string, orden: number) => ({ id, pipeline_id: "pc", nombre: id, orden, color: null, columna_cita: null, pipelines: { id: "pc" } });

beforeEach(() => {
  desde.length = 0;
  for (const k of Object.keys(filas)) delete filas[k];
});

describe("Agendas: ningún enlace precarga la página (eran 49 peticiones _rsc al abrir)", () => {
  const archivos = ["llamadas/page.tsx", "llamadas/grabaciones.tsx", "llamadas/cualificacion.tsx", "llamadas/revision-ia.tsx", "pestanas.tsx"];
  it.each(archivos)("%s: cada <Link> lleva prefetch={false}", (archivo) => {
    const src = readFileSync(join(process.cwd(), "src/app/(panel)/closer", archivo), "utf8");
    const links = src.match(/<Link\b[^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l).toContain("prefetch={false}");
  });
});

describe("etapasCloser: una sola lectura", () => {
  it("devuelve las mismas columnas, en orden, con 1 db().from en vez de 2", async () => {
    filas.pipelines = [{ id: "pc" }];
    filas.etapas = [etapa("a", 0), etapa("b", 1)];
    const { etapas } = await etapasCloser("p");
    expect(etapas.map((e) => e.id)).toEqual(["a", "b"]);
    expect(desde).toEqual(["etapas"]);
  });
  it("sin pipeline de closers: sin columnas", async () => {
    expect((await etapasCloser("p")).etapas).toEqual([]);
  });
});

describe("cargarCitasVentas: las ventas solo cuando se enseñan", () => {
  const cita = { id: "1", lead_id: "l1", closer_id: "luis", fecha: "2026-11-14T15:00:00Z", estado: "pendiente", leads: null };
  const venta = { id: "v1", lead_id: "l1", vendedor_id: "luis", facturacion: 1000, cash_collected: 300, pagos: [{ importe: 200 }] };
  beforeEach(() => {
    filas.citas = [cita];
    filas.ventas = [venta];
  });
  it("por defecto, como antes: citas y ventas con lo pendiente", async () => {
    const r = await cargarCitasVentas("p", ["luis"], null);
    expect(r.citas).toEqual([cita]);
    expect(r.ventas).toEqual([{ ...venta, pendiente: 500 }]);
    expect(desde).toEqual(["citas", "ventas"]);
  });
  it("sin ventas (pestaña Agendas): mismas citas y 1 db().from menos", async () => {
    const r = await cargarCitasVentas("p", ["luis"], null, false, [], false);
    expect(r.citas).toEqual([cita]);
    expect(r.ventas).toEqual([]);
    expect(desde).toEqual(["citas"]);
  });
});
