// Fase 3 (Cristian, 13 nov 2026): popups de Administración. A quién va cada uno, cuándo vuelve a salir y qué se guarda.
import { describe, expect, it } from "vitest";
import { enlaceSeguro, popupValido, quitarVistosEnSesion, toca, vaPara, CLAVE_SESION, type Popup } from "@/lib/popups";
import { textoEntrada, textosCambiados, TEXTOS_ENTRADA } from "@/lib/mensajes-entrada";

const ID = "11111111-1111-4111-8111-111111111111";
const OTRO = "22222222-2222-4222-8222-222222222222";
const p = (o: Partial<Popup>): Popup => ({
  id: "p1", titulo: "Hola", texto: "Texto", imagen: null, boton_texto: null, boton_enlace: null,
  roles: [], personas: [], mercados: [], frecuencia: "sesion", cada_horas: null, activo: true, lanzado_en: null, creado_en: "2026-11-01T00:00:00Z", ...o,
});

describe("a quién va", () => {
  const caller = { id: ID, rol: "caller" as const, mercado: "es" as const };
  it("a todos = los 4 roles, de los 2 mercados", () => expect(vaPara(p({ roles: ["ceo", "director", "closer", "caller"] }), caller)).toBe(true));
  it("por rol", () => {
    expect(vaPara(p({ roles: ["caller"] }), caller)).toBe(true);
    expect(vaPara(p({ roles: ["closer"] }), caller)).toBe(false);
  });
  it("rol y mercado se combinan: callers de España sí, callers de Latam no", () => {
    expect(vaPara(p({ roles: ["caller"], mercados: ["es"] }), caller)).toBe(true);
    expect(vaPara(p({ roles: ["caller"], mercados: ["latam"] }), caller)).toBe(false);
  });
  it("una persona elegida siempre, aunque no sea del rol ni del mercado", () => {
    expect(vaPara(p({ roles: ["closer"], mercados: ["latam"], personas: [ID] }), caller)).toBe(true);
    expect(vaPara(p({ personas: [OTRO] }), caller)).toBe(false);
  });
});

describe("cuándo sale", () => {
  const ahora = new Date("2026-11-13T12:00:00Z");
  const lunes = new Date("2026-11-08T23:00:00Z"); // lunes 9 a las 0:00 en Madrid
  it("apagado, nunca", () => expect(toca(p({ activo: false }), null, ahora, lunes)).toBe(false));
  it("1 vez por sesión: el servidor siempre lo da; el navegador quita los ya cerrados en la pestaña", () => {
    expect(toca(p({ frecuencia: "sesion" }), "2026-11-13T11:59:00Z", ahora, lunes)).toBe(true);
    const lista = [{ id: "a", frecuencia: "sesion" as const }, { id: "b", frecuencia: "sesion" as const }, { id: "c", frecuencia: "horas" as const }, { id: "d", frecuencia: null }];
    const vistos = new Set([CLAVE_SESION("a"), CLAVE_SESION("c")]);
    expect(quitarVistosEnSesion(lista, (k) => vistos.has(k)).map((x) => x.id)).toEqual(["b", "c", "d"]);
  });
  it("cada X horas: la primera vez, y cuando pasan X horas desde que lo cerró", () => {
    const cada3 = p({ frecuencia: "horas", cada_horas: 3 });
    expect(toca(cada3, null, ahora, lunes)).toBe(true);
    expect(toca(cada3, "2026-11-13T09:30:00Z", ahora, lunes)).toBe(false);
    expect(toca(cada3, "2026-11-13T09:00:00Z", ahora, lunes)).toBe(true);
  });
  it("1 vez a la semana: si no lo ha cerrado desde el lunes", () => {
    const semanal = p({ frecuencia: "semana" });
    expect(toca(semanal, null, ahora, lunes)).toBe(true);
    expect(toca(semanal, "2026-11-10T08:00:00Z", ahora, lunes)).toBe(false);
    expect(toca(semanal, "2026-11-08T22:00:00Z", ahora, lunes)).toBe(true); // domingo por la noche en Madrid
  });
  it("lanzar ahora: una vez desde que se lanza; relanzarlo lo vuelve a sacar", () => {
    expect(toca(p({ frecuencia: "ahora", lanzado_en: null }), null, ahora, lunes)).toBe(false);
    const lanzado = p({ frecuencia: "ahora", lanzado_en: "2026-11-13T10:00:00Z" });
    expect(toca(lanzado, null, ahora, lunes)).toBe(true);
    expect(toca(lanzado, "2026-11-13T10:05:00Z", ahora, lunes)).toBe(false);
    expect(toca(p({ frecuencia: "ahora", lanzado_en: "2026-11-13T11:00:00Z" }), "2026-11-13T10:05:00Z", ahora, lunes)).toBe(true);
  });
});

