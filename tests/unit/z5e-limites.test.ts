// S7-4 (auditoría): los límites de ritmo de /api/webhooks/entrada y /api/mcp no tenían test. El contador de verdad
// (ventana deslizante en la base) ya se prueba en integracion/seguridad.test.ts; aquí, que cada ruta lo pida con su
// cifra (300/min, 30 fallos en 15 min, 120/min) y que corte con el código que toca. Si alguien cambia 300 por 3000000, falla.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let dentro: boolean[]; // lo que contesta cada llamada a dentroDelLimite, en orden (después, true)
const limite = { dentroDelLimite: vi.fn(async (..._a: unknown[]) => dentro.shift() ?? true), bloqueado: vi.fn(async (..._a: unknown[]) => false), anotar: vi.fn(async (..._a: unknown[]) => undefined) };
vi.mock("@/lib/limite", () => limite);
// La base no encuentra ninguna Entrada (token desconocido)
vi.mock("@/lib/supabase/admin", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: null, error: null });
  return { createAdminClient: () => ({ from: () => q }) };
});
vi.mock("@/lib/mcp/clave", async (o) => ({ ...(await o<object>()), perfilDeClave: async (c: string) => (c === "buena" ? "u1" : null) }));

const { POST: entrada } = await import("@/app/api/webhooks/entrada/[token]/route");
const { POST: mcp } = await import("@/app/api/mcp/route");

const TOKEN = "a".repeat(48);
const IP = "203.0.113.7";
const aEntrada = (cabeceras: Record<string, string> = {}) =>
  entrada(new NextRequest(`http://localhost/api/webhooks/entrada/${TOKEN}`, { method: "POST", body: "{}", headers: { "content-type": "application/json", "x-forwarded-for": IP, ...cabeceras } }), { params: Promise.resolve({ token: TOKEN }) } as never);
const aMcp = (clave: string) => mcp(new Request("http://localhost/api/mcp", { method: "POST", body: "{}", headers: { "content-type": "application/json", "x-forwarded-for": IP, authorization: `Bearer ${clave}` } }));

beforeEach(() => {
  dentro = [];
  vi.clearAllMocks();
});

describe("/api/webhooks/entrada", () => {
  it("más de 500 KB: 413 sin gastar cupo", async () => {
    expect((await aEntrada({ "content-length": "500001" })).status).toBe(413);
    expect(limite.dentroDelLimite).not.toHaveBeenCalled();
  });
  it("300 por minuto por Entrada: al pasarse, 429", async () => {
    dentro = [false];
    expect((await aEntrada()).status).toBe(429);
    expect(limite.dentroDelLimite.mock.calls).toEqual([[`entrada:${TOKEN}`, 300, 60_000]]);
  });
  it("token que no existe: 404 y cuenta un fallo por IP; a los 30 fallos en 15 min, 429", async () => {
    expect((await aEntrada()).status).toBe(404);
    expect(limite.dentroDelLimite.mock.calls[1]).toEqual([`entrada-fallo:${IP}`, 30, 15 * 60_000]);
    dentro = [true, false];
    expect((await aEntrada()).status).toBe(429);
  });
});

describe("/api/mcp", () => {
  it("clave mala: 401 y se anota el fallo; con 30 fallos en 15 min, 429 antes de mirar la clave", async () => {
    expect((await aMcp("mala")).status).toBe(401);
    expect(limite.bloqueado.mock.calls).toEqual([[`mcp-fallo:${IP}`, 30, 15 * 60_000]]);
    expect(limite.anotar.mock.calls).toEqual([[`mcp-fallo:${IP}`]]);
    limite.bloqueado.mockResolvedValueOnce(true);
    expect((await aMcp("buena")).status).toBe(429);
  });
  it("120 peticiones por minuto por persona: al pasarse, 429", async () => {
    dentro = [false];
    expect((await aMcp("buena")).status).toBe(429);
    expect(limite.dentroDelLimite.mock.calls).toEqual([["mcp:u1", 120, 60_000]]);
  });
});
