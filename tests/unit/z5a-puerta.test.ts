// Fases 5-6, zona A · S4-10 (17 nov 2026): tests de la puerta de entrada. Si alguien rompe la lista de rutas públicas
// del proxy, el enlace mágico o el freno del login, esto falla.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let usuario: string | null;
let otpError: { message: string } | null;
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims: async () => ({ data: usuario ? { claims: { sub: usuario } } : null }) } }) }));
vi.mock("@/lib/supabase/server", () => ({
  COOKIE_SESION_CORTA: "eternity_sesion_corta",
  opcionesCookie: (o: unknown) => o,
  createSessionClient: async () => ({
    auth: {
      verifyOtp: async () => ({ error: otpError }),
      signInWithPassword: async () => ({ data: null, error: { message: "Invalid login" } }),
    },
  }),
}));
let bloqueadoSi = false;
const anotados: string[] = [];
vi.mock("@/lib/limite", () => ({
  bloqueado: async () => bloqueadoSi,
  anotar: async (c: string) => void anotados.push(c),
  dentroDelLimite: async () => true,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "5.5.5.5" }), cookies: async () => ({ set: vi.fn(), delete: vi.fn() }) }));
vi.mock("@/lib/datos", () => ({ db: vi.fn() }));
vi.mock("@/lib/acceso", () => ({ mandarEnlace: vi.fn() }));
vi.mock("@/lib/permisos", () => ({ rutaInicio: vi.fn() }));

const { proxy } = await import("@/proxy");
const { iniciarSesion } = await import("@/app/login/acciones");

beforeEach(() => {
  usuario = null;
  otpError = null;
  bloqueadoSi = false;
  anotados.length = 0;
});

const destino = (r: Response) => (r.headers.get("location") ? new URL(r.headers.get("location")!).pathname + new URL(r.headers.get("location")!).search : null);

describe("proxy: quién pasa sin sesión", () => {
  for (const ruta of ["/login", "/login?error=enlace", "/api/webhooks/entrada/abc", "/auth/confirm", "/api/ghl/leer/p1", "/api/avisos/diario/x", "/api/mcp"])
    it(`${ruta} pasa`, async () => expect(destino(await proxy(new NextRequest(`http://x${ruta}`)))).toBeNull());

  for (const ruta of ["/", "/crm", "/onboarding", "/api/grabaciones/1", "/api/mcp/otra", "/auth/confirmar", "/admin"])
    it(`${ruta} va a /login`, async () => expect(destino(await proxy(new NextRequest(`http://x${ruta}?a=1`)))).toBe("/login"));

  it("con sesión, una ruta privada pasa y lleva su CSP", async () => {
    usuario = "u1";
    const r = await proxy(new NextRequest("http://x/crm"));
    expect(destino(r)).toBeNull();
    expect(r.headers.get("Content-Security-Policy")).toBeTruthy();
  });
});

// El enlace mágico (/auth/confirm) se prueba en a1-enlace.test.ts (A1, 17 nov: página + acción, ya no una ruta GET)

describe("login: freno de contraseñas", () => {
  const fd = (email: string, password: string) => {
    const f = new FormData();
    f.set("email", email);
    f.set("password", password);
    return f;
  };
  it("contraseña mala: mensaje genérico y se anota el fallo por email y por conexión", async () => {
    expect(await iniciarSesion({ error: "" }, fd(" Ana@B.c ", "mala"))).toEqual({ error: "Email o contraseña incorrectos.", email: "ana@b.c" });
    expect(anotados.sort()).toEqual(["login:email:ana@b.c", "login:ip:5.5.5.5"]);
  });
  it("bloqueado: no se prueba la contraseña", async () => {
    bloqueadoSi = true;
    expect((await iniciarSesion({ error: "" }, fd("a@b.c", "x"))).error).toMatch(/Demasiados intentos/);
    expect(anotados).toEqual([]);
  });
});
