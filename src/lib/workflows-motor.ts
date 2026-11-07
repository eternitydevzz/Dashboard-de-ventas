import "server-only";
// Workflows, 4a-1 (docs/plan-workflows.md, aprobado por Cristian el 7 nov 2026): el motor, en MODO PRUEBA.
// - Al llegar un envío a una Entrada con workflow encendido se crea su ejecución (si ese lead ya tiene una esperando,
//   no se crea otra: se juntan, igual que hoy).
// - La lectura de cada minuto (/api/ghl/leer) avanza las que ya tocan: un tramo por lectura (los tramos se cortan en
//   cada «esperar»). Al final, en modo prueba, NO llama a GHL: calcula lo que mandaría y lo compara con lo que calcula
//   hoy «Qué hacer en GHL» de la Entrada (armarEnvioGhl). Queda `coincide` y, si no, las diferencias en `registro`.
// - Si falla: 5 intentos (uno por lectura) y después «error» con «Reintentar». En prueba no se manda email (Cristian).
// - El modo real llega en 4a-2: hasta entonces, una ejecución de un workflow «real» queda en error.
import { db } from "@/lib/datos";
import { armarEnvioGhl } from "@/lib/entrada-ghl";
import { aplanarPasos, compararEnvios, envioDeWorkflow, tramos, type Paso } from "@/lib/workflows";

type Json = Record<string, unknown>;
export const MAX_INTENTOS_WF = 5;
const POR_LECTURA = 10; // como el envío a GHL de hoy (src/lib/ghl-envios.ts)
const REINTENTAR_EN = 60_000;

type Ejecucion = { id: string; workflow_id: string; pasos: Paso[]; lead_id: string; entrada_id: string | null; tramo: number; intentos: number; registro: Json[] };
type EntradaGhl = { ghl_campos: Record<string, string> | null; ghl_pipeline_id: string | null; ghl_etapa_id: string | null; ghl_oportunidades: { pipeline_id: string; etapa_id: string | null }[] | null; ghl_etiqueta_base: string | null; ghl_etiquetas_extra: string[] | null; ghl_campo_completo: string | null };

const enSegundos = (ahora: Date, seg: number) => new Date(ahora.getTime() + seg * 1000).toISOString();

// Desde la dirección de la Entrada, después de guardar el envío. Nunca debe romper la Entrada: quien llama lo protege.
export async function crearEjecuciones(o: { proyectoId: string; entradaId: string; leadId: string; envio: Json; ahora?: Date }) {
  const ahora = o.ahora ?? new Date();
  const { data: wfs, error } = await db().from("workflows").select("id, version, pasos").eq("proyecto_id", o.proyectoId).eq("entrada_id", o.entradaId).eq("encendido", true);
  if (error) throw new Error(`workflows: ${error.message}`);
  let creadas = 0;
  for (const w of (wfs ?? []) as { id: string; version: number; pasos: Paso[] }[]) {
    const { data: ya } = await db().from("workflow_ejecuciones").select("id").eq("workflow_id", w.id).eq("lead_id", o.leadId).eq("estado", "esperando").limit(1);
    if (ya?.length) continue;
    const primera = tramos(aplanarPasos(w.pasos, [o.envio]))[0]?.espera ?? 0;
    const { error: e2 } = await db()
      .from("workflow_ejecuciones")
      .insert({ workflow_id: w.id, version: w.version, pasos: w.pasos, proyecto_id: o.proyectoId, lead_id: o.leadId, entrada_id: o.entradaId, siguiente_en: enSegundos(ahora, primera) });
    if (e2) throw new Error(`ejecución: ${e2.message}`);
    creadas++;
  }
  return creadas;
}

