import "server-only";
// Workflows, 4a-1 (docs/plan-workflows.md, aprobado por Cristian el 7 nov 2026): el motor, en MODO PRUEBA.
// - Al llegar un envío a una Entrada con workflow encendido se crea su ejecución (si ese lead ya tiene una esperando,
//   no se crea otra: se juntan, igual que hoy).
// - La lectura de cada minuto (/api/ghl/leer) avanza las que ya tocan: un tramo por lectura (los tramos se cortan en
//   cada «esperar»). Al final, en modo prueba, NO llama a GHL: calcula lo que mandaría y lo compara con lo que calcula
//   hoy «Qué hacer en GHL» de la Entrada (armarEnvioGhl). Queda `coincide` y, si no, las diferencias en `registro`.
// - Si falla: 5 intentos (uno por lectura) y después «error» con «Reintentar». En prueba no se manda email (Cristian).
// - 4a-2, MODO REAL (Cristian, 7 nov): cada tramo hace sus pasos de GHL con `mandarEnvioGhl`, las MISMAS llamadas que
//   hoy hace «Qué hacer en GHL». Al 5.º fallo, además, email a info@eternity.llc (como hoy). «Mover en el dashboard»
//   mueve el lead (o su tarjeta) en el dashboard (Cristian, 7 nov).
import { db } from "@/lib/datos";
import { moverLeadDashboard } from "@/lib/leads";
import { armarEnvioGhl } from "@/lib/entrada-ghl";
import { avisarPorEmail, mandarEnvioGhl, ESPERA_429, MAX_ESPERA_429, MAX_LEADS_POR_LECTURA, type Avisar, type CacheGhl } from "@/lib/ghl-envios";
import { GhlEsperar } from "@/lib/ghl";
import { aplanarPasos, compararEnvios, configDePasos, encajaDisparador, envioDeWorkflow, envioSintetico, tramos, type DisparoCita, type LeadParaEnvio, type Paso, type PasoSimple } from "@/lib/workflows";

export type GhlParaWorkflows = { locationId: string; token: string; fetchImpl?: typeof fetch; avisar?: Avisar };

type Json = Record<string, unknown>;
export const MAX_INTENTOS_WF = 5;
const REINTENTAR_EN = 50_000; // como los envíos de las Entradas: lo coge la lectura del minuto (src/lib/ghl-envios.ts)

type Ejecucion = { id: string; workflow_id: string; pasos: Paso[]; lead_id: string; entrada_id: string | null; tramo: number; intentos: number; registro: Json[]; creado_en: string };
type EntradaGhl = { ghl_campos: Record<string, string> | null; ghl_pipeline_id: string | null; ghl_etapa_id: string | null; ghl_oportunidades: { pipeline_id: string; etapa_id: string | null }[] | null; ghl_etiqueta_base: string | null; ghl_etiquetas_extra: string[] | null; ghl_campo_completo: string | null };

const enSegundos = (ahora: Date, seg: number) => new Date(ahora.getTime() + seg * 1000).toISOString();

// Desde la dirección de la Entrada, después de guardar el envío. Nunca debe romper la Entrada: quien llama lo protege.
export async function crearEjecuciones(o: { proyectoId: string; entradaId: string; leadId: string; envio: Json; ahora?: Date }) {
  const ahora = o.ahora ?? new Date();
  const { data: wfs, error } = await db().from("workflows").select("id, version, pasos").eq("proyecto_id", o.proyectoId).eq("entrada_id", o.entradaId).eq("encendido", true);
  if (error) throw new Error(`workflows: ${error.message}`);
  return crearPara((wfs ?? []) as Wf[], { proyectoId: o.proyectoId, leadId: o.leadId, entradaId: o.entradaId, envio: o.envio, ahora });
}

