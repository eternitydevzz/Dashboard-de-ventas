import { describe, expect, it } from "vitest";
import { bloquesGuion, GUION_EJEMPLO, guionValido, rellenar, resumenMarcas } from "@/lib/guiones";

describe("guion de llamadas", () => {
  it("los de ejemplo son válidos y no cambian al limpiarlos", () => {
    for (const rol of ["caller", "closer"] as const) expect(guionValido(GUION_EJEMPLO[rol])).toEqual(GUION_EJEMPLO[rol]);
  });
  it("limpia lo que llega: recorta, quita vacíos, pone ids y rechaza sin pasos", () => {
    const g = guionValido({
      pasos: [{ titulo: "  Saludo  ", texto: "Hola", checklist: ["a", "", 3, "b"], pistas: "no es lista" }, { titulo: "", texto: "sin título" }],
      objeciones: [{ objecion: "Caro", respuesta: "" }, { objecion: "Tiempo", respuesta: "Corto" }],
    });
    expect(g).toEqual({
      pasos: [{ id: "p1", titulo: "Saludo", texto: "Hola", checklist: ["a", "b"], pistas: [] }],
      objeciones: [{ id: "o1", objecion: "Tiempo", respuesta: "Corto" }],
    });
    expect(guionValido({ pasos: [] })).toBeNull();
    expect(guionValido("nada")).toBeNull();
  });
  it("cuenta lo marcado solo con lo que existe", () => {
    const r = resumenMarcas(GUION_EJEMPLO.caller, { p1: [0, 1, 1, 9], p2: [0], zz: [0] });
    expect(r).toEqual({ hechos: 3, total: 19 });
  });
  it("parte el texto en bloques y dice qué es cada línea", () => {
    const b = bloquesGuion(`Paso 1\n"¿Ana?"\nSi hay silencio 2 segundos: "¿Ana?"\n\n\nAna: "Sí… ¿quién es?"\n(Silencio. Esperas.)\n• Sí → "Perfecto."\nSi dice que sí:\nTexto suelto`);
    expect(b).toEqual([
      [{ tipo: "titulo", texto: "Paso 1" }, { tipo: "frase", texto: '"¿Ana?"' }, { tipo: "si", etiqueta: "Si hay silencio 2 segundos", texto: '"¿Ana?"' }],
      [{ tipo: "lead", etiqueta: "Ana", texto: '"Sí… ¿quién es?"' }, { tipo: "nota", texto: "Silencio. Esperas." }, { tipo: "punto", texto: 'Sí → "Perfecto."' }, { tipo: "si", etiqueta: "Si dice que sí", texto: "" }, { tipo: "frase", texto: "Texto suelto" }],
    ]);
    for (const p of GUION_EJEMPLO.caller.pasos) expect(bloquesGuion(p.texto).flat().length).toBeGreaterThan(0);
  });
  it("rellena {nombre} y deja lo que no conoce", () => {
    expect(rellenar("Hola {nombre}, soy {tu nombre} y {otro}", { nombre: "Ana", "tu nombre": "Tomás" })).toBe("Hola Ana, soy Tomás y {otro}");
  });
});
