// Panel de endpoints (plan GHL, punto 0, Cristian 7 nov 2026): lo que se calcula sin base de datos.
import { describe, expect, it } from "vitest";
import { datosLandingValidos, direccionCorta, haceCuanto, jsonEjemplo, estadoEntrada, leadsRecibidos } from "@/lib/entradas-panel";

describe("leadsRecibidos: singular y plural (visto en producción el 7 nov: «1 lead recibidos»)", () => {
  it("1 → singular", () => {
    expect(leadsRecibidos(1)).toEqual({ cifra: "1 lead", texto: "recibido" });
  });
  it("0 y varios → plural", () => {
    expect(leadsRecibidos(0)).toEqual({ cifra: "0 leads", texto: "recibidos" });
    expect(leadsRecibidos(22)).toEqual({ cifra: "22 leads", texto: "recibidos" });
  });
});

describe("datosLandingValidos: landing, formulario, desde dónde envía y archivo", () => {
  it("limpia espacios y deja en null lo vacío", () => {
    expect(datosLandingValidos({ landing: "  biblioteca ", formulario: "registro", envia_desde: "servidor", archivo: " api/signup.js " })).toEqual({
      landing: "biblioteca",
      formulario: "registro",
      envia_desde: "servidor",
      archivo: "api/signup.js",
    });
    expect(datosLandingValidos({ landing: "", formulario: "   ", envia_desde: "", archivo: "" })).toEqual({ landing: null, formulario: null, envia_desde: null, archivo: null });
  });
  it("«envía desde» solo acepta navegador o servidor; lo demás es «no lo sé» (null)", () => {
    expect(datosLandingValidos({ envia_desde: "navegador" }).envia_desde).toBe("navegador");
    expect(datosLandingValidos({ envia_desde: "otra cosa" }).envia_desde).toBeNull();
    expect(datosLandingValidos({}).envia_desde).toBeNull();
  });
  it("landing y formulario, como mucho 80 letras; archivo, 120", () => {
    const r = datosLandingValidos({ landing: "a".repeat(200), formulario: "b".repeat(200), archivo: "c".repeat(300) });
    expect(r.landing).toHaveLength(80);
    expect(r.formulario).toHaveLength(80);
    expect(r.archivo).toHaveLength(120);
  });
  it("lo que no es texto no rompe", () => {
    expect(datosLandingValidos({ landing: 5, formulario: null, envia_desde: true, archivo: {} } as never)).toEqual({ landing: null, formulario: null, envia_desde: null, archivo: null });
  });
});

describe("direccionCorta: la dirección se enseña cortada; se copia entera", () => {
  const clave = "7c1e" + "0".repeat(40) + "a90f";
  it("deja la base y los 4 primeros y 4 últimos de la clave", () => {
    expect(direccionCorta(`https://dashboard.eternity.llc/api/webhooks/entrada/${clave}`)).toBe("https://dashboard.eternity.llc/api/webhooks/entrada/7c1e…a90f");
  });
  it("una dirección rara se deja igual", () => {
    expect(direccionCorta("https://x.test/otra")).toBe("https://x.test/otra");
  });
});

describe("jsonEjemplo: el JSON v1 para el programador", () => {
  const j = jsonEjemplo({ landing: "codigomaestria", formulario: "agenda" });
  it("lleva template v1, su landing y su formulario", () => {
    expect(j).toMatchObject({ template: "v1", source: "codigomaestria", form: "agenda" });
  });
  it("trae los campos del JSON v1 del plan", () => {
    for (const k of ["step", "event_id", "submitted_at", "name", "first_name", "last_name", "email", "phone", "quiz", "quiz_completed", "quiz_answered", "quiz_score", "page_url", "referrer", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "fbclid", "gclid", "ttclid", "ip", "user_agent", "language", "timezone"])
      expect(j).toHaveProperty(k);
  });
  it("no lleva lo que sale respecto al webhook de GHL (tags, headers) ni ninguna clave", () => {
    expect(j).not.toHaveProperty("tags");
    expect(j).not.toHaveProperty("headers");
    expect(JSON.stringify(j)).not.toMatch(/[0-9a-f]{48}/);
  });
  it("sin landing ni formulario pone un ejemplo que se ve que hay que cambiar", () => {
    expect(jsonEjemplo({ landing: null, formulario: null })).toMatchObject({ source: "nombre-de-la-landing", form: "nombre-del-formulario" });
  });
});

describe("haceCuanto: cuándo llegó el último lead, en palabras", () => {
  const ahora = new Date("2026-11-07T13:00:00Z");
  it("minutos, horas y días", () => {
    expect(haceCuanto("2026-11-07T12:59:40Z", ahora)).toBe("hace un momento");
    expect(haceCuanto("2026-11-07T12:42:00Z", ahora)).toBe("hace 18 min");
    expect(haceCuanto("2026-11-07T08:00:00Z", ahora)).toBe("hace 5 h");
    expect(haceCuanto("2026-11-05T13:00:00Z", ahora)).toBe("hace 2 días");
    expect(haceCuanto("2026-11-06T12:00:00Z", ahora)).toBe("hace 1 día");
  });
  it("sin fecha, nada", () => {
    expect(haceCuanto(null, ahora)).toBeNull();
  });
});

describe("estadoEntrada: el estado en palabras", () => {
  it("apagada", () => {
    expect(estadoEntrada({ activa: false, ghl_activo: true, envios: 9, rojos: 0 })).toEqual({ tono: "off", texto: "Apagada: no recibe nada", ghl: null });
  });
  it("activa, con GHL y todo bien", () => {
    expect(estadoEntrada({ activa: true, ghl_activo: true, envios: 42, rojos: 0 })).toEqual({ tono: "ok", texto: "Recibiendo leads", ghl: "Todos llegaron a GHL" });
  });
  it("con alguno en rojo no dice «todos llegaron»", () => {
    expect(estadoEntrada({ activa: true, ghl_activo: true, envios: 6, rojos: 1 }).ghl).toBeNull();
  });
  it("activa sin GHL lo dice; sin envíos aún, espera el primero", () => {
    expect(estadoEntrada({ activa: true, ghl_activo: false, envios: 3, rojos: 0 }).ghl).toBe("No se manda a GHL");
    expect(estadoEntrada({ activa: true, ghl_activo: true, envios: 0, rojos: 0 })).toEqual({ tono: "ok", texto: "Esperando el primer lead", ghl: null });
  });
});
