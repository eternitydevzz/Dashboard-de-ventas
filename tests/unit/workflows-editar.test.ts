// Workflows 4c (boceto del editor aprobado por Cristian el 7 nov 2026): editar el árbol de pasos y validarlo, sin base de datos.
import { describe, expect, it } from "vitest";
import { cambiarPaso, insertarPaso, mismoContenido, pasoNuevo, pasosValidos, quitarPaso, verPaso, type Ruta } from "@/lib/workflows-editar";
import type { Paso } from "@/lib/workflows";

const BASE: Paso[] = [
  { id: "e1", tipo: "esperar", segundos: 300 },
  {
    id: "r1",
    tipo: "rama",
    caminos: [{ condicion: { campo: "utm_source", operador: "igual", valor: "biblioteca" }, pasos: [{ id: "o1", tipo: "oportunidad_ghl", pipeline_id: "wym2Ue4VUqkhsFoQJ5PK", etapa_id: null }] }],
    si_no: [{ id: "o2", tipo: "oportunidad_ghl", pipeline_id: "zuQjPVJNbPpRlL0voy6d", etapa_id: null }],
  },
];

describe("rutas: llegar a un paso del árbol (también dentro de ramas)", () => {
  it("arriba, dentro de un camino y en «si no»", () => {
    expect(verPaso(BASE, [0])?.id).toBe("e1");
    expect(verPaso(BASE, [1, "c", 0, 0])?.id).toBe("o1");
    expect(verPaso(BASE, [1, "s", 0])?.id).toBe("o2");
    expect(verPaso(BASE, [9])).toBeNull();
  });
});

describe("insertar, cambiar y quitar (sin tocar el original)", () => {
  const nuevo: Paso = { id: "n", tipo: "esperar", segundos: 60 };
  it("insertar arriba en una posición", () => {
    const r = insertarPaso(BASE, [], 1, nuevo);
    expect(r.map((p) => p.id)).toEqual(["e1", "n", "r1"]);
    expect(BASE.map((p) => p.id)).toEqual(["e1", "r1"]);
  });
  it("insertar dentro de un camino y en «si no»", () => {
    const r = insertarPaso(BASE, [1, "c", 0], 1, nuevo);
    expect((verPaso(r, [1]) as Extract<Paso, { tipo: "rama" }>).caminos[0].pasos.map((p) => p.id)).toEqual(["o1", "n"]);
    const s = insertarPaso(BASE, [1, "s"], 0, nuevo);
    expect((verPaso(s, [1]) as Extract<Paso, { tipo: "rama" }>).si_no.map((p) => p.id)).toEqual(["n", "o2"]);
  });
  it("cambiar un paso de dentro", () => {
    const r = cambiarPaso(BASE, [1, "c", 0, 0], { id: "o1", tipo: "oportunidad_ghl", pipeline_id: "otro", etapa_id: null });
    expect(verPaso(r, [1, "c", 0, 0])).toMatchObject({ pipeline_id: "otro" });
    expect(verPaso(BASE, [1, "c", 0, 0])).toMatchObject({ pipeline_id: "wym2Ue4VUqkhsFoQJ5PK" });
  });
  it("quitar: un paso suelto o la rama entera", () => {
    expect(quitarPaso(BASE, [0]).map((p) => p.id)).toEqual(["r1"]);
    expect(quitarPaso(BASE, [1]).map((p) => p.id)).toEqual(["e1"]);
    expect((verPaso(quitarPaso(BASE, [1, "s", 0]), [1]) as Extract<Paso, { tipo: "rama" }>).si_no).toEqual([]);
  });
});

describe("pasoNuevo: cada tipo con valores por defecto y un id que no se repite", () => {
  it("los 7 tipos", () => {
    const ids = new Set<string>();
    for (const t of ["esperar", "contacto_ghl", "etiquetas_ghl", "oportunidad_ghl", "quitar_etiqueta_ghl", "mover_dashboard", "rama"] as const) {
      const p = pasoNuevo(t);
      expect(p.tipo).toBe(t);
      ids.add(p.id);
    }
    expect(ids.size).toBe(7);
    expect(pasoNuevo("esperar")).toMatchObject({ segundos: 300 });
    expect(pasoNuevo("rama")).toMatchObject({ caminos: [{ condicion: { campo: "utm_source", operador: "igual", valor: "" }, pasos: [] }], si_no: [] });
  });
});

