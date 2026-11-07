// Workflows 4c (editor aprobado por Cristian el 7 nov 2026): guardar con versión, validar, permisos y encender/apagar.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, borrarEscenario, como, db, type Escenario } from "../apoyo/escenario";
import { crearWorkflowDePrueba, encenderWorkflow, guardarWorkflow, pararWorkflow } from "@/app/(panel)/admin/acciones";

let e: Escenario;
let entradaId: string;
let wfId: string;

beforeAll(async () => {
  e = await crearEscenario();
  const { data } = await db
    .from("entradas")
    .insert({ proyecto_id: e.proyecto.id, nombre: "WF editar", ghl_activo: true, ghl_oportunidades: [{ pipeline_id: "dE7go9T3Mi2zbIT4sGME", etapa_id: null }], ghl_etiqueta_base: "x", ghl_espera_seg: 60 })
    .select("id")
    .single();
  entradaId = data!.id;
  como(e, e.p.ceo);
  await crearWorkflowDePrueba(entradaId);
  wfId = (await db.from("workflows").select("id").eq("entrada_id", entradaId).single()).data!.id;
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

const leer = async () => (await db.from("workflows").select("pasos, version, encendido, modo").eq("id", wfId).single()).data!;

describe("guardar el workflow", () => {
  it("con pasos nuevos sube la versión y guarda los pasos limpios", async () => {
    como(e, e.p.ceo);
    const pasos = [
      { id: "e1", tipo: "esperar", segundos: 120 },
      { id: "r1", tipo: "rama", caminos: [{ condicion: { campo: "utm_source", operador: "igual", valor: "biblioteca" }, pasos: [{ id: "t1", tipo: "etiquetas_ghl", base: null, fijas: [" Agenda Biblioteca "], campo_completo: "" }] }], si_no: [] },
    ];
    expect(await guardarWorkflow(wfId, pasos)).toMatchObject({ ok: true, version: 2 });
    const w = await leer();
    expect(w.version).toBe(2);
    expect((w.pasos as { tipo: string }[]).map((p) => p.tipo)).toEqual(["esperar", "rama"]);
    expect(JSON.stringify(w.pasos)).toContain('"fijas":["agenda biblioteca"]');
  });
  it("sin cambios no sube la versión", async () => {
    como(e, e.p.ceo);
    const { pasos } = await leer();
    expect(await guardarWorkflow(wfId, pasos)).toMatchObject({ ok: true, version: 2 });
  });
  it("unos pasos mal hechos no se guardan y lo dice", async () => {
    como(e, e.p.ceo);
    expect(await guardarWorkflow(wfId, [{ id: "o", tipo: "oportunidad_ghl", pipeline_id: "", etapa_id: null }])).toMatchObject({ error: expect.stringMatching(/pipeline/) });
    expect((await leer()).version).toBe(2);
  });
  it("un caller no puede; otro proyecto tampoco", async () => {
    como(e, e.p.callerA);
    expect(await guardarWorkflow(wfId, [])).toMatchObject({ error: expect.any(String) });
    const otro = await crearEscenario();
    try {
      como(otro, otro.p.ceo);
      expect(await guardarWorkflow(wfId, [])).toMatchObject({ error: expect.any(String) });
    } finally {
      await borrarEscenario(otro);
    }
    expect((await leer()).version).toBe(2);
  });
  it("en modo real ya deja guardar «Mover en el dashboard» (Cristian, 7 nov)", async () => {
    await db.from("workflows").update({ modo: "real" }).eq("id", wfId);
    como(e, e.p.ceo);
    expect(await guardarWorkflow(wfId, [{ id: "m", tipo: "mover_dashboard", pipeline_id: e.pipeline.id, etapa_id: null }])).toMatchObject({ ok: true });
    await db.from("workflows").update({ modo: "prueba" }).eq("id", wfId);
  });
});

describe("encender y apagar", () => {
  it("se apaga y se vuelve a encender", async () => {
    como(e, e.p.ceo);
    await pararWorkflow(wfId);
    expect((await leer()).encendido).toBe(false);
    expect(await encenderWorkflow(wfId)).toMatchObject({ ok: true });
    expect((await leer()).encendido).toBe(true);
  });
  it("no se enciende si su Entrada ya tiene otro en marcha", async () => {
    como(e, e.p.ceo);
    await pararWorkflow(wfId);
    await crearWorkflowDePrueba(entradaId);
    expect(await encenderWorkflow(wfId)).toMatchObject({ error: expect.stringMatching(/otro/) });
  });
});
