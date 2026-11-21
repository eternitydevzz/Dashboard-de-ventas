// 21 nov 2026 (auditoría skew): una pestaña abierta antes de un despliegue llama a una acción que ya no existe y Next
// lanza UnrecognizedActionError, con un mensaje en inglés. exigirOk lo cambia por uno que diga qué hacer.
import { describe, expect, it } from "vitest";
import { exigirOk } from "@/lib/resultado-cliente";

class UnrecognizedActionError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "UnrecognizedActionError";
  }
}

describe("exigirOk con una versión vieja de la app", () => {
  it("cambia el error de acción no encontrada por el aviso de recargar", async () => {
    await expect(exigirOk(Promise.reject(new UnrecognizedActionError('Server Action "40d5" was not found on the server.')))).rejects.toThrow("Hay una versión nueva de la app: recarga la página (F5) y repite lo último.");
  });

  it("deja pasar los demás errores tal cual", async () => {
    await expect(exigirOk(Promise.reject(new Error("Sin red")))).rejects.toThrow("Sin red");
    await expect(exigirOk(Promise.resolve({ error: "Lead no encontrado." }))).rejects.toThrow("Lead no encontrado.");
  });

  it("devuelve el resultado si sale bien", async () => {
    await expect(exigirOk(Promise.resolve({ id: "1" }))).resolves.toEqual({ id: "1" });
  });
});
