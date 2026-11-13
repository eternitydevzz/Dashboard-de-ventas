// Workflows, 4a (aprobado por Cristian el 7 nov 2026): lo que se calcula sin base de datos ni
// internet. Un workflow es un disparador + pasos; una rama abre caminos («si el campo…»). Para hablar con GHL se usan
// las MISMAS funciones de hoy: los pasos se convierten en la configuración de `armarEnvioGhl` (src/lib/entrada-ghl.ts).
// Se prueba en tests/unit/workflows.test.ts.
import { armarEnvioGhl, juntarEnvios, type ConfigGhl, type EnvioGhl } from "@/lib/entrada-ghl";
import { cumple, type Regla } from "@/lib/entrada";

type Json = Record<string, unknown>;

export type Condicion = Pick<Regla, "campo" | "operador" | "valor">;
export type Paso =
  | { id: string; tipo: "esperar"; segundos: number }
  | { id: string; tipo: "contacto_ghl"; campos: Record<string, string> }
  | { id: string; tipo: "etiquetas_ghl"; base: string | null; fijas: string[]; campo_completo: string }
  | { id: string; tipo: "oportunidad_ghl"; pipeline_id: string; etapa_id: string | null }
  | { id: string; tipo: "quitar_etiqueta_ghl"; etiqueta: string }
  | { id: string; tipo: "mover_dashboard"; pipeline_id: string; etapa_id: string | null }
  | { id: string; tipo: "rama"; caminos: { condicion: Condicion; pasos: Paso[] }[]; si_no: Paso[] };
export type PasoSimple = Exclude<Paso, { tipo: "rama" }>;
// Fase 4d (plan GHL 2.4, Cristian 8 nov 2026): también arranca al agendarse o cancelarse una cita
type EventoCita = "agendada" | "cancelada";
// A3 (plan GHL, Cristian 8 nov 2026): y cuando se pone una etiqueta (se compara en minúsculas)
export type Disparador = { tipo: "entrada"; entrada_id: string } | { tipo: "cita"; evento: EventoCita } | { tipo: "etiqueta"; etiqueta: string };
export type DisparoCita = { tipo: "cita"; evento: EventoCita; canal: string | null; calendario: string | null; fecha: string | null };
type DisparoEtiqueta = { tipo: "etiqueta"; etiqueta: string };
export type Disparo = DisparoCita | DisparoEtiqueta;
export type LeadParaEnvio = { nombre: string | null; apellido: string | null; email: string | null; telefono: string | null; seguimiento: unknown };
type WorkflowNuevo = { nombre: string; disparador: Disparador; pasos: Paso[] };

// Lo que hace falta de una Entrada para pasar su «Qué hacer en GHL» a workflow (columnas de `entradas`)
export type EntradaParaWorkflow = {
  id: string;
  nombre: string;
  ghl_campos: Record<string, string> | null;
  ghl_pipeline_id: string | null;
  ghl_etapa_id: string | null;
  ghl_oportunidades: { pipeline_id: string; etapa_id: string | null }[] | null;
  ghl_etiqueta_base: string | null;
  ghl_etiquetas_extra: string[] | null;
  ghl_espera_seg: number | null;
  ghl_campo_completo: string | null;
};

