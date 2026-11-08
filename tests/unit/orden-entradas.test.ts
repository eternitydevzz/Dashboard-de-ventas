import { describe, expect, it } from "vitest";
import { reordenar } from "@/lib/orden-entradas";

describe("reordenar entradas", () => {
  const ids = ["a", "b", "c"];
  it("sube y baja intercambiando con la vecina", () => {
    expect(reordenar(ids, "b", "arriba")).toEqual(["b", "a", "c"]);
    expect(reordenar(ids, "b", "abajo")).toEqual(["a", "c", "b"]);
  });
  it("no deja mover fuera de rango", () => {
    expect(reordenar(ids, "a", "arriba")).toBeNull();
    expect(reordenar(ids, "c", "abajo")).toBeNull();
  });
  it("id que no está, o dirección rara, no mueve nada", () => {
    expect(reordenar(ids, "z", "arriba")).toBeNull();
    expect(reordenar(ids, "b", "lado" as never)).toBeNull();
    expect(reordenar([], "a", "abajo")).toBeNull();
  });
  it("no cambia la lista original", () => {
    reordenar(ids, "b", "arriba");
    expect(ids).toEqual(["a", "b", "c"]);
  });
});
