// Workflows, 4a (docs/plan-workflows.md, aprobado por Cristian el 7 nov 2026): lo que se calcula sin base de datos
// ni internet. La prueba clave: el workflow que sale de «Qué hacer en GHL» de cada Entrada de la Biblioteca calcula
// EXACTAMENTE lo mismo que el código de hoy (armarEnvioGhl), con 0 diferencias.
import { describe, expect, it } from "vitest";
import { armarEnvioGhl, type ConfigGhl } from "@/lib/entrada-ghl";
import { aplanarPasos, compararEnvios, configDePasos, envioDeWorkflow, tramos, workflowDeEntrada, type EntradaParaWorkflow, type Paso } from "@/lib/workflows";

const REGISTRO = { name: "ana maria prueba lopez", email: "ana.prueba@ejemplo.test", phone: "+584220000000", first_name: "ana", step: "registro", utm_source: "facebook", utm_campaign: "biblio-nov", source: "recursos" };
const CUESTIONARIO = { email: "ana.prueba@ejemplo.test", step: "cuestionario", quiz: { situacion: "Tengo una agencia", inicio: "Ya mismo" }, quiz_completed: true, source: "recursos" };

// Las 2 Entradas reales de la Biblioteca, con su configuración de «Qué hacer en GHL» (docs/plan-GHL.md, «Datos»)
const ENTRADA_REGISTRO: EntradaParaWorkflow = {
  id: "087b86d1-72f6-4df1-a6ff-d5e276ca0879",
  nombre: "Web · Biblioteca registro",
  ghl_campos: { "quiz.situacion": "ILrgHLZsc1TX8lBYWzfM", utm_source: "BPs2vrG7eqH7D3d5zJEf" },
  ghl_pipeline_id: "dE7go9T3Mi2zbIT4sGME",
  ghl_etapa_id: "9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d",
  ghl_oportunidades: [{ pipeline_id: "dE7go9T3Mi2zbIT4sGME", etapa_id: "9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d" }],
  ghl_etiqueta_base: "Biblioteca-form",
  ghl_etiquetas_extra: ["biblioteca recursos"],
  ghl_espera_seg: 300,
  ghl_campo_completo: "quiz_completed",
};
const ENTRADA_AGENDA: EntradaParaWorkflow = {
  id: "bc00a154-560c-4ac3-ba4f-0a850116bf73",
  nombre: "Web · Biblioteca agenda",
  ghl_campos: { "quiz.situacion": "ILrgHLZsc1TX8lBYWzfM" },
  ghl_pipeline_id: "wym2Ue4VUqkhsFoQJ5PK",
  ghl_etapa_id: null,
  ghl_oportunidades: [
    { pipeline_id: "wym2Ue4VUqkhsFoQJ5PK", etapa_id: null },
    { pipeline_id: "zuQjPVJNbPpRlL0voy6d", etapa_id: null },
  ],
  ghl_etiqueta_base: "Biblioteca-agenda",
  ghl_etiquetas_extra: ["agenda biblioteca"],
  ghl_espera_seg: 300,
  ghl_campo_completo: "quiz_completed",
};
// Lo que usa hoy enviarLead (src/lib/ghl-envios.ts) con una Entrada
const configDeHoy = (en: EntradaParaWorkflow): ConfigGhl => ({
  campos: en.ghl_campos ?? {},
  pipelineId: en.ghl_pipeline_id,
  etapaId: en.ghl_etapa_id,
  oportunidades: en.ghl_oportunidades ?? [],
  etiquetaBase: en.ghl_etiqueta_base,
  etiquetasExtra: en.ghl_etiquetas_extra ?? [],
  campoCompleto: en.ghl_campo_completo ?? "",
});