// «Qué hacer en GHL» → workflow: Esperar → Contacto → Etiquetas → una Oportunidad por pipeline (como enviarLead hoy)
export function workflowDeEntrada(en: EntradaParaWorkflow): WorkflowNuevo {
  const pasos: Paso[] = [];
  const espera = Math.max(0, Math.round(Number(en.ghl_espera_seg ?? 0)));
  if (espera) pasos.push({ id: "esperar-1", tipo: "esperar", segundos: espera });
  pasos.push({ id: "contacto-1", tipo: "contacto_ghl", campos: { ...(en.ghl_campos ?? {}) } });
  const fijas = en.ghl_etiquetas_extra ?? [];
  if (en.ghl_etiqueta_base || fijas.length) pasos.push({ id: "etiquetas-1", tipo: "etiquetas_ghl", base: en.ghl_etiqueta_base, fijas: [...fijas], campo_completo: en.ghl_campo_completo ?? "" });
  // La lista manda; vacía = el pipeline de siempre (igual que armarEnvioGhl)
  const lista = (en.ghl_oportunidades ?? []).filter((o) => o?.pipeline_id);
  const destinos = lista.length ? lista : en.ghl_pipeline_id ? [{ pipeline_id: en.ghl_pipeline_id, etapa_id: en.ghl_etapa_id }] : [];
  destinos.forEach((o, i) => pasos.push({ id: `oportunidad-${i + 1}`, tipo: "oportunidad_ghl", pipeline_id: o.pipeline_id, etapa_id: o.etapa_id ?? null }));
  return { nombre: en.nombre, disparador: { tipo: "entrada", entrada_id: en.id }, pasos };
}

// ¿Este disparador (columna `disparador`, sin validar) arranca con esta cita o esta etiqueta?
export function encajaDisparador(d: unknown, disparo: Disparo) {
  const x = d && typeof d === "object" ? (d as Json) : {};
  if (disparo.tipo === "etiqueta") return x.tipo === "etiqueta" && typeof x.etiqueta === "string" && x.etiqueta.trim().toLowerCase() === disparo.etiqueta.trim().toLowerCase();
  return x.tipo === "cita" && x.evento === disparo.evento;
}

// Sin Entrada no hay envío: se arma uno con los datos del lead y de la cita (o la etiqueta), con las claves que ya entiende todo
// (interpretar/armarEnvioGhl y las ramas «si el campo canal = dfy»). Sin vacíos.
export function envioSintetico(lead: LeadParaEnvio, disparo: Disparo): Json {
  const seg = lead.seguimiento && typeof lead.seguimiento === "object" ? (lead.seguimiento as Json) : {};
  const delDisparo = disparo.tipo === "cita" ? { canal: disparo.canal, calendario: disparo.calendario, fecha: disparo.fecha } : { etiqueta: disparo.etiqueta };
  const todo: Json = { first_name: lead.nombre, last_name: lead.apellido, email: lead.email, phone: lead.telefono, utm_source: seg.utm_source, ...delDisparo };
  return Object.fromEntries(Object.entries(todo).filter(([, v]) => v !== null && v !== undefined && v !== ""));
}

// Los pasos que hará ESTE lead: cada rama se resuelve con lo juntado de todos sus envíos (el primer camino que se
// cumple; si ninguno, «si no»)
export function aplanarPasos(pasos: Paso[], envios: Json[]): PasoSimple[] {
  const junto = juntarEnvios(envios);
  const aplanar = (lista: Paso[]): PasoSimple[] =>
    lista.flatMap((p) => {
      if (p.tipo !== "rama") return [p];
      const camino = p.caminos.find((c) => cumple(junto, c.condicion as Regla));
      return aplanar(camino ? camino.pasos : p.si_no);
    });
  return aplanar(pasos);
}

// Lo que se hace en cada lectura: corta en cada «esperar» (varias esperas seguidas se suman)
export function tramos(pasos: PasoSimple[]): { espera: number; pasos: PasoSimple[] }[] {
  const r: { espera: number; pasos: PasoSimple[] }[] = [];
  let actual: { espera: number; pasos: PasoSimple[] } = { espera: 0, pasos: [] };
  for (const p of pasos) {
    if (p.tipo === "esperar") {
      if (actual.pasos.length) r.push(actual);
      actual = { espera: (actual.pasos.length ? 0 : actual.espera) + Math.max(0, p.segundos), pasos: [] };
    } else actual.pasos.push(p);
  }
  if (actual.pasos.length) r.push(actual);
  return r;
}