// Fase 4d (plan GHL 2.4, Cristian 8 nov 2026): se agenda o se cancela una cita → los workflows encendidos del proyecto
// con ese disparador. Sin Entrada: el envío es sintético (lead + cita) y se guarda en el registro de la ejecución
// (`{tipo:"disparo"}`), que es de donde lo leen sus tramos. Nunca debe romper a quien llama: que lo proteja.
export async function dispararWorkflows(proyectoId: string, leadId: string, disparo: DisparoCita, ahora = new Date()) {
  const { data: wfs, error } = await db().from("workflows").select("id, version, pasos, disparador").eq("proyecto_id", proyectoId).eq("encendido", true).eq("disparador->>tipo", "cita");
  if (error) throw new Error(`workflows: ${error.message}`);
  const suyos = ((wfs ?? []) as (Wf & { disparador: unknown })[]).filter((w) => encajaDisparador(w.disparador, disparo));
  if (!suyos.length) return 0;
  const { data: lead, error: e1 } = await db().from("leads").select("nombre, apellido, email, telefono, seguimiento").eq("id", leadId).eq("proyecto_id", proyectoId).maybeSingle<LeadParaEnvio>();
  if (e1) throw new Error(`lead: ${e1.message}`);
  if (!lead) return 0;
  const envio = envioSintetico(lead, disparo);
  return crearPara(suyos, { proyectoId, leadId, entradaId: null, envio, ahora, registro: [{ tipo: "disparo", evento: disparo.evento, envio, hora: ahora.toISOString() }] });
}

type Wf = { id: string; version: number; pasos: Paso[] };
// Una ejecución por workflow; si ese lead ya tiene una esperando de ese workflow, no se crea otra (se juntan, como hoy)
async function crearPara(wfs: Wf[], o: { proyectoId: string; leadId: string; entradaId: string | null; envio: Json; ahora: Date; registro?: Json[] }) {
  let creadas = 0;
  for (const w of wfs) {
    const { data: ya, error: e1 } = await db().from("workflow_ejecuciones").select("id").eq("workflow_id", w.id).eq("lead_id", o.leadId).eq("estado", "esperando").limit(1);
    if (e1) throw new Error(`ejecuciones: ${e1.message}`);
    if (ya?.length) continue;
    const primera = enSegundos(o.ahora, tramos(aplanarPasos(w.pasos, [o.envio]))[0]?.espera ?? 0);
    // «inicio»: cuándo debe salir el 1.er tramo (el 429 mide desde ahí; sin `modo`, no lo cuenta el aviso de bucle)
    const registro = [...(o.registro ?? []), { tipo: "inicio", siguiente_en: primera }];
    const { error: e2 } = await db()
      .from("workflow_ejecuciones")
      .insert({ workflow_id: w.id, version: w.version, pasos: w.pasos, proyecto_id: o.proyectoId, lead_id: o.leadId, entrada_id: o.entradaId, siguiente_en: primera, registro });
    if (e2) throw new Error(`ejecución: ${e2.message}`);
    creadas++;
  }
  return creadas;
}

