// Plan GHL, fase 1 (Cristian, 6 nov 2026): los envíos de un lead a una Entrada se juntan en UN envío a GHL
// (contacto, campos con su id, UTM, etiqueta final y oportunidad). Sin base de datos ni internet.
import { describe, expect, it } from "vitest";
import { armarEnvioGhl, estaCompleto, etiquetasApp, juntarEnvios, type ConfigGhl } from "@/lib/entrada-ghl";

// Los dos pasos reales de la Biblioteca (api/signup.js): registro y, después, el cuestionario
const REGISTRO = {
  name: "ana maria prueba lopez",
  email: "ana.prueba@ejemplo.test",
  phone: "+584220000000",
  first_name: "ana",
  step: "registro",
  utm_source: "facebook",
  utm_campaign: "biblio-nov",
  source: "recursos",
  tags: ["recursos-ia"],
};
const CUESTIONARIO = {
  name: "ana maria prueba lopez",
  email: "ana.prueba@ejemplo.test",
  phone: "+584220000000",
  first_name: "ana",
  step: "cuestionario",
  quiz: { situacion: "Tengo una agencia", experiencia_ia: "Ya automatizo cosas", inicio: "Ya mismo" },
  quiz_completed: true,
  quiz_inicio: "Ya mismo",
  utm_source: "", // un vacío no borra lo que llegó antes
  source: "recursos",
};
const CONFIG: ConfigGhl = {
  campos: {
    "quiz.situacion": "EsY9HSZfP5L1FT6h4nX2",
    "quiz.experiencia_ia": "aURzYuU0eAGE5rzVBwVa",
    quiz_inicio: "lORdzKid69t1PAN2ylEH",
    utm_source: "BPs2vrG7eqH7D3d5zJEf",
    utm_campaign: "q5wycj0YpQt8SVlLxXbQ",
  },
  pipelineId: "dE7go9T3Mi2zbIT4sGME",
  etapaId: "9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d",
  etiquetaBase: "Biblioteca-form",
  campoCompleto: "quiz_completed",
};

describe("juntarEnvios", () => {
  it("lo que llega después completa lo de antes; un vacío no borra; los objetos se juntan", () => {
    const j = juntarEnvios([REGISTRO, CUESTIONARIO, { quiz: { objetivo_90_dias: "USA" } }]);
    expect(j.utm_source).toBe("facebook");
    expect(j.utm_campaign).toBe("biblio-nov");
    expect(j.step).toBe("cuestionario");
    expect(j.quiz).toEqual({ situacion: "Tengo una agencia", experiencia_ia: "Ya automatizo cosas", inicio: "Ya mismo", objetivo_90_dias: "USA" });
  });
  it("sin envíos, un objeto vacío", () => {
    expect(juntarEnvios([])).toEqual({});
  });
});

describe("estaCompleto", () => {
  it("completo si algún envío trae el campo a true (texto o booleano)", () => {
    expect(estaCompleto([REGISTRO], "quiz_completed")).toBe(false);
    expect(estaCompleto([REGISTRO, CUESTIONARIO], "quiz_completed")).toBe(true);
    expect(estaCompleto([{ quiz_completed: "TRUE" }], "quiz_completed")).toBe(true);
    // nunca vuelve atrás: un envío posterior con false no lo deja incompleto
    expect(estaCompleto([CUESTIONARIO, { quiz_completed: false }], "quiz_completed")).toBe(true);
  });
  it("sin campo configurado, nunca completo", () => {
    expect(estaCompleto([CUESTIONARIO], "")).toBe(false);
  });
});

