// Cristian, 14 nov (noche: «fíjate que no haga flasheos raros»): al volver a KPIs → Leads el mapa salía con un recuadro
// gris 24-64 ms (medido con Playwright). El dibujo se calcula una vez por pestaña y las siguientes visitas lo reutilizan.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as mapa from "@/components/mapa-paises";

const pintar = () => renderToStaticMarkup(createElement(mapa.MapaPaises, { paises: [{ pais: "ES", n: 3 }] }));

describe("mapa de países sin parpadeo", () => {
  it("la primera vez, recuadro de carga; tras cargar el dibujo una vez, sale ya dibujado", async () => {
    expect(pintar()).toContain("animate-pulse");
    const formas = await mapa.cargarFormas();
    expect(formas.length).toBeGreaterThan(100);
    const html = pintar();
    expect(html).not.toContain("animate-pulse");
    expect(html).toContain("<svg");
    expect(await mapa.cargarFormas()).toBe(formas); // no se vuelve a calcular
  });
});