// Desde la lectura de cada minuto
export async function avanzarEjecuciones(proyectoId: string, o: { ahora?: Date; limite?: number; ghl?: GhlParaWorkflows } = {}) {
  const ahora = o.ahora ?? new Date();
  const r = { hechas: 0, ok: 0, errores: [] as string[] };
  if (o.limite !== undefined && o.limite <= 0) return r;
  const { data, error } = await db()
    .from("workflow_ejecuciones")
    .select("id, workflow_id, pasos, lead_id, entrada_id, tramo, intentos, registro, creado_en")
    .eq("proyecto_id", proyectoId)
    .eq("estado", "esperando")
    .lte("siguiente_en", ahora.toISOString())
    .order("siguiente_en")
    .limit(o.limite ?? MAX_LEADS_POR_LECTURA);
  if (error) throw new Error(`ejecuciones: ${error.message}`);
  const lista = (data ?? []) as Ejecucion[];
  if (!lista.length) return r;
  const { data: wfs, error: errWf } = await db().from("workflows").select("id, nombre, encendido, modo").in("id", [...new Set(lista.map((x) => x.workflow_id))]);
  if (errWf) throw new Error(`workflows: ${errWf.message}`);
  const wf = new Map(((wfs ?? []) as { id: string; nombre: string; encendido: boolean; modo: string }[]).map((w) => [w.id, w]));
  const cache: CacheGhl = {}; // las columnas de GHL, una vez por vuelta (mejora «menos llamadas», 7 nov)

  for (const ej of lista) {
    r.hechas++;
    const w = wf.get(ej.workflow_id);
    if (!w?.encendido) {
      await cambiar(ej.id, { estado: "parada", registro: [...ej.registro, { tipo: "parada", hora: ahora.toISOString(), motivo: "El workflow está parado" }] });
      continue;
    }
    try {
      const hecho = w.modo === "real" ? await tramoReal(proyectoId, ej, ahora, o.ghl, cache) : await tramoEnPrueba(ej, ahora);
      await cambiar(ej.id, hecho);
      if (hecho.estado === "ok") r.ok++;
    } catch (e) {
      // 429: espera a la lectura siguiente sin gastar intento y se corta; pasados 30 min desde que este tramo debía
      // salir, fallo normal
      if (e instanceof GhlEsperar && ahora.getTime() - debiaSalir(ej) <= MAX_ESPERA_429) {
        await cambiar(ej.id, { siguiente_en: new Date(ahora.getTime() + ESPERA_429).toISOString() });
        break;
      }
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      const intentos = ej.intentos + 1;
      const final = intentos >= MAX_INTENTOS_WF;
      await cambiar(ej.id, final ? { estado: "error", intentos, error: msg } : { intentos, error: msg, siguiente_en: new Date(ahora.getTime() + REINTENTAR_EN).toISOString() });
      r.errores.push(`ejecución ${ej.id}: ${msg}`);
      // Como hoy: en real, al último intento, email (en prueba no: Cristian, 7 nov)
      if (final && w.modo === "real") {
        const { data: l } = await db().from("leads").select("email, telefono, nombre").eq("id", ej.lead_id).maybeSingle();
        await (o.ghl?.avisar ?? avisarPorEmail)({ entrada: w.nombre, lead: l?.email || l?.telefono || l?.nombre || ej.lead_id, error: msg }).catch((x) => console.error("[workflows] aviso:", x));
      }
    }
  }
  return r;
}

