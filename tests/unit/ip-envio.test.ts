// Fase 8 (X7): la IP de los límites y la comparación de claves salen de un solo sitio (src/lib/ip-envio.ts).
// Mismo resultado que las copias que había en las rutas: primera IP de x-forwarded-for, o «local».
import { describe, expect, it } from "vitest";
import { igual, ipDe } from "@/lib/ip-envio";

describe("ipDe", () => {
  it("la primera IP de x-forwarded-for, sin espacios", () => {
    expect(ipDe(new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }))).toBe("203.0.113.7");
  });
  it("sin cabecera o vacía: «local»", () => {
    expect(ipDe(new Headers())).toBe("local");
    expect(ipDe(new Headers({ "x-forwarded-for": "" }))).toBe("local");
  });
});

describe("igual", () => {
  it("solo la misma clave da true", () => {
    expect(igual("secreto-1", "secreto-1")).toBe(true);
    expect(igual("secreto-1", "secreto-2")).toBe(false);
    expect(igual("corta", "mucho-mas-larga")).toBe(false);
  });
});