describe("workflowDeEntrada: «Qué hacer en GHL» pasa a ser un workflow", () => {
  it("registro: esperar 300 s → contacto → etiquetas → 1 oportunidad", () => {
    const w = workflowDeEntrada(ENTRADA_REGISTRO);
    expect(w.nombre).toBe("Web · Biblioteca registro");
    expect(w.disparador).toEqual({ tipo: "entrada", entrada_id: ENTRADA_REGISTRO.id });
    expect(w.pasos.map((p) => p.tipo)).toEqual(["esperar", "contacto_ghl", "etiquetas_ghl", "oportunidad_ghl"]);
    expect(w.pasos[0]).toMatchObject({ segundos: 300 });
    expect(w.pasos[2]).toMatchObject({ base: "Biblioteca-form", fijas: ["biblioteca recursos"], campo_completo: "quiz_completed" });
  });
  it("agenda: 2 oportunidades, en la primera columna", () => {
    const w = workflowDeEntrada(ENTRADA_AGENDA);
    expect(w.pasos.filter((p) => p.tipo === "oportunidad_ghl")).toEqual([
      expect.objectContaining({ pipeline_id: "wym2Ue4VUqkhsFoQJ5PK", etapa_id: null }),
      expect.objectContaining({ pipeline_id: "zuQjPVJNbPpRlL0voy6d", etapa_id: null }),
    ]);
  });
  it("una Entrada de antes (sin lista de oportunidades) usa su pipeline de siempre", () => {
    const w = workflowDeEntrada({ ...ENTRADA_REGISTRO, ghl_oportunidades: [] });
    expect(w.pasos.filter((p) => p.tipo === "oportunidad_ghl")).toEqual([expect.objectContaining({ pipeline_id: "dE7go9T3Mi2zbIT4sGME", etapa_id: "9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d" })]);
  });
  it("sin espera no pone «esperar»; cada paso tiene su id", () => {
    const w = workflowDeEntrada({ ...ENTRADA_REGISTRO, ghl_espera_seg: 0 });
    expect(w.pasos[0].tipo).toBe("contacto_ghl");
    expect(new Set(w.pasos.map((p) => p.id)).size).toBe(w.pasos.length);
  });
});

describe("el workflow calcula lo mismo que hoy (0 diferencias)", () => {
  for (const [nombre, en] of [["registro", ENTRADA_REGISTRO], ["agenda", ENTRADA_AGENDA]] as const)
    for (const [caso, envios] of [["solo registro", [REGISTRO]], ["registro + cuestionario", [REGISTRO, CUESTIONARIO]]] as const)
      it(`${nombre} · ${caso}`, () => {
        const hoy = armarEnvioGhl([...envios], configDeHoy(en));
        const wf = envioDeWorkflow(workflowDeEntrada(en).pasos, [...envios]);
        expect(compararEnvios(wf, hoy)).toEqual([]);
        expect(wf).toEqual(hoy);
      });
});

describe("compararEnvios: encuentra cada diferencia", () => {
  const hoy = armarEnvioGhl([REGISTRO, CUESTIONARIO], configDeHoy(ENTRADA_AGENDA));
  it("una etiqueta de más", () => {
    expect(compararEnvios({ ...hoy, etiquetas: [...hoy.etiquetas, "otra"] }, hoy)).toEqual(["Etiquetas: el workflow pone «otra» y hoy no"]);
  });
  it("una oportunidad de menos", () => {
    expect(compararEnvios({ ...hoy, oportunidades: hoy.oportunidades.slice(0, 1) }, hoy)).toEqual(["Oportunidades: hoy se crea en «zuQjPVJNbPpRlL0voy6d» (primera columna) y el workflow no"]);
  });
  it("un campo distinto y otra etiqueta que quitar", () => {
    const d = compararEnvios({ ...hoy, customFields: [{ id: "ILrgHLZsc1TX8lBYWzfM", field_value: "Otra cosa" }], quitar: null }, hoy);
    expect(d).toEqual(["Campo ILrgHLZsc1TX8lBYWzfM: el workflow manda «Otra cosa» y hoy «Tengo una agencia»", "Quitar etiqueta: el workflow no quita nada y hoy quita «biblioteca-agenda-incompleto»"]);
  });
  it("un dato del contacto distinto", () => {
    expect(compararEnvios({ ...hoy, contacto: { ...hoy.contacto, phone: "+1555" } }, hoy)).toEqual(["Contacto phone: el workflow manda «+1555» y hoy «+584220000000»"]);
  });
  it("el orden no cuenta", () => {
    expect(compararEnvios({ ...hoy, etiquetas: [...hoy.etiquetas].reverse(), oportunidades: [...hoy.oportunidades].reverse() }, hoy)).toEqual([]);
  });
});

