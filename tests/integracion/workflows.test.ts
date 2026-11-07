// Workflows, 4a-1 (docs/plan-workflows.md, aprobado por Cristian el 7 nov 2026): el motor en modo prueba, contra un
// proyecto de prueba que se borra solo. En modo prueba NO se llama a GHL: se compara con lo que calcula hoy.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { crearEscenario, borrarEscenario, como, db, type Escenario } from "../apoyo/escenario";
import { POST } from "@/app/api/webhooks/entrada/[token]/route";
import { crearWorkflowDePrueba, pararWorkflow, reintentarEjecuciones } from "@/app/(panel)/admin/acciones";
import { avanzarEjecuciones, resumenWorkflows } from "@/lib/workflows-motor";

let e: Escenario;
let token: string;
let entradaId: string;
const CONFIG_GHL = {
  ghl_activo: true,
  ghl_campos: { "quiz.situacion": "ILrgHLZsc1TX8lBYWzfM", utm_source: "BPs2vrG7eqH7D3d5zJEf" },
  ghl_oportunidades: [{ pipeline_id: "dE7go9T3Mi2zbIT4sGME", etapa_id: "9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d" }],
  ghl_pipeline_id: "dE7go9T3Mi2zbIT4sGME",
  ghl_etapa_id: "9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d",
  ghl_etiqueta_base: "Biblioteca-form",
  ghl_etiquetas_extra: ["biblioteca recursos"],
  ghl_espera_seg: 300,
  ghl_campo_completo: "quiz_completed",
};

