// Plan GHL, punto 3 (Cristian, 7 nov 2026): el dashboard entiende el JSON v1 del template de landings y guarda la IP de
// la persona en el seguimiento del lead. Sin base de datos.
import { describe, expect, it } from "vitest";
import { interpretar } from "@/lib/entrada";
import { jsonEjemplo } from "@/lib/entradas-panel";
import { ipDelEnvio } from "@/lib/ip-envio";

describe("interpretar: el JSON v1 (el mismo ejemplo que copia el panel)", () => {
  const v1 = { ...jsonEjemplo({ landing: "codigomaestria", formulario: "agenda" }), referrer: "https://google.com", utm_source: "youtube", utm_campaign: "nov" };
  const r = interpretar(v1);
  it("nombre, apellido, email y teléfono", () => {
    expect(r.lead).toMatchObject({ nombre: "Ana", apellido: "Prueba", email: "ana@ejemplo.com", telefono: "+15550100000" });
  });
  it("las respuestas salen del objeto quiz; los campos de control del quiz no son respuestas", () => {
    expect(r.lead.respuestas).toEqual([
      { pregunta: "Pregunta 1", respuesta: "respuesta 1" },
      { pregunta: "Pregunta 2", respuesta: "respuesta 2" },
    ]);
    expect(r.quiz_score).toBe(10);
  });
  it("la landing es la fuente y el seguimiento lleva los UTM, la página y de dónde viene (sin vacíos)", () => {
    expect(r.fuente).toBe("codigomaestria");
    expect(r.seguimiento).toEqual({ utm_source: "youtube", utm_campaign: "nov", page_url: "https://ejemplo.com/landing", referrer: "https://google.com" });
  });
  it("todo lo demás se guarda tal cual en datos (template, form, step, event_id…)", () => {
    expect(r.datos).toMatchObject({ template: "v1", form: "agenda", step: "completo", event_id: "id-unico-de-este-envio", language: "es", timezone: "America/New_York" });
  });
});

describe("ipDelEnvio: qué IP se guarda", () => {
  it("si la landing manda `ip` válida (servidor), esa", () => {
    expect(ipDelEnvio({ cuerpo: { ip: " 203.0.113.7 " }, cabecera: "198.51.100.1", enviaDesde: "servidor" })).toBe("203.0.113.7");
    expect(ipDelEnvio({ cuerpo: { ip: "2001:db8::1" }, cabecera: null, enviaDesde: null })).toBe("2001:db8::1");
  });
  it("una `ip` que no es una IP se ignora", () => {
    expect(ipDelEnvio({ cuerpo: { ip: "<script>" }, cabecera: "198.51.100.1", enviaDesde: "servidor" })).toBeNull();
    expect(ipDelEnvio({ cuerpo: { ip: "999.1.1.1" }, cabecera: null, enviaDesde: "navegador" })).toBeNull();
  });
  it("desde el navegador sin `ip`: la de la petición (la primera de x-forwarded-for)", () => {
    expect(ipDelEnvio({ cuerpo: {}, cabecera: "198.51.100.1, 10.0.0.2", enviaDesde: "navegador" })).toBe("198.51.100.1");
  });
  it("desde un servidor o «no lo sé», sin `ip`: ninguna (la de la petición sería la del servidor)", () => {
    expect(ipDelEnvio({ cuerpo: {}, cabecera: "198.51.100.1", enviaDesde: "servidor" })).toBeNull();
    expect(ipDelEnvio({ cuerpo: {}, cabecera: "198.51.100.1", enviaDesde: null })).toBeNull();
  });
  it("desde un workflow de GHL: ninguna, aunque venga `ip` o cabecera (serían las de GHL)", () => {
    expect(ipDelEnvio({ cuerpo: { ip: "203.0.113.7" }, cabecera: "198.51.100.1", enviaDesde: "ghl" })).toBeNull();
    expect(ipDelEnvio({ cuerpo: {}, cabecera: "198.51.100.1", enviaDesde: "ghl" })).toBeNull();
  });
});
