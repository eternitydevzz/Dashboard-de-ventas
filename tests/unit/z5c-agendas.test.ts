// Fases 5-6 zona C (Cristian, 17 nov 2026): S1-14 (Exportar de Agendas con los filtros de la pantalla y su zona)
// y X5 (listas cortadas sin avisar en Agendas). Datos inventados; la base se simula.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const leer = (ruta: string) => readFileSync(new URL(`../../src/${ruta}`, import.meta.url), "utf8");

const lead = (nombre: string, utm: string | null) => ({ nombre, apellido: "Prueba", email: null, telefono: null, pais: "ES", seguimiento: utm ? { utm_source: utm } : null });
const citas = [
  { fecha: "2026-11-10T15:00:00Z", estado: "pendiente", closer_id: "c1", nota: null, canal: null, estrellas_caller: null, estrellas_closer: null, leads: lead("Ana", "facebook") },
  { fecha: "2026-11-10T16:00:00Z", estado: "cerrada", closer_id: "c1", nota: null, canal: null, estrellas_caller: null, estrellas_closer: null, leads: lead("Luis", "facebook") },
  { fecha: "2026-11-10T17:00:00Z", estado: "pendiente", closer_id: "c1", nota: null, canal: null, estrellas_caller: null, estrellas_closer: null, leads: lead("Eva", null) },
];
const sesion = { perfil: { id: "j1", rol: "ceo", zona_horaria: null as string | null }, proyecto: { id: "p1", nombre: "Demo", zona_horaria: "Europe/Madrid" } };
const visibles = vi.fn((_p: unknown, g: { id: string }[]) => ({ ids: g.map((x) => x.id) }));
vi.mock("@/lib/auth", () => ({ getSesion: async () => sesion, esJefe: (p: { rol: string }) => p.rol === "ceo" }));
vi.mock("@/lib/permisos", () => ({ puedeSeccion: async () => true }));
vi.mock("@/lib/datos", () => ({ db: () => ({}), equipo: async () => [{ id: "c1", nombre: "Closer España" }, { id: "c2", nombre: "Closer Latam" }], todas: async () => citas }));
vi.mock("@/lib/mercado-datos", () => ({ mercadosDelProyecto: async () => ({ c1: "es", c2: "latam" }) }));
vi.mock("@/lib/agendas-datos", () => ({ closersVisibles: visibles }));
vi.mock("@/lib/canales-datos", () => ({ canalesDe: async () => [] }));

const { GET } = await import("@/app/(panel)/closer/llamadas/exportar/route");

async function exportar(qs: string) {
  const r = await GET({ nextUrl: new URL(`https://x.test/closer/llamadas/exportar?${qs}`) } as never);
  const celdas = (f: string) => f.split(";").map((c) => c.replace(/^﻿?"|"$/g, ""));
  const [cabecera, ...filas] = (await r.text()).split(/\r?\n/).filter(Boolean).map(celdas);
  return filas.map((f) => Object.fromEntries(cabecera.map((c, i) => [c, f[i]])));
}

describe("S1-14 · Exportar de Agendas aplica los filtros de la pantalla", () => {
  it("UTM: solo las citas de esa UTM («Sin UTM» también vale)", async () => {
    expect((await exportar("utm=facebook")).map((f) => f.Lead)).toEqual(["Ana Prueba", "Luis Prueba"]);
    expect((await exportar("utm=Sin+UTM")).map((f) => f.Lead)).toEqual(["Eva Prueba"]);
  });

  it("Estado: «abiertas» y un estado concreto", async () => {
    expect((await exportar("estado=abiertas")).map((f) => f.Lead)).toEqual(["Ana Prueba", "Eva Prueba"]);
    expect((await exportar("estado=cerrada")).map((f) => f.Lead)).toEqual(["Luis Prueba"]);
  });

  it("Mercado: solo los closers de ese mercado (como la pantalla)", async () => {
    visibles.mockClear();
    await exportar("mercado=es");
    expect(visibles.mock.calls[0][1].map((g) => g.id)).toEqual(["c1"]);
  });

  it("Hora: en la zona de quien mira (un closer en Colombia ve 10:00, no 16:00 de Madrid)", async () => {
    sesion.perfil = { id: "c1", rol: "closer", zona_horaria: "America/Bogota" };
    try {
      expect((await exportar("estado=pendiente"))[0].Fecha).toMatch(/10:00/);
    } finally {
      sesion.perfil = { id: "j1", rol: "ceo", zona_horaria: null };
    }
  });
});

describe("X5 · Lista de Agendas cortada a 300", () => {
  it("avisa cuando hay más de las que se ven", () => {
    const f = leer("app/(panel)/closer/llamadas/page.tsx");
    expect(f).toMatch(/filtradas\.length > 300 &&/);
  });
});

describe("X4 · closer/acciones.ts: lecturas que fallan no se enseñan como «no hay»", () => {
  const f = leer("app/(panel)/closer/acciones.ts");
  const trozo = (desde: string) => f.slice(f.indexOf(desde), f.indexOf("\n}\n", f.indexOf(desde)));
  it.each([
    ["cambiarCloserCita (¿choca la hora?)", "export async function cambiarCloserCita", /data: choca, error/],
    ["buscarLeadsParaLlamada (lista)", "export async function buscarLeadsParaLlamada", /\{ data, error \} = await consulta/],
    ["importarCitas (closers)", "export async function importarCitas", /error: errClosers/],
    ["sincronizarGhl (¿GHL conectado?)", "export async function sincronizarGhl", /data: p, error/],
    ["unirCitaSinLead (¿ya existe la cita?)", "export async function unirCitaSinLead", /data: ya, error/],
  ])("%s mira el error", (_n, desde, patron) => {
    expect(trozo(desde)).toMatch(patron);
  });
});
