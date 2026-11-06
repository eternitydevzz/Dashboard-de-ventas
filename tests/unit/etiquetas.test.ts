// Arreglo de la fase 1 (Cristian, 6 nov 2026), visto en la prueba real con GHL: GHL guarda las etiquetas en
// minúsculas y la lectura de 60 s sumaba al lead la `-incompleto` vieja aunque ya tuviera `-completo`.
// Regla: las etiquetas se suman sin repetir (sin mirar mayúsculas) y un lead completo no vuelve a incompleto.
import { describe, expect, it } from "vitest";
import { unirEtiquetas } from "@/lib/etiquetas";

describe("unirEtiquetas", () => {
  it("suma sin repetir, sin mirar mayúsculas (se queda la que ya tenía)", () => {
    expect(unirEtiquetas(["recursos-ia", "Biblioteca-form-completo"], ["biblioteca-form-completo", "webinar1"])).toEqual(["recursos-ia", "Biblioteca-form-completo", "webinar1"]);
  });

  it("si tiene <base>-completo, fuera <base>-incompleto (venga de antes o de lo nuevo)", () => {
    // El caso real del 6 nov: el lead quedó con las dos
    expect(unirEtiquetas(["recursos-ia", "biblioteca-form-completo"], ["biblioteca-form-incompleto"])).toEqual(["recursos-ia", "biblioteca-form-completo"]);
    expect(unirEtiquetas(["biblioteca-form-incompleto"], ["biblioteca-form-completo"])).toEqual(["biblioteca-form-completo"]);
    expect(unirEtiquetas(["Recursos-IA", "Biblioteca-form-incompleto", "biblioteca-form-completo", "biblioteca-form-incompleto"], [])).toEqual(["Recursos-IA", "biblioteca-form-completo"]);
  });

  it("no toca otras etiquetas ni bases distintas", () => {
    expect(unirEtiquetas(["biblioteca-agenda-incompleto"], ["biblioteca-form-completo"])).toEqual(["biblioteca-agenda-incompleto", "biblioteca-form-completo"]);
    expect(unirEtiquetas(["form completado", "form no completado"], [])).toEqual(["form completado", "form no completado"]);
    expect(unirEtiquetas(null, ["  ", "a"])).toEqual(["a"]);
  });
});
