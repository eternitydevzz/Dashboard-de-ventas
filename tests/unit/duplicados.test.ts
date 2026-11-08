import { describe, expect, it } from "vitest";
import { agruparDuplicados } from "@/lib/duplicados";

const l = (id: string, telefono: string | null, creado_en: string) => ({ id, telefono, creado_en });

describe("agruparDuplicados (D2)", () => {
  it("junta por las últimas 9 cifras, sin importar el prefijo ni los separadores", () => {
    const g = agruparDuplicados([l("a", "+34 600-11-22-33", "2026-01-01"), l("b", "600112233", "2026-02-01"), l("c", "611000000", "2026-01-05")]);
    expect(g).toHaveLength(1);
    expect(g[0].leads.map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("el más antiguo va primero (es el que se queda) aunque llegue el último", () => {
    const g = agruparDuplicados([l("nuevo", "600112233", "2026-03-01"), l("viejo", "34600112233", "2026-01-01"), l("medio", "600112233", "2026-02-01")]);
    expect(g[0].leads.map((x) => x.id)).toEqual(["viejo", "medio", "nuevo"]);
  });
  it("ignora teléfonos vacíos o con menos de 6 cifras y los que no se repiten", () => {
    expect(agruparDuplicados([l("a", null, "2026-01-01"), l("b", "", "2026-01-02"), l("c", "12345", "2026-01-03"), l("d", "12345", "2026-01-04"), l("e", "600112233", "2026-01-05")])).toEqual([]);
  });
});