describe("pasosValidos: lo que se guarda", () => {
  it("unos pasos buenos pasan igual", () => {
    expect(pasosValidos(BASE)).toEqual(BASE);
  });
  it("rechaza lo que no es una lista, un tipo desconocido o ids repetidos", () => {
    expect(() => pasosValidos("x")).toThrow(/lista/);
    expect(() => pasosValidos([{ id: "a", tipo: "email" }])).toThrow(/tipo/);
    expect(() => pasosValidos([{ id: "a", tipo: "esperar", segundos: 1 }, { id: "a", tipo: "esperar", segundos: 1 }])).toThrow(/repet/);
  });
  it("esperar: de 0 a 7 días", () => {
    expect(() => pasosValidos([{ id: "a", tipo: "esperar", segundos: -1 }])).toThrow(/Esperar/);
    expect(() => pasosValidos([{ id: "a", tipo: "esperar", segundos: 8 * 86400 }])).toThrow(/Esperar/);
  });
  it("oportunidad sin pipeline, rama sin campo o con un camino sin valor: no", () => {
    expect(() => pasosValidos([{ id: "a", tipo: "oportunidad_ghl", pipeline_id: "", etapa_id: null }])).toThrow(/pipeline/);
    expect(() => pasosValidos([{ id: "r", tipo: "rama", caminos: [{ condicion: { campo: "", operador: "igual", valor: "x" }, pasos: [] }], si_no: [] }])).toThrow(/campo/);
    expect(() => pasosValidos([{ id: "r", tipo: "rama", caminos: [{ condicion: { campo: "utm_source", operador: "igual", valor: " " }, pasos: [] }], si_no: [] }])).toThrow(/valor/);
    // «existe» no necesita valor
    expect(() => pasosValidos([{ id: "r", tipo: "rama", caminos: [{ condicion: { campo: "utm_source", operador: "existe" }, pasos: [] }], si_no: [] }])).not.toThrow();
  });
  it("los límites: 60 pasos y ramas de 3 niveles", () => {
    expect(() => pasosValidos(Array.from({ length: 61 }, (_, i) => ({ id: `e${i}`, tipo: "esperar", segundos: 1 })))).toThrow(/60/);
    const rama = (dentro: Paso[], id: string): Paso => ({ id, tipo: "rama", caminos: [{ condicion: { campo: "x", operador: "existe" }, pasos: dentro }], si_no: [] });
    expect(() => pasosValidos([rama([rama([rama([rama([], "r4")], "r3")], "r2")], "r1")])).toThrow(/3 niveles/);
  });
  it("limpia: etiquetas en minúsculas y sin vacías, textos recortados", () => {
    expect(pasosValidos([{ id: "t", tipo: "etiquetas_ghl", base: "  Biblioteca-Form ", fijas: [" Agenda Biblioteca", "", "agenda biblioteca"], campo_completo: " quiz_completed " }])).toEqual([
      { id: "t", tipo: "etiquetas_ghl", base: "Biblioteca-Form", fijas: ["agenda biblioteca"], campo_completo: "quiz_completed" },
    ]);
  });
});

describe("mismoContenido: comparar pasos sin que importe el orden de las claves (Postgres jsonb las reordena)", () => {
  it("mismo contenido con las claves en otro orden: iguales", () => {
    expect(mismoContenido([{ id: "e", tipo: "esperar", segundos: 1 }], [{ segundos: 1, tipo: "esperar", id: "e" }])).toBe(true);
    expect(mismoContenido({ a: { x: 1, y: [1, 2] } }, { a: { y: [1, 2], x: 1 } })).toBe(true);
  });
  it("otro valor u otro orden de pasos: distintos", () => {
    expect(mismoContenido([{ id: "e", segundos: 1 }], [{ id: "e", segundos: 2 }])).toBe(false);
    expect(mismoContenido([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "a" }])).toBe(false);
  });
});

export type _R = Ruta;
