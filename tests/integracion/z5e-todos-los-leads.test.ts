// S5-10 (auditoría): el trigger «Todos los leads» (supabase/migrations/20261118120000_todos_los_leads.sql) no tenía test.
// Si se rompe, los leads nuevos no salen en el pipeline de los jefes y nadie se entera.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";

let e: Escenario;
let todos: string;
const etapa: Record<string, string> = {};
const origen: Record<string, string> = {};

async function crearPipeline(nombre: string, orden: number) {
  const { data, error } = await db.from("pipelines").insert({ proyecto_id: e.proyecto.id, nombre, orden, tipo: "normal" }).select("id").single();
  if (error) throw new Error(`pipeline ${nombre}: ${error.message}`);
  return data.id as string;
}
async function crearLead(nombre: string, pipelineId: string | null) {
  const { data, error } = await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre, pipeline_id: pipelineId }).select("id").single();
  if (error) throw new Error(`lead ${nombre}: ${error.message}`);
  return data.id as string;
}
const tarjetas = async (leadId: string) => (await db.from("tarjetas_extra").select("pipeline_id, etapa_id").eq("lead_id", leadId)).data ?? [];

beforeAll(async () => {
  e = await crearEscenario();
  todos = await crearPipeline("Todos los leads", 10);
  const { data, error } = await db
    .from("etapas")
    .insert(["Biblioteca", "Webinar 1", "Webinar Ads", "Leads WhatsApp", "Otros"].map((nombre, orden) => ({ pipeline_id: todos, nombre, orden })))
    .select("id, nombre");
  if (error) throw new Error(`etapas: ${error.message}`);
  for (const x of data ?? []) etapa[x.nombre] = x.id;
  origen.biblioteca = await crearPipeline("Biblioteca Noviembre", 11);
  origen.ads = await crearPipeline("Webinar Ads Nov", 12);
  origen.otro = await crearPipeline("Referidos", 13);
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("Trigger «Todos los leads»", () => {
  it("un lead nuevo sale en «Todos los leads», en la columna de su pipeline", async () => {
    const ads = await crearLead("Z5E ads", origen.ads);
    const otro = await crearLead("Z5E otro", origen.otro);
    expect(await tarjetas(ads)).toEqual([{ pipeline_id: todos, etapa_id: etapa["Webinar Ads"] }]);
    expect(await tarjetas(otro)).toEqual([{ pipeline_id: todos, etapa_id: etapa.Otros }]);
  });

  it("sin pipeline, nada; al ponerle pipeline, entra; al cambiarlo otra vez, ni se duplica ni se mueve", async () => {
    const lead = await crearLead("Z5E sin pipeline", null);
    expect(await tarjetas(lead)).toEqual([]);
    expect((await db.from("leads").update({ pipeline_id: origen.biblioteca }).eq("id", lead)).error).toBeNull();
    expect(await tarjetas(lead)).toEqual([{ pipeline_id: todos, etapa_id: etapa.Biblioteca }]);
    expect((await db.from("leads").update({ pipeline_id: origen.ads }).eq("id", lead)).error).toBeNull();
    expect(await tarjetas(lead)).toEqual([{ pipeline_id: todos, etapa_id: etapa.Biblioteca }]); // «las tarjetas de antes no se mueven»
  });

  it("un lead creado dentro de «Todos los leads» no lleva tarjeta extra", async () => {
    expect(await tarjetas(await crearLead("Z5E dentro", todos))).toEqual([]);
  });

  it("en un proyecto sin «Todos los leads», nada", async () => {
    const { data: p } = await db.from("proyectos").insert({ nombre: `TEST-AUTO ${e.id} sin-todos` }).select("id").single();
    const { data: pipe } = await db.from("pipelines").insert({ proyecto_id: p!.id, nombre: "Webinar Ads", orden: 0 }).select("id").single();
    const { data: l, error } = await db.from("leads").insert({ proyecto_id: p!.id, nombre: "Z5E fuera", pipeline_id: pipe!.id }).select("id").single();
    expect(error).toBeNull();
    expect(await tarjetas(l!.id)).toEqual([]);
  });
});
