// D43 (13 nov): el «Exportar» de Agendas lleva el país del lead. Datos inventados; la base se simula.
import { describe, expect, it, vi } from "vitest";

const cita = { fecha: "2026-11-10T10:00:00Z", estado: "pendiente", closer_id: "c1", nota: null, canal: null, estrellas_caller: null, estrellas_closer: null };
const citas = [
  { ...cita, leads: { nombre: "Ana", apellido: "Prueba", email: "ana@ejemplo.test", telefono: "+34600000000", pais: "ES" } },
  { ...cita, leads: { nombre: "Luis", apellido: "Prueba", email: null, telefono: null, pais: null } },
];
vi.mock("@/lib/auth", () => ({ getSesion: async () => ({ perfil: { id: "j1", rol: "ceo" }, proyecto: { id: "p1", nombre: "Demo", zona_horaria: "Europe/Madrid" } }), esJefe: () => true }));
vi.mock("@/lib/permisos", () => ({ puedeSeccion: async () => true }));
vi.mock("@/lib/datos", () => ({ db: () => ({}), equipo: async () => [{ id: "c1", nombre: "Closer Uno" }], todas: async () => citas }));
vi.mock("@/lib/agendas-datos", () => ({ closersVisibles: () => ({ ids: ["c1"] }) }));
vi.mock("@/lib/canales-datos", () => ({ canalesDe: async () => [] }));

const { GET } = await import("@/app/(panel)/closer/llamadas/exportar/route");

describe("Exportar de Agendas", () => {
  it("añade la columna País con su nombre («Sin país» si no tiene)", async () => {
    const r = await GET({ nextUrl: new URL("https://x.test/closer/llamadas/exportar") } as never);
    const celdas = (f: string) => f.split(";").map((c) => c.replace(/^﻿?"|"$/g, ""));
    const [cabecera, ana, luis] = (await r.text()).split(/\r?\n/).map(celdas);
    const col = cabecera.indexOf("País");
    expect(col).toBeGreaterThan(-1);
    expect(ana[col]).toBe("España");
    expect(luis[col]).toBe("Sin país");
  });
});
