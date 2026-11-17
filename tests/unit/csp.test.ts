// Arreglo 36: la política de seguridad del navegador usa un nonce por petición para los scripts.
import { afterAll, describe, expect, it } from "vitest";
import { politicaCsp } from "@/lib/csp";

const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
afterAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = original;
});

describe("Política de seguridad (CSP) con nonce", () => {
  it("producción: scripts solo con el nonce (sin unsafe-inline ni unsafe-eval) y Supabase solo para conectar", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcd.supabase.co";
    const p = politicaCsp("ABC123", false);
    const script = p.match(/script-src[^;]*/)![0];
    expect(script).toBe("script-src 'self' 'nonce-ABC123' 'strict-dynamic'");
    expect(p).toContain("connect-src 'self' https://abcd.supabase.co;"); // sin wss: nada usa el tiempo real (17 nov)
    expect(p).not.toContain("wss:");
    expect(p).toContain("frame-ancestors 'none'");
    expect(p).toContain("upgrade-insecure-requests");
    expect(p).toContain("style-src 'self' 'unsafe-inline'"); // el nonce no cubre los atributos style="…"
  });
  it("desarrollo: añade unsafe-eval (lo pide React para depurar) y no fuerza https", () => {
    const p = politicaCsp("XYZ", true);
    expect(p).toMatch(/script-src 'self' 'nonce-XYZ' 'strict-dynamic' 'unsafe-eval'/);
    expect(p).not.toContain("upgrade-insecure-requests");
  });
});
