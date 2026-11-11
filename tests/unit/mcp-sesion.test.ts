// MCP, Fase 2 (11 nov 2026): la huella de la clave y la sesión del MCP (que getSesion devuelve dentro de una petición del MCP)
import { describe, expect, it, vi } from "vitest";
import type { Sesion } from "@/lib/sesion";
import { huellaClave } from "@/lib/mcp/clave";
import { conSesionMcp, sesionMcp } from "@/lib/mcp/sesion-mcp";

// El setup simula @/lib/sesion para todos los tests: aquí se usa el de verdad
const { getSesion } = await vi.importActual<typeof import("@/lib/sesion")>("@/lib/sesion");

const sesion = (id: string) => ({ perfil: { id }, proyectos: [], proyecto: { id: `p-${id}` } }) as unknown as Sesion;

describe("MCP: clave y sesión", () => {
  it("la huella es SHA-256 en hex", () => {
    const h = huellaClave("abc");
    expect(h).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(h).toHaveLength(64);
  });

  it("dentro del MCP, getSesion devuelve la sesión de la clave; fuera, no hay sesión del MCP", async () => {
    const s = sesion("a");
    expect(sesionMcp()).toBeUndefined();
    await conSesionMcp(s, async () => {
      expect(await getSesion()).toBe(s);
    });
    expect(sesionMcp()).toBeUndefined();
  });

  it("dos peticiones a la vez no se mezclan", async () => {
    const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const leidas = await Promise.all([
      conSesionMcp(sesion("a"), async () => (await espera(20), (await getSesion()).perfil.id)),
      conSesionMcp(sesion("b"), async () => (await espera(5), (await getSesion()).perfil.id)),
    ]);
    expect(leidas).toEqual(["a", "b"]);
  });
});