// Un tramo en modo prueba: se apunta lo que se haría; en el último, se compara con lo de hoy.
// Sin Entrada (disparo por cita, 4d): no hay «lo de hoy» con qué comparar → termina ok sin comparar (Cristian, 8 nov).
async function tramoEnPrueba(ej: Ejecucion, ahora: Date): Promise<Json> {
  if (!ej.entrada_id) {
    const ts = tramos(aplanarPasos(ej.pasos, await enviosDe(ej)));
    const t = trasTramo(ej, ts, ahora, "prueba");
    return t.siguiente ?? { estado: "ok", error: null, registro: t.registro };
  }
  const { data: en, error: e1 } = await db().from("entradas").select("ghl_campos, ghl_pipeline_id, ghl_etapa_id, ghl_oportunidades, ghl_etiqueta_base, ghl_etiquetas_extra, ghl_campo_completo").eq("id", ej.entrada_id).maybeSingle<EntradaGhl>();
  if (e1 || !en) throw new Error(`No se encontró su Entrada${e1 ? `: ${e1.message}` : ""}`);
  // Todos los envíos del lead a esa Entrada, en orden (como enviarLead hoy)
  const { data: evs, error: e2 } = await db().from("webhook_eventos").select("payload").eq("entrada_id", ej.entrada_id).eq("lead_id", ej.lead_id).eq("procesado", true).order("recibido_en");
  if (e2) throw new Error(`No se pudieron leer los envíos del lead: ${e2.message}`);
  const envios = (evs ?? []).map((x) => (x.payload ?? {}) as Json);

  const ts = tramos(aplanarPasos(ej.pasos, envios));
  const { registro, siguiente } = trasTramo(ej, ts, ahora, "prueba");
  if (siguiente) return siguiente;

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

// Los envíos del lead a la Entrada de su ejecución, en orden (como enviarLead hoy). Sin Entrada: el sintético del disparo.
async function enviosDe(ej: Ejecucion) {
  if (!ej.entrada_id) return ej.registro.filter((r) => r.tipo === "disparo").map((r) => (r.envio ?? {}) as Json);
  const { data: evs, error } = await db().from("webhook_eventos").select("payload").eq("entrada_id", ej.entrada_id).eq("lead_id", ej.lead_id).eq("procesado", true).order("recibido_en");
  if (error) throw new Error(`No se pudieron leer los envíos del lead: ${error.message}`);
  return (evs ?? []).map((x) => (x.payload ?? {}) as Json);
}

// Un tramo en MODO REAL: sus pasos de GHL con las mismas llamadas que hoy (mandarEnvioGhl)
async function tramoReal(proyectoId: string, ej: Ejecucion, ahora: Date, ghl: GhlParaWorkflows | undefined, cache?: CacheGhl): Promise<Json> {
  if (!ghl) throw new Error("GHL no está conectado en este proyecto: no se puede mandar");
  const envios = await enviosDe(ej);
  const ts = tramos(aplanarPasos(ej.pasos, envios));
  const actual = ts[ej.tramo];
  const pasos: PasoSimple[] = actual?.pasos ?? [];
  const deGhl = pasos.filter((p) => p.tipo === "contacto_ghl" || p.tipo === "etiquetas_ghl" || p.tipo === "oportunidad_ghl" || p.tipo === "quitar_etiqueta_ghl");
  if (deGhl.length) {
    const envio = armarEnvioGhl(envios, configDePasos(deGhl));
    const quitarExtra = deGhl.flatMap((p) => (p.tipo === "quitar_etiqueta_ghl" ? [p.etiqueta] : []));
    await mandarEnvioGhl({ proyectoId, locationId: ghl.locationId, token: ghl.token, envio, leadId: ej.lead_id, quitarExtra, fetchImpl: ghl.fetchImpl, cache });
  }
  // «Mover en el dashboard» (Cristian, 7 nov): después de GHL, en el orden del tramo
  for (const p of pasos) if (p.tipo === "mover_dashboard") await moverLeadDashboard(proyectoId, ej.lead_id, p.pipeline_id, p.etapa_id);
  const t = trasTramo(ej, ts, ahora, "real");
  return t.siguiente ?? { estado: "ok", error: null, registro: t.registro };
}

// El registro del tramo hecho y, si hay otro, lo que toca: su `siguiente_en` también queda en el registro, porque la
// columna se pisa con cada reintento y el 429 mide sus 30 min desde que el tramo DEBÍA salir (debiaSalir)
function trasTramo(ej: Ejecucion, ts: ReturnType<typeof tramos>, ahora: Date, modo: "prueba" | "real") {
  const sig = ts[ej.tramo + 1];
  const siguienteEn = sig ? enSegundos(ahora, sig.espera) : null;
  const registro = [...ej.registro, { tipo: "tramo", tramo: ej.tramo, pasos: (ts[ej.tramo]?.pasos ?? []).map((p) => `${p.id} (${p.tipo})`), hora: ahora.toISOString(), modo, ...(siguienteEn ? { siguiente_en: siguienteEn } : {}) }];
  return { registro, siguiente: siguienteEn ? { tramo: ej.tramo + 1, siguiente_en: siguienteEn, intentos: 0, error: null, registro } : null };
}

// Cuándo debía salir el tramo que toca: lo que apuntó el tramo anterior (o el «inicio», para el 1.º); sin eso
// (ejecuciones de antes), creado_en
function debiaSalir(ej: Ejecucion) {
  const ultimo = ej.registro.filter((x) => x.tipo === "tramo" || x.tipo === "inicio").at(-1);
  const t = typeof ultimo?.siguiente_en === "string" ? new Date(ultimo.siguiente_en).getTime() : NaN;
  return Number.isNaN(t) ? new Date(ej.creado_en).getTime() : t;
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
