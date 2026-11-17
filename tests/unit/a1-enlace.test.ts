// A1 (Cristian, 17 nov 2026): el enlace mágico solo se gasta al pulsar «Entrar». Antes lo gastaba cualquier GET
// (lector de correo, antivirus, vista previa o una segunda apertura) y la persona veía «Ese enlace ya se usó».
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const leer = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), "utf8");

class Redirigido extends Error {
  constructor(public a: string) {
    super(`redirect ${a}`);
  }
}
let usuario: string | null;
let otpError: { message: string } | null;
const verifyOtp = vi.fn(async () => ({ error: otpError }));
vi.mock("next/navigation", () => ({
  redirect: (a: string) => {
    throw new Redirigido(a);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    auth: { verifyOtp, getClaims: async () => ({ data: usuario ? { claims: { sub: usuario } } : null }) },
  }),
}));

const { default: Pagina } = await import("@/app/auth/confirm/page");
const { entrar } = await import("@/app/auth/confirm/acciones");

beforeEach(() => {
  usuario = null;
  otpError = null;
  verifyOtp.mockClear();
});

// La página o la acción terminan en una redirección (el «a dónde») o en la página con el botón (null)
async function adonde(f: () => Promise<unknown>) {
  try {
    await f();
    return null;
  } catch (e) {
    if (e instanceof Redirigido) return e.a;
    throw e;
  }
}
const abrir = (q: Record<string, string>) => adonde(() => Pagina({ searchParams: Promise.resolve(q) } as never));
const pulsar = (q: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(q)) f.set(k, v);
  return adonde(() => entrar(f));
};

describe("auth/confirm: abrir el enlace no lo gasta", () => {
  it("sin sesión enseña el botón y NO llama a verifyOtp (el lector de correo no lo gasta)", async () => {
    expect(await abrir({ token_hash: "t", type: "magiclink" })).toBeNull();
    expect(await abrir({ token_hash: "t", type: "magiclink" })).toBeNull(); // abrirlo 2 veces tampoco
    expect(verifyOtp).not.toHaveBeenCalled();
  });
  it("con sesión ya iniciada, entra directo sin gastar el enlace", async () => {
    usuario = "u1";
    expect(await abrir({ token_hash: "t", type: "magiclink" })).toBe("/entrando");
    expect(await abrir({ token_hash: "t", type: "magiclink", siguiente: "perfil" })).toBe("/entrando?siguiente=perfil");
    expect(verifyOtp).not.toHaveBeenCalled();
  });
  it("sin código o con otro tipo, al login con aviso", async () => {
    expect(await abrir({})).toBe("/login?error=enlace");
    expect(await abrir({ token_hash: "t", type: "recovery" })).toBe("/login?error=enlace");
  });
});

describe("auth/confirm: pulsar «Entrar» gasta el enlace", () => {
  it("otro tipo, código vacío o demasiado largo: al login sin llamar a verifyOtp", async () => {
    expect(await pulsar({ token_hash: "t", type: "signup" })).toBe("/login?error=enlace");
    expect(await pulsar({ token_hash: "", type: "magiclink" })).toBe("/login?error=enlace");
    expect(await pulsar({ token_hash: "x".repeat(501), type: "magiclink" })).toBe("/login?error=enlace");
    expect(verifyOtp).not.toHaveBeenCalled();
  });
  it("enlace bueno: se verifica una vez y lleva a /entrando (y a crear contraseña si se pide)", async () => {
    expect(await pulsar({ token_hash: "t", type: "magiclink" })).toBe("/entrando");
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "t", type: "magiclink" });
    expect(await pulsar({ token_hash: "t", type: "magiclink", siguiente: "perfil" })).toBe("/entrando?siguiente=perfil");
  });
  it("enlace usado o caducado: al login con aviso", async () => {
    otpError = { message: "expired" };
    expect(await pulsar({ token_hash: "t", type: "magiclink" })).toBe("/login?error=enlace");
  });
});

describe("login: el aviso del enlace", () => {
  it("dice que use el último email", () => {
    expect(leer("src/app/login/page.tsx")).toContain("Usa el último email que te llegó");
  });
});
