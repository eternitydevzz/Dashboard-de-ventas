import { describe, expect, it } from "vitest";
import { panelConDesenfoque, retrasoPanel, textoConteo } from "@/components/animaciones/valores";

describe("retrasos de la entrada en cascada", () => {
  // Cristian, 14 nov (noche): 30 ms entre paneles y tope en el 6.º (antes 60 ms y tope en el 11.º); las filas ya no se animan
  it("0,03 s entre paneles y tope en el panel 6", () => {
    expect(retrasoPanel(0)).toBe(0);
    expect(retrasoPanel(3, 90)).toBe(180);
    expect(retrasoPanel(5)).toBe(150);
    expect(retrasoPanel(30)).toBe(150);
  });
  it("desenfoque solo en los 12 primeros paneles", () => {
    expect(panelConDesenfoque(11)).toBe(true);
    expect(panelConDesenfoque(12)).toBe(false);
  });
});

describe("números que cuentan", () => {
  it("al terminar queda el texto original, sea cual sea el formato", () => {
    for (const t of ["1.234 $", "$1,234", "12,5 %", "—", "18 de 20", "1.234.567,89 €"]) expect(textoConteo(t, 1)).toBe(t);
  });
  it("empieza en el 80 % con el mismo formato", () => {
    expect(textoConteo("1.234 $", 0)).toBe("987 $");
    expect(textoConteo("$12,340", 0)).toBe("$9,872");
    expect(textoConteo("12,5 %", 0)).toBe("10,0 %");
    expect(textoConteo("45", 0)).toBe("36");
    expect(textoConteo("1.234.567,89 €", 0)).toBe("987.654,31 €");
  });
  it("sin cifra no toca nada", () => {
    expect(textoConteo("—", 0.3)).toBe("—");
  });
  it("a mitad está entre el 80 % y el valor", () => {
    const v = Number(textoConteo("100", 0.5));
    expect(v).toBeGreaterThan(80);
    expect(v).toBeLessThan(100);
  });
});