beforeAll(async () => {
  e = await crearEscenario();
  const { data, error } = await db.from("entradas").insert({ proyecto_id: e.proyecto.id, nombre: "WF registro", pipeline_id: e.pipeline.id, ...CONFIG_GHL }).select("id, token").single();
  if (error) throw new Error(error.message);
  token = data!.token;
  entradaId = data!.id;
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

function enviar(cuerpo: Record<string, unknown>) {
  const req = new NextRequest(`http://localhost/api/webhooks/entrada/${token}`, { method: "POST", body: JSON.stringify(cuerpo), headers: { "content-type": "application/json" } });
  return POST(req, { params: Promise.resolve({ token }) } as never);
}
const ejecuciones = async (email: string) => {
  const { data: lead } = await db.from("leads").select("id").eq("proyecto_id", e.proyecto.id).eq("email", email).single();
  return (await db.from("workflow_ejecuciones").select("*").eq("lead_id", lead!.id).order("creado_en")).data ?? [];
};
const email = () => `${e.pref}-wf1@x.test`;
const dentroDe = (seg: number) => new Date(Date.now() + seg * 1000);

describe("«Probar como workflow»", () => {
  it("crea el workflow de la Entrada en modo prueba, con los pasos de «Qué hacer en GHL»", async () => {
    como(e, e.p.ceo);
    expect(await crearWorkflowDePrueba(entradaId)).toMatchObject({ ok: true });
    const { data: w } = await db.from("workflows").select("*").eq("entrada_id", entradaId).single();
    expect(w).toMatchObject({ modo: "prueba", encendido: true, version: 1, nombre: "WF registro", disparador: { tipo: "entrada", entrada_id: entradaId } });
    expect((w!.pasos as { tipo: string }[]).map((p) => p.tipo)).toEqual(["esperar", "contacto_ghl", "etiquetas_ghl", "oportunidad_ghl"]);
  });
  it("no crea otro si ya tiene uno encendido", async () => {
    como(e, e.p.ceo);
    expect(await crearWorkflowDePrueba(entradaId)).toMatchObject({ error: expect.stringMatching(/ya/i) });
    expect((await db.from("workflows").select("id").eq("entrada_id", entradaId)).data).toHaveLength(1);
  });
  it("un caller no puede", async () => {
    como(e, e.p.callerA);
    expect(await crearWorkflowDePrueba(entradaId)).toMatchObject({ error: expect.any(String) });
  });
});

describe("motor en modo prueba", () => {
  it("al llegar un envío se crea su ejecución, esperando la espera del workflow", async () => {
    expect((await enviar({ name: "Ana Wf", email: email(), phone: "+15550100001", utm_source: "facebook", step: "registro" })).status).toBe(200);
    const ej = await ejecuciones(email());
    expect(ej).toHaveLength(1);
    expect(ej[0]).toMatchObject({ estado: "esperando", tramo: 0, version: 1, entrada_id: entradaId });
    const falta = (new Date(ej[0].siguiente_en).getTime() - Date.now()) / 1000;
    expect(falta).toBeGreaterThan(280);
    expect(falta).toBeLessThanOrEqual(301);
  });
  it("lo de hoy sigue igual: el envío también espera para GHL", async () => {
    const { data } = await db.from("webhook_eventos").select("ghl_estado").eq("entrada_id", entradaId).order("recibido_en", { ascending: false }).limit(1).single();
    expect(data!.ghl_estado).toBe("esperando");
  });
  it("un segundo envío del mismo lead (el cuestionario) no crea otra ejecución", async () => {
    await enviar({ email: email(), step: "cuestionario", quiz: { situacion: "Tengo una agencia" }, quiz_completed: true });
    expect(await ejecuciones(email())).toHaveLength(1);
  });
  it("antes de su hora no se hace nada", async () => {
    await avanzarEjecuciones(e.proyecto.id, { ahora: new Date() });
    expect((await ejecuciones(email()))[0].estado).toBe("esperando");
  });
  it("a su hora: no llama a GHL, compara con lo de hoy y coincide", async () => {
    const espia = vi.spyOn(globalThis, "fetch");
    const r = await avanzarEjecuciones(e.proyecto.id, { ahora: dentroDe(301) });
    // La base de datos también usa fetch (127.0.0.1:54321): lo que no puede haber es ninguna llamada a GHL
    const urls = espia.mock.calls.map(([u]) => String(u instanceof Request ? u.url : u));
    espia.mockRestore();
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((u) => /leadconnectorhq|gohighlevel|msgsndr/i.test(u))).toEqual([]);
    expect(r.ok).toBeGreaterThanOrEqual(1);
    const ej = (await ejecuciones(email()))[0];
    expect(ej).toMatchObject({ estado: "ok", coincide: true, error: null });
    const ultimo = (ej.registro as { tipo: string; diferencias?: string[] }[]).at(-1);
    expect(ultimo).toMatchObject({ tipo: "comparacion", diferencias: [] });
  });
  it("si el lead vuelve a mandar después, se crea una ejecución nueva (como hoy, que vuelve a mandar)", async () => {
    await enviar({ email: email(), step: "tarde", utm_campaign: "otra" });
    const ej = await ejecuciones(email());
    expect(ej).toHaveLength(2);
    expect(ej[1].estado).toBe("esperando");
  });
});

describe("resumen y avisos", () => {
  it("cuenta coinciden, esperando y errores por workflow", async () => {
    const r = await resumenWorkflows(e.proyecto.id);
    const [w] = [...r.values()];
    expect(w).toMatchObject({ total: 2, coinciden: 1, no_coinciden: 0, esperando: 1, errores: 0 });
  });
  it("la función no la puede llamar nadie desde fuera", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    expect((await anon.rpc("resumen_workflows", { p_proyecto: e.proyecto.id })).error).not.toBeNull();
    expect((await anon.from("workflows").select("*").limit(1)).data ?? []).toHaveLength(0);
    expect((await anon.from("workflow_ejecuciones").select("*").limit(1)).data ?? []).toHaveLength(0);
  });
  it("si falla 5 veces queda en error (sin email en prueba) y «Reintentar» la vuelve a poner en marcha", async () => {
    // Sin su Entrada no se puede comparar con lo de hoy: falla en cada lectura
    const { data: w } = await db.from("workflows").select("id").eq("entrada_id", entradaId).single();
    const { data: lead } = await db.from("leads").select("id").eq("proyecto_id", e.proyecto.id).eq("email", email()).single();
    const { data: rota } = await db.from("workflow_ejecuciones").insert({ workflow_id: w!.id, version: 1, pasos: [{ id: "c", tipo: "contacto_ghl", campos: {} }], proyecto_id: e.proyecto.id, lead_id: lead!.id, entrada_id: null, siguiente_en: new Date().toISOString() }).select("id").single();
    for (let i = 1; i <= 5; i++) await avanzarEjecuciones(e.proyecto.id, { ahora: dentroDe(i * 61) });
    const { data: x } = await db.from("workflow_ejecuciones").select("estado, intentos, error").eq("id", rota!.id).single();
    expect(x).toMatchObject({ estado: "error", intentos: 5, error: expect.stringMatching(/Entrada/) });
    como(e, e.p.ceo);
    expect(await reintentarEjecuciones(w!.id)).toMatchObject({ ok: true });
    expect((await db.from("workflow_ejecuciones").select("estado, intentos").eq("id", rota!.id).single()).data).toEqual({ estado: "esperando", intentos: 0 });
    await db.from("workflow_ejecuciones").delete().eq("id", rota!.id);
  });
  it("con 2 tramos (una espera en medio), cada lectura hace un tramo", async () => {
    const { data: w } = await db.from("workflows").select("id").eq("entrada_id", entradaId).single();
    const { data: lead } = await db.from("leads").select("id").eq("proyecto_id", e.proyecto.id).eq("email", email()).single();
    const pasos = [{ id: "c", tipo: "contacto_ghl", campos: {} }, { id: "e", tipo: "esperar", segundos: 600 }, { id: "o", tipo: "oportunidad_ghl", pipeline_id: "dE7go9T3Mi2zbIT4sGME", etapa_id: "9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d" }];
    const ahora = dentroDe(2000);
    const { data: dos } = await db.from("workflow_ejecuciones").insert({ workflow_id: w!.id, version: 1, pasos, proyecto_id: e.proyecto.id, lead_id: lead!.id, entrada_id: entradaId, siguiente_en: ahora.toISOString() }).select("id").single();
    await avanzarEjecuciones(e.proyecto.id, { ahora });
    const t1 = (await db.from("workflow_ejecuciones").select("estado, tramo, siguiente_en").eq("id", dos!.id).single()).data!;
    expect(t1).toMatchObject({ estado: "esperando", tramo: 1 });
    expect(new Date(t1.siguiente_en).getTime()).toBe(ahora.getTime() + 600_000);
    await avanzarEjecuciones(e.proyecto.id, { ahora: new Date(ahora.getTime() + 600_000) });
    expect((await db.from("workflow_ejecuciones").select("estado").eq("id", dos!.id).single()).data!.estado).toBe("ok");
    await db.from("workflow_ejecuciones").delete().eq("id", dos!.id);
  });
});

describe("parar la prueba", () => {
  it("con el workflow parado, lo que esperaba queda «parada» y no se crean ejecuciones nuevas", async () => {
    const { data: w } = await db.from("workflows").select("id").eq("entrada_id", entradaId).single();
    // Un envío nuevo deja una ejecución esperando (las de antes ya se hicieron en las pruebas de arriba)
    await enviar({ email: `${e.pref}-wf1@x.test`, step: "otra vez" });
    expect((await ejecuciones(`${e.pref}-wf1@x.test`)).at(-1)!.estado).toBe("esperando");
    como(e, e.p.ceo);
    expect(await pararWorkflow(w!.id)).toMatchObject({ ok: true });
    await avanzarEjecuciones(e.proyecto.id, { ahora: dentroDe(9999) });
    const ej = await ejecuciones(`${e.pref}-wf1@x.test`);
    expect(ej.at(-1)!.estado).toBe("parada");
    await enviar({ name: "Otro", email: `${e.pref}-wf2@x.test`, phone: "+15550100002" });
    expect(await ejecuciones(`${e.pref}-wf2@x.test`)).toHaveLength(0);
  });
});
