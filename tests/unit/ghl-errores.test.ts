// Cristian, 8 nov: el error de GHL entero también en las lecturas (solo `message`, máx. 200, sin tokens).
import { describe, expect, it } from "vitest";
import { contactoGhl } from "@/lib/ghl";

const lee = (status: number, cuerpo: unknown) => contactoGhl({ token: "t", contactId: "c1", fetchImpl: (async () => new Response(JSON.stringify(cuerpo), { status })) as unknown as typeof fetch });

describe("errores de lectura de GHL", () => {
  it("400 con message: lo añade", async () => {
    await expect(lee(400, { message: "x" })).rejects.toThrow("GHL respondió 400: x");
  });
  it("lista de mensajes: los une", async () => {
    await expect(lee(400, { message: ["a", "b"] })).rejects.toThrow("GHL respondió 400: a; b.");
  });
  it("sin message: como antes", async () => {
    await expect(lee(400, { otro: "secreto" })).rejects.toThrow(/^GHL respondió 400\.$/);
  });
  it("tapa Bearer y pit-", async () => {
    const e = await lee(400, { message: "mal Bearer abc.def y pit-1234-abcd" }).catch((x: Error) => x.message);
    expect(e).toBe("GHL respondió 400: mal *** y ***.");
  });
  it("corta a 200 caracteres", async () => {
    const e = await lee(400, { message: "a".repeat(500) }).catch((x: Error) => x.message);
    expect(e).toBe(`GHL respondió 400: ${"a".repeat(200)}.`);
  });
});
