// Panel de endpoints (plan GHL, punto 0, Cristian 7 nov 2026): resumen por Entrada, rojos sin límite, «Ver más»,
// datos de la landing y un solo «Guardar». Contra un proyecto de prueba que se borra solo.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { crearEscenario, borrarEscenario, como, db, formulario, type Escenario } from "../apoyo/escenario";
import { cambiarActivaEntrada, crearEntrada, guardarEntradaCompleta, masEnviosEntrada } from "@/app/(panel)/admin/acciones";
import { enviosEnRojo, resumenEntradas } from "@/lib/entradas-datos";

let e: Escenario;
let entradaId: string;
let otraId: string;
const leads: string[] = [];

const minutosAtras = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const GHL_VACIO = { activo: false, campos: {}, oportunidades: [], etiqueta_base: "", etiquetas_extra: [], espera_seg: 300, campo_completo: "quiz_completed" };

beforeAll(async () => {
  e = await crearEscenario();
  const { data: en } = await db.from("entradas").insert([{ proyecto_id: e.proyecto.id, nombre: "Panel A", pipeline_id: e.pipeline.id }, { proyecto_id: e.proyecto.id, nombre: "Panel B" }]).select("id, nombre");
  entradaId = en!.find((x) => x.nombre === "Panel A")!.id;
  otraId = en!.find((x) => x.nombre === "Panel B")!.id;
  for (const n of ["uno", "dos"]) {
    const { data } = await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre: n, email: `${e.pref}-${n}@x.test` }).select("id").single();
    leads.push(data!.id);
  }
  // Panel A: 1 rojo muy antiguo (antes que los 205 de después), 205 envíos del lead «uno» y 1 del lead «dos»
  const filas = [
    { proyecto_id: e.proyecto.id, entrada_id: entradaId, lead_id: leads[1], tipo: "entrada: Panel A", payload: { email: "dos" }, procesado: true, ghl_estado: "error", ghl_intentos: 5, ghl_error: "401 token", recibido_en: minutosAtras(10_000) },
    ...Array.from({ length: 205 }, (_, i) => ({ proyecto_id: e.proyecto.id, entrada_id: entradaId, lead_id: leads[0], tipo: "entrada: Panel A", payload: { email: "uno", n: i }, procesado: true, ghl_estado: "ok", recibido_en: minutosAtras(500 - i) })),
  ];
  const { error } = await db.from("webhook_eventos").insert(filas);
  if (error) throw new Error(error.message);
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("resumen de cada Entrada (una sola consulta)", () => {
  it("cuenta envíos, leads distintos, el último y los rojos", async () => {
    const r = await resumenEntradas(e.proyecto.id);
    expect(r.get(entradaId)).toMatchObject({ envios: 206, leads: 2, rojos: 1 });
    // El último es el n = 204 (hace 296 min)
    expect(Math.abs(new Date(r.get(entradaId)!.ultimo!).getTime() - new Date(minutosAtras(296)).getTime())).toBeLessThan(5 * 60_000);
  });
  it("una Entrada sin envíos sale con ceros", async () => {
    expect((await resumenEntradas(e.proyecto.id)).get(otraId)).toEqual({ envios: 0, leads: 0, rojos: 0, ultimo: null });
  });
  it("la función no la puede llamar nadie desde fuera", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    expect((await anon.rpc("resumen_entradas", { p_proyecto: e.proyecto.id })).error).not.toBeNull();
  });
});

describe("envíos en rojo siempre visibles", () => {
  it("un rojo más antiguo que los 200 últimos sale igual", async () => {
    const rojos = await enviosEnRojo([entradaId, otraId]);
    expect(rojos).toHaveLength(1);
    expect(rojos[0]).toMatchObject({ entrada_id: entradaId, lead_id: leads[1], ghl_error: "401 token" });
  });
});

describe("«Ver más»", () => {
  it("trae los 50 siguientes, del más nuevo al más viejo", async () => {
    como(e, e.p.ceo);
    const r = await masEnviosEntrada(entradaId, 15);
    expect(r.ok).toBe(true);
    const evs = (r as unknown as { datos: { payload: { n?: number } }[] }).datos;
    expect(evs).toHaveLength(50);
    expect(evs[0].payload.n).toBe(204 - 15);
    expect(evs[49].payload.n).toBe(204 - 64);
  });
  it("al final trae menos (y el rojo antiguo, el último)", async () => {
    como(e, e.p.ceo);
    const evs = ((await masEnviosEntrada(entradaId, 200)) as unknown as { datos: { payload: { email: string } }[] }).datos;
    expect(evs).toHaveLength(6);
    expect(evs[5].payload.email).toBe("dos");
  });
  it("un caller no puede", async () => {
    como(e, e.p.callerA);
    expect(await masEnviosEntrada(entradaId, 0)).toMatchObject({ error: expect.any(String) });
  });
});

