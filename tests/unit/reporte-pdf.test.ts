import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generarPdf, limpiar } from "@/lib/reporte-pdf";

describe("reporte en PDF", () => {
  it("acentos, ñ y € se escriben; los caracteres que no admite la fuente no lo rompen", async () => {
    expect(limpiar("Año 4★ → ok")).toBe("Año 4* ? ok");
    // Porcentajes como en España (V2-12): el espacio duro pasa tal cual, no sale «?»
    expect(limpiar("66,7\u00a0%")).toBe("66,7\u00a0%");
    const bytes = await generarPdf("Agendas · Maestría", "Todos los closers · Este año", [
      { titulo: "Dinero", filas: [["Facturación", "1.997 €"], ["Cash collected", "$500"]] },
      { titulo: "Por closer", tabla: { cabecera: ["Closer", "Agend.", "Cerr."], filas: [["Ana Núñez", "10", "3"], ["José 😀", "4", "1"]] } },
    ]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Agendas · Maestría");
  });
  it("muchas filas pasan a otra página", async () => {
    const filas = Array.from({ length: 80 }, (_, i) => [`Fila ${i}`, String(i)] as [string, string]);
    const doc = await PDFDocument.load(await generarPdf("T", "S", [{ titulo: "Mucho", filas }]));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
