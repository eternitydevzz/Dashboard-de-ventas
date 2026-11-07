// C2 (plan Callers, 7 nov; ampliado en 7c.1): cabeceras Nombre · País · Prioridad · Entró que ordenan en el servidor
// sobre todos los leads del caller (antes del corte de 300). Primer clic = A→Z; en «Entró», los más recientes arriba.
import { describe, expect, it } from "vitest";
import { ordenarCola, leerOrden } from "@/lib/cola";

const L = [
  { id: "1", nombre: "Óscar", apellido: "Ruiz", pais: "MX", creado_en: "2026-11-05T10:00:00Z", puntos: 30 },
  { id: "2", nombre: "ana", apellido: "Gil", pais: "ES", creado_en: "2026-11-07T10:00:00Z", puntos: 80 },
  { id: "3", nombre: "Bea", apellido: "", pais: "AR", creado_en: "2026-11-01T10:00:00Z", puntos: 50 },
  { id: "4", nombre: "Carla", apellido: "Paz", pais: "ES", creado_en: "2026-11-06T10:00:00Z", puntos: 75 },
];
const ids = (x: { id: string }[]) => x.map((l) => l.id).join(",");

describe("C2 · orden de la cola", () => {
  it("sin orden elegido, deja el de siempre", () => expect(ids(ordenarCola(L, null))).toBe("1,2,3,4"));
  it("Nombre A→Z sin mayúsculas ni tildes que estorben, y Z→A", () => {
    expect(ids(ordenarCola(L, { campo: "nombre", dir: 1 }))).toBe("2,3,4,1");
    expect(ids(ordenarCola(L, { campo: "nombre", dir: -1 }))).toBe("1,4,3,2");
  });
  it("País por su nombre en español (Argentina, España, México)", () => {
    expect(ids(ordenarCola(L, { campo: "pais", dir: 1 }))).toBe("3,2,4,1");
  });
  it("Prioridad: primero las A (y dentro, más puntos), al revés las C", () => {
    expect(ids(ordenarCola(L, { campo: "prio", dir: 1 }))).toBe("2,4,3,1");
    expect(ids(ordenarCola(L, { campo: "prio", dir: -1 }))).toBe("1,3,4,2");
  });
  it("Entró: primer clic, los más recientes arriba", () => {
    expect(ids(ordenarCola(L, { campo: "entro", dir: 1 }))).toBe("2,4,1,3");
    expect(ids(ordenarCola(L, { campo: "entro", dir: -1 }))).toBe("3,1,4,2");
  });
  it("no cambia la lista que recibe", () => {
    const copia = [...L];
    ordenarCola(L, { campo: "nombre", dir: 1 });
    expect(L).toEqual(copia);
  });
  it("lee el orden de la dirección y descarta lo que no conoce", () => {
    expect(leerOrden("prio", "desc")).toEqual({ campo: "prio", dir: -1 });
    expect(leerOrden("entro", undefined)).toEqual({ campo: "entro", dir: 1 });
    expect(leerOrden("hack", "asc")).toBeNull();
    expect(leerOrden(undefined, "asc")).toBeNull();
  });
});
