import { describe, expect, it } from "vitest";
import { panelConDesenfoque, retrasoFila, retrasoPanel, textoConteo } from "@/components/animaciones/valores";

describe("retrasos de la entrada en cascada", () => {
  it("0,06 s entre paneles y tope en el panel 11", () => {
    expect(retrasoPanel(0)).toBe(0);
    expect(retrasoPanel(3, 90)).toBe(270);
    expect(retrasoPanel(10)).toBe(600);
    expect(retrasoPanel(30)).toBe(600);
  });
  it("filas: 0,2 s tras su panel, 22 ms entre filas y tope en la 15", () => {
    expect(retrasoFila(0, 0)).toBe(200);
    expect(retrasoFila(1, 2)).toBe(60 + 200 + 44);
    expect(retrasoFila(0, 14)).toBe(200 + 14 * 22);
    expect(retrasoFila(0, 99)).toBe(200 + 14 * 22);
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