// Desde la lectura de cada minuto
export async function avanzarEjecuciones(proyectoId: string, o: { ahora?: Date; limite?: number } = {}) {
  const ahora = o.ahora ?? new Date();
  const r = { hechas: 0, ok: 0, errores: [] as string[] };
  const { data, error } = await db()
    .from("workflow_ejecuciones")
    .select("id, workflow_id, pasos, lead_id, entrada_id, tramo, intentos, registro")
    .eq("proyecto_id", proyectoId)
    .eq("estado", "esperando")
    .lte("siguiente_en", ahora.toISOString())
    .order("siguiente_en")
    .limit(o.limite ?? POR_LECTURA);
  if (error) throw new Error(`ejecuciones: ${error.message}`);
  const lista = (data ?? []) as Ejecucion[];
  if (!lista.length) return r;
  const { data: wfs } = await db().from("workflows").select("id, encendido, modo").in("id", [...new Set(lista.map((x) => x.workflow_id))]);
  const wf = new Map(((wfs ?? []) as { id: string; encendido: boolean; modo: string }[]).map((w) => [w.id, w]));

  for (const ej of lista) {
    r.hechas++;
    const w = wf.get(ej.workflow_id);
    if (!w?.encendido) {
      await cambiar(ej.id, { estado: "parada", registro: [...ej.registro, { tipo: "parada", hora: ahora.toISOString(), motivo: "El workflow está parado" }] });
      continue;
    }
    try {
      if (w.modo !== "prueba") throw new Error("El modo real aún no está (llega en la subfase 4a-2)");
      const hecho = await tramoEnPrueba(ej, ahora);
      await cambiar(ej.id, hecho);
      if (hecho.estado === "ok") r.ok++;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      const intentos = ej.intentos + 1;
      const final = intentos >= MAX_INTENTOS_WF;
      await cambiar(ej.id, final ? { estado: "error", intentos, error: msg } : { intentos, error: msg, siguiente_en: new Date(ahora.getTime() + REINTENTAR_EN).toISOString() });
      r.errores.push(`ejecución ${ej.id}: ${msg}`);
    }
  }
  return r;
}

// Un tramo en modo prueba: se apunta lo que se haría; en el último, se compara con lo de hoy
async function tramoEnPrueba(ej: Ejecucion, ahora: Date): Promise<Json> {
  if (!ej.entrada_id) throw new Error("Sin su Entrada no se puede comparar con lo de hoy");
  const { data: en, error: e1 } = await db().from("entradas").select("ghl_campos, ghl_pipeline_id, ghl_etapa_id, ghl_oportunidades, ghl_etiqueta_base, ghl_etiquetas_extra, ghl_campo_completo").eq("id", ej.entrada_id).maybeSingle<EntradaGhl>();
  if (e1 || !en) throw new Error(`No se encontró su Entrada${e1 ? `: ${e1.message}` : ""}`);
  // Todos los envíos del lead a esa Entrada, en orden (como enviarLead hoy)
  const { data: evs, error: e2 } = await db().from("webhook_eventos").select("payload").eq("entrada_id", ej.entrada_id).eq("lead_id", ej.lead_id).eq("procesado", true).order("recibido_en");
  if (e2) throw new Error(`No se pudieron leer los envíos del lead: ${e2.message}`);
  const envios = (evs ?? []).map((x) => (x.payload ?? {}) as Json);

  const ts = tramos(aplanarPasos(ej.pasos, envios));
  const actual = ts[ej.tramo];
  const registro = [...ej.registro, { tipo: "tramo", tramo: ej.tramo, pasos: (actual?.pasos ?? []).map((p) => `${p.id} (${p.tipo})`), hora: ahora.toISOString(), modo: "prueba" }];
  const siguiente = ts[ej.tramo + 1];
  if (siguiente) return { tramo: ej.tramo + 1, siguiente_en: enSegundos(ahora, siguiente.espera), intentos: 0, error: null, registro };

  const hoy = armarEnvioGhl(envios, {
    campos: en.ghl_campos ?? {},
    pipelineId: en.ghl_pipeline_id,
    etapaId: en.ghl_etapa_id,
    oportunidades: Array.isArray(en.ghl_oportunidades) ? en.ghl_oportunidades : [],
    etiquetaBase: en.ghl_etiqueta_base,
    etiquetasExtra: Array.isArray(en.ghl_etiquetas_extra) ? en.ghl_etiquetas_extra : [],
    campoCompleto: en.ghl_campo_completo ?? "",
  });
  const diferencias = compararEnvios(envioDeWorkflow(ej.pasos, envios), hoy);
  return { estado: "ok", coincide: diferencias.length === 0, error: null, registro: [...registro, { tipo: "comparacion", diferencias, envios: envios.length, hora: ahora.toISOString() }] };
}

async function cambiar(id: string, cambios: Json) {
  const { error } = await db().from("workflow_ejecuciones").update({ ...cambios, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`No se pudo guardar la ejecución: ${error.message}`);
}

export type ResumenWorkflow = { total: number; coinciden: number; no_coinciden: number; esperando: number; errores: number };
export async function resumenWorkflows(proyectoId: string) {
  const { data, error } = await db().rpc("resumen_workflows", { p_proyecto: proyectoId });
  if (error) throw new Error(`resumen_workflows: ${error.message}`);
  const m = new Map<string, ResumenWorkflow>();
  for (const f of (data ?? []) as ({ workflow_id: string } & Record<keyof ResumenWorkflow, number>)[])
    m.set(f.workflow_id, { total: Number(f.total), coinciden: Number(f.coinciden), no_coinciden: Number(f.no_coinciden), esperando: Number(f.esperando), errores: Number(f.errores) });
  return m;
}
