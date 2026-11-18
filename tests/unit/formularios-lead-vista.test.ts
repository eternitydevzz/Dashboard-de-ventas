// Fase B (pendiente del 17 nov): la lista de formularios del lead (ficha y popup). Un envío sin respuestas ya dice
// abajo «no trae respuestas»: el resumen no repite «0 respuestas».
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormulariosLead } from "@/components/formularios-lead";
import type { EnvioFormulario } from "@/lib/formularios-lead";

const pintar = (envios: EnvioFormulario[]) => renderToStaticMarkup(createElement(FormulariosLead, { envios }));
const envio = (respuestas: EnvioFormulario["respuestas"], vaciado = false): EnvioFormulario => ({
  id: "e1",
  fecha: "15 nov, 10:00",
  entrada: "Landing VSL",
  respuestas,
  vaciado,
});

describe("FormulariosLead", () => {
  it("sin envíos → «No ha llegado ningún formulario»", () => {
    expect(pintar([])).toContain("No ha llegado ningún formulario");
  });

  it("envío con 2 respuestas → «2 respuestas» y sus preguntas", () => {
    const html = pintar([
      envio([
        { pregunta: "¿Cuánto inviertes?", respuesta: "Más de 5.000 €" },
        { pregunta: "Objetivo", respuesta: "Vender" },
      ]),
    ]);
    expect(html).toContain("2 respuestas");
    expect(html).toContain("¿Cuánto inviertes?");
    expect(html).toContain("Objetivo");
    expect(html).toContain("Landing VSL");
  });

  it("envío con 1 respuesta → «1 respuesta» (singular)", () => {
    const html = pintar([envio([{ pregunta: "Objetivo", respuesta: "Vender" }])]);
    expect(html).toContain("1 respuesta");
    expect(html).not.toContain("1 respuestas");
  });

  it("envío sin respuestas → no dice «0 respuestas», solo «no trae respuestas»", () => {
    const html = pintar([envio([])]);
    expect(html).not.toContain("0 respuestas");
    expect(html).toContain("no trae respuestas");
  });

  it("envío vaciado → «Contenido borrado» y sin número de respuestas", () => {
    const html = pintar([envio([], true)]);
    expect(html).toContain("Contenido borrado");
    expect(html).not.toMatch(/\d+ respuesta/);
  });
});
