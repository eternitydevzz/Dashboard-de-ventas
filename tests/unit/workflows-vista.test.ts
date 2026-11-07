// Workflows 4b (boceto glass aprobado por Cristian el 7 nov 2026): los textos del lienzo y del historial, sin base de datos.
import { describe, expect, it } from "vitest";
import { condicionTexto, describirPaso, disparadorTexto, duracionTexto, estadoEjecucion, pasosDelRegistro, type Nombres } from "@/lib/workflows-vista";

const NOMBRES: Nombres = {
  entradas: { "e-1": "Web · Biblioteca registro" },
  pipelinesGhl: { dE7go9T3Mi2zbIT4sGME: { nombre: "1. Biblioteca Recursos", etapas: { "9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d": "Registrados" } } },
  pipelinesDashboard: { "p-1": { nombre: "0. Agendas General", etapas: { "et-1": "Form" } } },
};

describe("duracionTexto", () => {
  it("segundos, minutos y horas en palabras", () => {
    expect(duracionTexto(45)).toBe("45 segundos");
    expect(duracionTexto(60)).toBe("1 minuto");
    expect(duracionTexto(300)).toBe("5 minutos");
    expect(duracionTexto(90)).toBe("1 min 30 s");
    expect(duracionTexto(3600)).toBe("1 hora");
    expect(duracionTexto(5400)).toBe("1 h 30 min");
  });
});

describe("describirPaso: lo que dice cada caja del lienzo", () => {
  it("esperar", () => {
    expect(describirPaso({ id: "e", tipo: "esperar", segundos: 300 }, NOMBRES)).toMatchObject({ clave: "Esperar", titulo: "5 minutos", icono: "reloj" });
  });
  it("contacto: cuántos campos (singular y plural)", () => {
    expect(describirPaso({ id: "c", tipo: "contacto_ghl", campos: { a: "1", b: "2" } }, NOMBRES)).toMatchObject({ clave: "GHL · Contacto", titulo: "Crear o actualizar", detalle: "2 campos", icono: "persona" });
    expect(describirPaso({ id: "c", tipo: "contacto_ghl", campos: { a: "1" } }, NOMBRES).detalle).toBe("1 campo");
    expect(describirPaso({ id: "c", tipo: "contacto_ghl", campos: {} }, NOMBRES).detalle).toBe("Solo nombre, email y teléfono");
  });
  it("etiquetas: la final en minúsculas y las fijas", () => {
    expect(describirPaso({ id: "t", tipo: "etiquetas_ghl", base: "Biblioteca-form", fijas: ["biblioteca recursos"], campo_completo: "quiz_completed" }, NOMBRES)).toMatchObject({
      clave: "GHL · Etiquetas",
      titulo: "biblioteca-form-completo",
      detalle: "o -incompleto · + biblioteca recursos",
      icono: "etiqueta",
    });
    expect(describirPaso({ id: "t", tipo: "etiquetas_ghl", base: null, fijas: ["a", "b"], campo_completo: "" }, NOMBRES)).toMatchObject({ titulo: "a, b", detalle: null });
  });
  it("oportunidad: nombre del pipeline y su columna (o la primera); si no se conoce, el id", () => {
    expect(describirPaso({ id: "o", tipo: "oportunidad_ghl", pipeline_id: "dE7go9T3Mi2zbIT4sGME", etapa_id: "9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d" }, NOMBRES)).toMatchObject({
      clave: "GHL · Oportunidad",
      titulo: "1. Biblioteca Recursos",
      detalle: "Columna «Registrados»",
      icono: "diana",
    });
    expect(describirPaso({ id: "o", tipo: "oportunidad_ghl", pipeline_id: "zuQjPVJNbPpRlL0voy6d", etapa_id: null }, NOMBRES)).toMatchObject({ titulo: "zuQjPVJNbPpRlL0voy6d", detalle: "Primera columna" });
  });
  it("quitar etiqueta, mover en el dashboard y rama", () => {
    expect(describirPaso({ id: "q", tipo: "quitar_etiqueta_ghl", etiqueta: "vieja" }, NOMBRES)).toMatchObject({ clave: "GHL · Quitar etiqueta", titulo: "vieja" });
    expect(describirPaso({ id: "m", tipo: "mover_dashboard", pipeline_id: "p-1", etapa_id: "et-1" }, NOMBRES)).toMatchObject({ clave: "Mover en el dashboard", titulo: "0. Agendas General", detalle: "Columna «Form»" });
    expect(
      describirPaso({ id: "r", tipo: "rama", caminos: [{ condicion: { campo: "utm_source", operador: "igual", valor: "x" }, pasos: [] }, { condicion: { campo: "utm_source", operador: "contiene", valor: "y" }, pasos: [] }], si_no: [] }, NOMBRES)
    ).toMatchObject({ clave: "Rama", titulo: "Según utm_source", detalle: "3 caminos", icono: "rama" });
  });
});

