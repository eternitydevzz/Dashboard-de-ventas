import { describe, expect, it } from "vitest";
import { opcionesCookie } from "@/lib/supabase/server";

// N4: casilla «Mantener la sesión iniciada»
describe("opcionesCookie", () => {
  const larga = { path: "/", sameSite: "lax" as const, maxAge: 400 * 24 * 60 * 60 };

  it("marcada: la cookie de Supabase dura lo que diga Supabase (400 días)", () => {
    expect(opcionesCookie(larga, false)).toEqual(larga);
  });

  it("desmarcada: cookie de sesión del navegador (sin Max-Age ni Expires)", () => {
    const o = opcionesCookie({ ...larga, expires: new Date() }, true);
    expect(o).toEqual({ path: "/", sameSite: "lax" });
    expect("maxAge" in o).toBe(false);
    expect("expires" in o).toBe(false);
  });

  it("desmarcada: borrar una cookie (maxAge 0) sigue borrándola", () => {
    expect(opcionesCookie({ path: "/", maxAge: 0 }, true)).toEqual({ path: "/", maxAge: 0 });
  });
});