// Los pasos de GHL → la configuración de armarEnvioGhl (campos de todos los «Contacto», el último «Etiquetas» manda,
// las fijas se suman, las oportunidades en orden)
export function configDePasos(pasos: PasoSimple[]): ConfigGhl {
  const c: ConfigGhl = { campos: {}, pipelineId: null, etapaId: null, oportunidades: [], etiquetaBase: null, etiquetasExtra: [], campoCompleto: "" };
  for (const p of pasos) {
    if (p.tipo === "contacto_ghl") c.campos = { ...c.campos, ...p.campos };
    if (p.tipo === "etiquetas_ghl") {
      c.etiquetaBase = p.base;
      c.etiquetasExtra = [...(c.etiquetasExtra ?? []), ...p.fijas];
      c.campoCompleto = p.campo_completo;
    }
    if (p.tipo === "oportunidad_ghl") c.oportunidades = [...(c.oportunidades ?? []), { pipeline_id: p.pipeline_id, etapa_id: p.etapa_id }];
  }
  return c;
}

// Lo que el workflow manda a GHL por este lead (lo mismo que calcula hoy enviarLead)
export function envioDeWorkflow(pasos: Paso[], envios: Json[]): EnvioGhl {
  return armarEnvioGhl(envios, configDePasos(aplanarPasos(pasos, envios)));
}

// Modo de prueba: diferencias entre lo que mandaría el workflow (`wf`) y lo que manda hoy (`hoy`). [] = coinciden.
// El orden de etiquetas y oportunidades no cuenta.
export function compararEnvios(wf: EnvioGhl, hoy: EnvioGhl): string[] {
  const d: string[] = [];
  const t = (v: unknown) => (v === undefined || v === null || v === "" ? "" : String(v));
  for (const k of ["firstName", "lastName", "email", "phone", "source"] as const)
    if (t(wf.contacto[k]) !== t(hoy.contacto[k])) d.push(`Contacto ${k}: el workflow manda «${t(wf.contacto[k])}» y hoy «${t(hoy.contacto[k])}»`);

  const cw = new Map(wf.customFields.map((x) => [x.id, x.field_value]));
  const ch = new Map(hoy.customFields.map((x) => [x.id, x.field_value]));
  for (const [id, v] of cw) {
    if (!ch.has(id)) d.push(`Campo ${id}: el workflow manda «${v}» y hoy no`);
    else if (ch.get(id) !== v) d.push(`Campo ${id}: el workflow manda «${v}» y hoy «${ch.get(id)}»`);
  }
  for (const [id, v] of ch) if (!cw.has(id)) d.push(`Campo ${id}: hoy manda «${v}» y el workflow no`);

  const ew = new Set(wf.etiquetas);
  const eh = new Set(hoy.etiquetas);
  for (const e of ew) if (!eh.has(e)) d.push(`Etiquetas: el workflow pone «${e}» y hoy no`);
  for (const e of eh) if (!ew.has(e)) d.push(`Etiquetas: hoy se pone «${e}» y el workflow no`);

  if (t(wf.quitar) !== t(hoy.quitar)) d.push(`Quitar etiqueta: el workflow ${wf.quitar ? `quita «${wf.quitar}»` : "no quita nada"} y hoy ${hoy.quitar ? `quita «${hoy.quitar}»` : "no quita nada"}`);

  const clave = (o: { pipelineId: string; etapaId: string | null }) => `${o.pipelineId}|${o.etapaId ?? ""}`;
  const donde = (o: { pipelineId: string; etapaId: string | null }) => `«${o.pipelineId}» (${o.etapaId ? `columna «${o.etapaId}»` : "primera columna"})`;
  const ow = new Map(wf.oportunidades.map((o) => [clave(o), o]));
  const oh = new Map(hoy.oportunidades.map((o) => [clave(o), o]));
  for (const [k, o] of ow) if (!oh.has(k)) d.push(`Oportunidades: el workflow crea en ${donde(o)} y hoy no`);
  for (const [k, o] of oh) if (!ow.has(k)) d.push(`Oportunidades: hoy se crea en ${donde(o)} y el workflow no`);
  return d;
}