describe("qué se guarda", () => {
  const base = { titulo: " Hola ", texto: "Texto", roles: ["caller"], frecuencia: "sesion" };
  it("limpia y rellena", () => {
    expect(popupValido({ ...base, roles: ["caller", "caller", "jefe"], mercados: ["es", "x"], personas: [ID, "no"], boton_enlace: "/crm" })).toEqual({
      titulo: "Hola", texto: "Texto", imagen: null, boton_texto: "Ver más", boton_enlace: "/crm", roles: ["caller"], personas: [ID], mercados: ["es"], frecuencia: "sesion", cada_horas: null,
    });
  });
  it("sin destinatario, sin título o con frecuencia rara, no", () => {
    expect(() => popupValido({ ...base, roles: [] })).toThrow(/a quién/);
    expect(() => popupValido({ ...base, titulo: "  " })).toThrow(/título/);
    expect(() => popupValido({ ...base, frecuencia: "siempre" })).toThrow(/cuándo/);
  });
  it("horas de 1 a 720, enteras", () => {
    expect(popupValido({ ...base, frecuencia: "horas", cada_horas: "6" }).cada_horas).toBe(6);
    expect(() => popupValido({ ...base, frecuencia: "horas", cada_horas: 0 })).toThrow(/horas/);
    expect(() => popupValido({ ...base, frecuencia: "horas", cada_horas: 1.5 })).toThrow(/horas/);
  });
  it("imagen solo https; botón https o sección de la app", () => {
    expect(popupValido({ ...base, imagen: "https://x.test/a.png" }).imagen).toBe("https://x.test/a.png");
    expect(() => popupValido({ ...base, imagen: "http://x.test/a.png" })).toThrow(/https/);
    expect(() => popupValido({ ...base, imagen: "/a.png" })).toThrow(/https/);
    expect(() => popupValido({ ...base, boton_enlace: "javascript:alert(1)" })).toThrow(/https/);
    expect(() => popupValido({ ...base, boton_enlace: "//otro.test" })).toThrow(/https/);
  });
  it("enlaces de los avisos: uno raro se quita", () => {
    expect(enlaceSeguro("/closer/llamadas")).toBe("/closer/llamadas");
    expect(enlaceSeguro("javascript:alert(1)")).toBeNull();
    expect(enlaceSeguro(null)).toBeNull();
  });
});

describe("textos de la bienvenida", () => {
  it("sin cambiar, el de siempre con el nombre", () => expect(textoEntrada("ll150", {}, { nombre: "Ana" }).texto).toBe("Eres un ejemplo para todo el equipo, Ana. Gracias por tu esfuerzo de hoy."));
  it("cambiado, el nuevo; el reporte con sus números", () => {
    expect(textoEntrada("ag1", { ag1: { titulo: "¡Primera, {nombre}!", texto: "Bien" } }, { nombre: "Ana" })).toEqual({ titulo: "¡Primera, Ana!", texto: "Bien" });
    expect(textoEntrada("reporte", null, { dia: "12/11/2026", leads: 4, agendas: 2 })).toEqual({ titulo: "Ayer, 12/11/2026", texto: "Entraron 4 leads y se agendaron 2 citas." });
  });
  it("claves raras o textos vacíos se ignoran", () => expect(textosCambiados({ otra: { titulo: "a", texto: "b" }, v1: { titulo: "", texto: "b" } })).toEqual({}));
  it("están todos los hitos y el reporte", () => expect(Object.keys(TEXTOS_ENTRADA)).toHaveLength(14));
});