describe("crear con los datos de la landing", () => {
  it("guarda landing, formulario y desde dónde envía", async () => {
    como(e, e.p.ceo);
    const r = await crearEntrada(null, formulario({ nombre: "Web · Panel nueva", landing: "codigomaestria", formulario: "agenda", envia_desde: "navegador", pipeline_id: e.pipeline.id, etapa_id: "" }));
    expect(r).toMatchObject({ ok: expect.any(String) });
    const { data } = await db.from("entradas").select("landing, formulario, envia_desde, archivo, activa").eq("proyecto_id", e.proyecto.id).eq("nombre", "Web · Panel nueva").single();
    expect(data).toEqual({ landing: "codigomaestria", formulario: "agenda", envia_desde: "navegador", archivo: null, activa: true });
  });
  it("«No lo sé» se guarda vacío", async () => {
    como(e, e.p.ceo);
    await crearEntrada(null, formulario({ nombre: "Web · Panel sin saber", landing: "", formulario: "", envia_desde: "", pipeline_id: "", etapa_id: "" }));
    const { data } = await db.from("entradas").select("landing, envia_desde").eq("proyecto_id", e.proyecto.id).eq("nombre", "Web · Panel sin saber").single();
    expect(data).toEqual({ landing: null, envia_desde: null });
  });
});

describe("un solo «Guardar»: todo o nada", () => {
  const entrada = (nombre: string) => ({ nombre, pipeline_id: e.pipeline.id, etapa_id: null, reglas: [], landing: "biblioteca", formulario: "registro", envia_desde: "servidor", archivo: "api/signup.js" });
  it("guarda la Entrada, sus datos de landing y lo de GHL a la vez", async () => {
    como(e, e.p.ceo);
    const r = await guardarEntradaCompleta(otraId, { entrada: entrada("Panel B cambiada"), ghl: { ...GHL_VACIO, etiqueta_base: "Panel-b", espera_seg: 120 } });
    expect(r.ok).toBe(true);
    const { data } = await db.from("entradas").select("nombre, landing, formulario, envia_desde, archivo, ghl_etiqueta_base, ghl_espera_seg, activa").eq("id", otraId).single();
    expect(data).toEqual({ nombre: "Panel B cambiada", landing: "biblioteca", formulario: "registro", envia_desde: "servidor", archivo: "api/signup.js", ghl_etiqueta_base: "Panel-b", ghl_espera_seg: 120, activa: true });
  });
  it("si lo de GHL está mal, no se guarda nada (tampoco el nombre)", async () => {
    como(e, e.p.ceo);
    const r = await guardarEntradaCompleta(otraId, { entrada: entrada("NO DEBE GUARDARSE"), ghl: { ...GHL_VACIO, espera_seg: 99_999 } });
    expect(r).toMatchObject({ error: expect.stringMatching(/espera/i) });
    expect((await db.from("entradas").select("nombre").eq("id", otraId).single()).data!.nombre).toBe("Panel B cambiada");
  });
  it("sin GHL conectado (ghl = null) guarda solo la Entrada y no toca lo de GHL", async () => {
    como(e, e.p.ceo);
    expect((await guardarEntradaCompleta(otraId, { entrada: entrada("Panel B otra vez"), ghl: null })).ok).toBe(true);
    expect((await db.from("entradas").select("nombre, ghl_etiqueta_base").eq("id", otraId).single()).data).toEqual({ nombre: "Panel B otra vez", ghl_etiqueta_base: "Panel-b" });
  });
  it("no deja guardar en una Entrada de otro proyecto", async () => {
    const otro = await crearEscenario();
    try {
      como(otro, otro.p.ceo);
      expect(await guardarEntradaCompleta(otraId, { entrada: entrada("intruso"), ghl: null })).toMatchObject({ error: expect.any(String) });
    } finally {
      await borrarEscenario(otro);
    }
  });
});

describe("apagar y encender", () => {
  it("cambia solo «activa»", async () => {
    como(e, e.p.ceo);
    expect((await cambiarActivaEntrada(otraId, false)).ok).toBe(true);
    expect((await db.from("entradas").select("activa, nombre").eq("id", otraId).single()).data).toEqual({ activa: false, nombre: "Panel B otra vez" });
    await cambiarActivaEntrada(otraId, true);
    expect((await db.from("entradas").select("activa").eq("id", otraId).single()).data!.activa).toBe(true);
  });
});