describe("armarEnvioGhl", () => {
  it("solo el registro: datos, UTM, etiqueta -incompleto y oportunidad", () => {
    const e = armarEnvioGhl([REGISTRO], CONFIG);
    expect(e.contacto).toEqual({ firstName: "ana", lastName: "maria prueba lopez", email: "ana.prueba@ejemplo.test", phone: "+584220000000", source: "recursos" });
    expect(e.customFields).toEqual([
      { id: "BPs2vrG7eqH7D3d5zJEf", field_value: "facebook" },
      { id: "q5wycj0YpQt8SVlLxXbQ", field_value: "biblio-nov" },
    ]);
    expect(e.etiqueta).toBe("biblioteca-form-incompleto");
    expect(e.quitar).toBeNull();
    expect(e.completo).toBe(false);
    expect(e.oportunidad).toEqual({ pipelineId: "dE7go9T3Mi2zbIT4sGME", etapaId: "9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d", nombre: "ana maria prueba lopez" });
  });

  it("registro + cuestionario: un solo envío completo, con las respuestas y quitando -incompleto", () => {
    const e = armarEnvioGhl([REGISTRO, CUESTIONARIO], CONFIG);
    expect(e.completo).toBe(true);
    expect(e.etiqueta).toBe("biblioteca-form-completo");
    expect(e.quitar).toBe("biblioteca-form-incompleto");
    expect(e.customFields).toEqual([
      { id: "EsY9HSZfP5L1FT6h4nX2", field_value: "Tengo una agencia" },
      { id: "aURzYuU0eAGE5rzVBwVa", field_value: "Ya automatizo cosas" },
      { id: "lORdzKid69t1PAN2ylEH", field_value: "Ya mismo" },
      { id: "BPs2vrG7eqH7D3d5zJEf", field_value: "facebook" },
      { id: "q5wycj0YpQt8SVlLxXbQ", field_value: "biblio-nov" },
    ]);
  });

  it("la etiqueta va en minúsculas, como la guarda GHL (prueba real del 6 nov)", () => {
    const e = armarEnvioGhl([REGISTRO, CUESTIONARIO], { ...CONFIG, etiquetaBase: " Biblioteca-Form " });
    expect(e.etiqueta).toBe("biblioteca-form-completo");
    expect(e.quitar).toBe("biblioteca-form-incompleto");
  });

  it("nunca manda `tags` en el contacto (el upsert de GHL borraría todas las etiquetas)", () => {
    const e = armarEnvioGhl([REGISTRO, CUESTIONARIO], CONFIG);
    expect(e.contacto).not.toHaveProperty("tags");
  });

  it("sin etiqueta base ni pipeline: ni etiqueta ni oportunidad; campos sin id o vacíos fuera", () => {
    const e = armarEnvioGhl([REGISTRO], { ...CONFIG, etiquetaBase: " ", pipelineId: null, campos: { utm_source: "", "quiz.situacion": "X1", lista: "X2" } });
    expect(e.etiqueta).toBeNull();
    expect(e.quitar).toBeNull();
    expect(e.oportunidad).toBeNull();
    expect(e.customFields).toEqual([]);
  });

  it("listas y números van como texto; sin nombre, la oportunidad se llama por el email", () => {
    const e = armarEnvioGhl([{ email: "x@y.test", intereses: ["IA", "Ventas"], edad: 30 }], { ...CONFIG, campos: { intereses: "I1", edad: "E1" } });
    expect(e.customFields).toEqual([
      { id: "I1", field_value: "IA, Ventas" },
      { id: "E1", field_value: "30" },
    ]);
    expect(e.contacto).toEqual({ email: "x@y.test" });
    expect(e.oportunidad?.nombre).toBe("x@y.test");
  });
});

describe("etiquetasApp", () => {
  it("añade la final y quita la contraria, sin repetir (sin mirar mayúsculas)", () => {
    expect(etiquetasApp(["recursos-ia", "Biblioteca-form-incompleto"], { etiqueta: "biblioteca-form-completo", quitar: "biblioteca-form-incompleto" })).toEqual(["recursos-ia", "biblioteca-form-completo"]);
    expect(etiquetasApp(["Biblioteca-form-completo"], { etiqueta: "biblioteca-form-completo", quitar: null })).toEqual(["biblioteca-form-completo"]);
    expect(etiquetasApp(null, { etiqueta: null, quitar: null })).toEqual([]);
  });
});