describe("condicionTexto y disparadorTexto", () => {
  it("cada condición en palabras", () => {
    expect(condicionTexto({ campo: "utm_source", operador: "igual", valor: "biblioteca" })).toBe("es «biblioteca»");
    expect(condicionTexto({ campo: "utm_source", operador: "contiene", valor: "youtube" })).toBe("contiene «youtube»");
    expect(condicionTexto({ campo: "utm_source", operador: "existe" })).toBe("tiene utm_source");
    expect(condicionTexto({ campo: "utm_source", operador: "no_existe" })).toBe("no tiene utm_source");
  });
  it("el disparador con el nombre de su Entrada", () => {
    expect(disparadorTexto({ tipo: "entrada", entrada_id: "e-1" }, NOMBRES)).toEqual({ titulo: "Llega un lead a la Entrada", detalle: "Web · Biblioteca registro" });
    expect(disparadorTexto({ tipo: "entrada", entrada_id: "otra" }, NOMBRES).detalle).toBe("Entrada borrada");
  });
});

describe("estadoEjecucion", () => {
  it("cada estado en palabras y con su tono", () => {
    expect(estadoEjecucion({ estado: "esperando", coincide: null })).toEqual({ texto: "Esperando", tono: "espera" });
    expect(estadoEjecucion({ estado: "ok", coincide: true })).toEqual({ texto: "Coincide", tono: "ok" });
    expect(estadoEjecucion({ estado: "ok", coincide: false })).toEqual({ texto: "No coincide", tono: "mal" });
    expect(estadoEjecucion({ estado: "ok", coincide: null })).toEqual({ texto: "Enviado a GHL", tono: "ok" });
    expect(estadoEjecucion({ estado: "error", coincide: null })).toEqual({ texto: "Error", tono: "mal" });
    expect(estadoEjecucion({ estado: "parada", coincide: null })).toEqual({ texto: "Parada", tono: "neutro" });
  });
});

describe("pasosDelRegistro: las pastillas del historial, con su hora", () => {
  it("convierte el registro en pasos legibles, en la hora del proyecto", () => {
    const r = pasosDelRegistro(
      [
        { tipo: "tramo", tramo: 0, pasos: ["contacto-1 (contacto_ghl)", "etiquetas-1 (etiquetas_ghl)", "oportunidad-1 (oportunidad_ghl)"], hora: "2026-11-07T17:07:00.000Z", modo: "prueba" },
        { tipo: "comparacion", diferencias: [], hora: "2026-11-07T17:07:00.000Z" },
      ],
      "Europe/Madrid"
    );
    expect(r).toEqual([
      { hora: "18:07", texto: "contacto" },
      { hora: "18:07", texto: "etiquetas" },
      { hora: "18:07", texto: "oportunidad" },
      { hora: "18:07", texto: "comparado con lo de hoy" },
    ]);
  });
  it("lo que no entiende no rompe; la parada se ve", () => {
    expect(pasosDelRegistro([{ tipo: "raro" }, { tipo: "parada", hora: "2026-11-07T17:00:00.000Z" }] as never, "America/New_York")).toEqual([{ hora: "12:00", texto: "parada" }]);
    expect(pasosDelRegistro(null as never, "America/New_York")).toEqual([]);
  });
});