describe("ramas «si el campo…» y esperas", () => {
  const PASOS: Paso[] = [
    { id: "e1", tipo: "esperar", segundos: 300 },
    { id: "c1", tipo: "contacto_ghl", campos: {} },
    {
      id: "r1",
      tipo: "rama",
      caminos: [
        { condicion: { campo: "utm_source", operador: "igual", valor: "agenda-biblioteca" }, pasos: [{ id: "o1", tipo: "oportunidad_ghl", pipeline_id: "wym2Ue4VUqkhsFoQJ5PK", etapa_id: null }] },
        { condicion: { campo: "utm_source", operador: "contiene", valor: "youtube" }, pasos: [{ id: "o2", tipo: "oportunidad_ghl", pipeline_id: "oekHKZXhsaYBayDgeTAn", etapa_id: null }, { id: "e2", tipo: "esperar", segundos: 60 }, { id: "q1", tipo: "quitar_etiqueta_ghl", etiqueta: "x" }] },
      ],
      si_no: [{ id: "o3", tipo: "oportunidad_ghl", pipeline_id: "zuQjPVJNbPpRlL0voy6d", etapa_id: null }],
    },
  ];
  it("elige el primer camino que se cumple (con lo juntado de todos los envíos)", () => {
    expect(aplanarPasos(PASOS, [{ utm_source: "agenda-biblioteca" }]).map((p) => p.id)).toEqual(["e1", "c1", "o1"]);
    expect(aplanarPasos(PASOS, [{ utm_source: "YouTube-canal" }]).map((p) => p.id)).toEqual(["e1", "c1", "o2", "e2", "q1"]);
  });
  it("si no se cumple ninguno, el camino «si no»", () => {
    expect(aplanarPasos(PASOS, [{ utm_source: "instagram" }]).map((p) => p.id)).toEqual(["e1", "c1", "o3"]);
    expect(aplanarPasos(PASOS, [{}]).map((p) => p.id)).toEqual(["e1", "c1", "o3"]);
  });
  it("tramos: corta en cada «esperar» (lo que se hace en cada lectura)", () => {
    expect(tramos(aplanarPasos(PASOS, [{ utm_source: "youtube" }])).map((t) => ({ espera: t.espera, pasos: t.pasos.map((p) => p.id) }))).toEqual([
      { espera: 300, pasos: ["c1", "o2"] },
      { espera: 60, pasos: ["q1"] },
    ]);
    expect(tramos([{ id: "c", tipo: "contacto_ghl", campos: {} }])).toEqual([{ espera: 0, pasos: [{ id: "c", tipo: "contacto_ghl", campos: {} }] }]);
  });
  it("configDePasos junta los campos de varios pasos de contacto y respeta el orden de las oportunidades", () => {
    const c = configDePasos([
      { id: "a", tipo: "contacto_ghl", campos: { utm_source: "X" } },
      { id: "b", tipo: "contacto_ghl", campos: { utm_campaign: "Y" } },
      { id: "o", tipo: "oportunidad_ghl", pipeline_id: "P2", etapa_id: null },
      { id: "p", tipo: "oportunidad_ghl", pipeline_id: "P1", etapa_id: "E1" },
    ]);
    expect(c.campos).toEqual({ utm_source: "X", utm_campaign: "Y" });
    expect(c.oportunidades).toEqual([{ pipeline_id: "P2", etapa_id: null }, { pipeline_id: "P1", etapa_id: "E1" }]);
    expect(c.etiquetaBase).toBeNull();
  });
});
