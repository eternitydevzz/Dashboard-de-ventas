"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Trash2, RefreshCw, Save, Power, ArrowUp, ArrowDown, X } from "lucide-react";
import { sinVaciar } from "@/components/sin-vaciar";
import { useAccion, Mensajes } from "@/components/acciones-lead";
import { Copiar } from "./cliente";
import { borrarEntrada, cambiarActivaEntrada, crearEntrada, guardarEntradaCompleta, moverEntrada, nuevaDireccionEntrada } from "./acciones";
import { OPERADORES, type Regla } from "@/lib/entrada";
import { direccionCorta, estadoEntrada, jsonEjemplo, type DatosLanding, type EnviaDesde } from "@/lib/entradas-panel";
import type { EnvioEntrada, ResumenEntrada } from "@/lib/entradas-datos";
import { confirmar } from "@/components/dialogos";
import { Modal } from "@/components/modal";
import { Desplegable, Pastillas } from "@/components/eleccion";
import { EnviosEnRojo, UltimosEnvios } from "./entradas-envios";
import { LineaWorkflow, type WorkflowVista } from "./entradas-workflow";
import type { Proyecto } from "@/lib/tipos";

type Pipe = { id: string; nombre: string; etapas: { id: string; nombre: string }[] };
type Res = { ok?: string; error?: string } | null;

function SelectorDestino({
  pipelines,
  pipeline,
  etapa,
  onCambio,
  vacio = "Sin pipeline",
}: {
  pipelines: Pipe[];
  pipeline: string | null;
  etapa: string | null;
  onCambio: (p: string | null, e: string | null) => void;
  vacio?: string;
}) {
  const etapas = pipelines.find((p) => p.id === pipeline)?.etapas ?? [];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Desplegable className="campo" value={pipeline ?? ""} onChange={(e) => onCambio(e.target.value || null, null)} aria-label="Pipeline">
        <option value="">{vacio}</option>
        {pipelines.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </Desplegable>
      <Desplegable className="campo" value={etapa ?? ""} disabled={!pipeline} onChange={(e) => onCambio(pipeline, e.target.value || null)} aria-label="Columna">
        <option value="">Primera columna</option>
        {etapas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
      </Desplegable>
    </div>
  );
}

// «Desde dónde manda los datos»: en palabras de principiante (null = «No lo sé»)
const OPCIONES_DESDE: { v: "" | EnviaDesde; t: string; ayuda: string }[] = [
  { v: "navegador", t: "Desde la página", ayuda: "Lo normal en una landing o en GHL." },
  { v: "servidor", t: "Desde un servidor", ayuda: "Si el programador te dice que va por servidor." },
  { v: "ghl", t: "Desde un workflow de GHL", ayuda: "Si los datos los manda GHL. Así no puede mandar a GHL: sería un círculo sin fin." },
  { v: "", t: "No lo sé", ayuda: "Se puede cambiar después." },
];

// Con `onCambio` va controlado (ajustes); sin él, lo lleva el formulario (al vaciarlo vuelve a `valor`)
function ElegirDesde({ nombre, valor, onCambio }: { nombre: string; valor: string; onCambio?: (v: string) => void }) {
  return (
    <div className="grid gap-2">
      {OPCIONES_DESDE.map((o) => (
        <label key={o.v || "no-se"} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-borde px-3 py-2 text-sm has-[:checked]:border-primario has-[:checked]:bg-primario-suave">
          <input type="radio" name={nombre} value={o.v} className="mt-1" {...(onCambio ? { checked: valor === o.v, onChange: () => onCambio(o.v) } : { defaultChecked: valor === o.v })} />
          <span>{o.t}<span className="block text-xs text-texto-3">{o.ayuda}</span></span>
        </label>
      ))}
    </div>
  );
}

// ---------- Conectar una landing nueva (5 preguntas) ----------
export function NuevaEntrada({ pipelines }: { pipelines: Pipe[] }) {
  const [estado, accion, enviando] = useActionState(crearEntrada, null as Res);
  const [destino, setDestino] = useState<{ p: string | null; e: string | null }>({ p: pipelines[0]?.id ?? null, e: null });
  // 1.1 (11 oct 2026): al crearla, el formulario se vacía (antes se podía crear dos veces); si falla, se queda
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado?.ok) form.current?.reset();
  }, [estado]);
  return (
    <form ref={form} onSubmit={sinVaciar(accion)} className="space-y-3">
      <label className="block"><span className="etiqueta-campo">1 · ¿Cómo se llama?</span><input name="nombre" required className="campo" placeholder="Ej. Web · Código Maestria agenda" /><span className="mt-1 block text-xs text-texto-3">Para reconocerla en esta lista.</span></label>
      <label className="block"><span className="etiqueta-campo">2 · ¿Qué landing es?</span><input name="landing" className="campo" placeholder="Ej. codigomaestria" /></label>
      <label className="block"><span className="etiqueta-campo">3 · ¿Qué formulario?</span><input name="formulario" className="campo" placeholder="Ej. agenda" /></label>
      <div><span className="etiqueta-campo">4 · ¿Desde dónde manda los datos?</span><ElegirDesde nombre="envia_desde" valor="navegador" /></div>
      <div>
        <span className="etiqueta-campo">5 · ¿A qué pipeline van sus leads?</span>
        <SelectorDestino pipelines={pipelines} pipeline={destino.p} etapa={destino.e} onCambio={(p, e) => setDestino({ p, e })} />
        <span className="mt-1 block text-xs text-texto-3">Se puede cambiar después.</span>
        <input type="hidden" name="pipeline_id" value={destino.p ?? ""} />
        <input type="hidden" name="etapa_id" value={destino.e ?? ""} />
      </div>
      <Mensajes error={estado?.error ?? ""} ok={estado?.ok ?? ""} />
      <button className="btn-primario w-full" disabled={enviando}>{enviando ? "Creando…" : "Crear y ver su dirección"}</button>
    </form>
  );
}

// ---------- Plan GHL, fase 1 (Cristian, 6 nov 2026): «Qué hacer en GHL» ----------
export type OpcionesGhl = {
  campos: { id: string; name: string }[];
  pipelines: { id: string; nombre: string; etapas: { id: string; nombre: string }[] }[];
  error: string | null;
};
export type GhlDeEntrada = {
  ghl_activo: boolean;
  ghl_campos: Record<string, string>;
  ghl_pipeline_id: string | null;
  ghl_etapa_id: string | null;
  ghl_oportunidades: { pipeline_id: string; etapa_id: string | null }[];
  ghl_etiqueta_base: string | null;
  ghl_etiquetas_extra: string[];
  ghl_espera_seg: number;
  ghl_campo_completo: string;
};

export type EntradaVista = DatosLanding & {
  id: string;
  nombre: string;
  url: string;
  activa: boolean;
  pipeline_id: string | null;
  etapa_id: string | null;
  reglas: Regla[];
  campos: string[]; // los nombres de campo que han llegado (para elegir en reglas y en GHL)
  ghl: GhlDeEntrada;
};

// Barras de envíos por día (la de hoy, en color lleno). SVG puro con los colores de la app
function MiniBarras({ dias }: { dias: number[] }) {
  const max = Math.max(1, ...dias);
  const w = 140;
  const h = 36;
  const bw = w / Math.max(1, dias.length);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Envíos por día, últimos ${dias.length} días`}>
      {dias.map((n, i) => {
        const alto = (n / max) * (h - 4) + 2;
        return (
          <rect key={i} x={i * bw + 1} y={h - alto} width={Math.max(1, bw - 2)} height={alto} rx={1.5} fill={i === dias.length - 1 ? "var(--primario)" : "color-mix(in srgb, var(--primario) 45%, transparent)"}>
            <title>{`${n} ${n === 1 ? "envío" : "envíos"}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// «＋ Conectar una landing»: las 5 preguntas de siempre, ahora en una ventana (maqueta v1, Cristian 11 nov 2026)
export function BotonNuevaEntrada({ pipelines }: { pipelines: Pipe[] }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" className="btn-primario" onClick={() => setAbierta(true)}>
        <Plus className="h-4 w-4" /> Conectar una landing
      </button>
      {abierta && (
        <Modal titulo="Conectar una landing nueva" onCerrar={() => setAbierta(false)}>
          <NuevaEntrada pipelines={pipelines} />
        </Modal>
      )}
    </>
  );
}

// ---------- Tarjeta de cada Entrada (boceto v2 del 7 nov; rediseño con la maqueta v1, Cristian 11 nov 2026) ----------
export function TarjetaEntrada({
  entrada,
  resumen,
  ultimo,
  rojos,
  ultimos,
  zona,
  pipelines,
  opciones,
  workflow,
  dias,
}: {
  entrada: EntradaVista;
  workflow: WorkflowVista | null;
  dias: number[]; // envíos por día, del más antiguo a hoy
  resumen: ResumenEntrada;
  ultimo: string | null; // «hace 18 min» (calculado en el servidor)
  rojos: EnvioEntrada[];
  ultimos: EnvioEntrada[];
  zona: Proyecto["zona_horaria"];
  pipelines: Pipe[];
  opciones: OpcionesGhl | null;
}) {
  const estado = estadoEntrada({ activa: entrada.activa, ghl_activo: entrada.ghl.ghl_activo, envios: resumen.envios, rojos: resumen.rojos, por_workflow: workflow?.modo === "real" });
  const viene = entrada.landing || entrada.formulario;
  const enPrueba = workflow?.modo === "prueba";
  return (
    <section className="tarjeta flex min-w-0 flex-col p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold" title={entrada.nombre}>{entrada.nombre}</h2>
        <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${enPrueba ? "bg-aviso-suave text-aviso-texto" : estado.tono === "ok" ? "bg-ok-suave text-ok-texto" : "bg-panel-2 text-texto-3 ring-1 ring-borde"}`}>
          {enPrueba ? "Workflow en prueba" : `${estado.tono === "ok" ? "● " : ""}${estado.texto}`}
        </span>
        <BotonesCabecera id={entrada.id} />
      </div>
      <p className={`mt-0.5 truncate text-xs ${viene ? "text-texto-2" : "text-texto-3"}`}>
        {viene ? <>Landing <b>{entrada.landing ?? "—"}</b> · formulario <b>{entrada.formulario ?? "—"}</b></> : "Sin landing apuntada (se pone en «Cambiar ajustes»)"}
      </p>
      {/* Rediseño (maqueta v1, Cristian 11 nov 2026): el número grande y el gráfico de envíos por día */}
      <div className="mt-3 flex items-end gap-4">
        <div className="shrink-0">
          <div className="text-3xl font-semibold leading-none tracking-tight tabular-nums">{resumen.leads.toLocaleString("es-ES")}</div>
          <div className="mt-1 text-xs text-texto-3">{resumen.leads === 1 ? "lead" : "leads"}{ultimo ? ` · último ${ultimo}` : ""}</div>
        </div>
        <div className="min-w-0 flex-1">
          <MiniBarras dias={dias} />
          <div className="text-right text-[11px] text-texto-3">{dias.length} días · hoy {dias.at(-1) ?? 0}</div>
        </div>
      </div>
      {estado.ghl && <p className={`mt-2 text-xs ${estado.ghl === "Todos llegaron a GHL" ? "font-medium text-ok-texto" : "text-texto-3"}`}>{estado.ghl === "Todos llegaron a GHL" ? "✓ " : ""}{estado.ghl}</p>}
      <EnviosEnRojo rojos={rojos} zona={zona} />
      <LineaWorkflow entradaId={entrada.id} workflow={workflow} puedeProbar={entrada.ghl.ghl_activo} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-[1_1_260px] break-all rounded-lg border border-borde bg-panel-2 px-3 py-2.5 text-xs text-texto-3">{direccionCorta(entrada.url)}</code>
        <Copiar texto={entrada.url} etiqueta="Copiar dirección" className="btn-primario w-full sm:w-auto" />
      </div>

      <details className="mt-4 border-t border-borde pt-3">
        <summary className="cursor-pointer text-sm font-semibold text-texto-2">Ver los últimos leads ({resumen.envios} envíos)</summary>
        <UltimosEnvios entradaId={entrada.id} total={resumen.envios} iniciales={ultimos} zona={zona} />
      </details>
      <details className="mt-3 border-t border-borde pt-3">
        <summary className="cursor-pointer text-sm font-semibold text-texto-2">Cambiar ajustes</summary>
        {/* Se vuelve a montar (con lo guardado) solo cuando cambia lo guardado de ESTA Entrada */}
        <AjustesEntrada key={JSON.stringify([entrada.nombre, entrada.activa, entrada.pipeline_id, entrada.etapa_id, entrada.reglas, entrada.landing, entrada.formulario, entrada.envia_desde, entrada.archivo, entrada.ghl])} entrada={entrada} pipelines={pipelines} opciones={opciones} />
      </details>
      <details className="mt-3 border-t border-borde pt-3">
        <summary className="cursor-pointer text-sm font-semibold text-texto-2">Para el programador</summary>
        <div className="mt-2 space-y-2 text-sm text-texto-2">
          <p>
            {entrada.envia_desde === "ghl" ? "Lo manda un workflow de GHL" : entrada.envia_desde === "servidor" ? "Lo manda un servidor" : entrada.envia_desde === "navegador" ? "Lo manda la página (desde el navegador)" : "No está apuntado desde dónde lo manda"}
            {entrada.archivo ? <> (<code className="rounded bg-panel-2 px-1">{entrada.archivo}</code>)</> : null}. Hace un POST con este JSON a la dirección de arriba.
          </p>
          <Copiar texto={JSON.stringify(jsonEjemplo(entrada), null, 2)} etiqueta="Copiar ejemplo de lo que tiene que mandar" />
          <p className="text-xs text-texto-3">El ejemplo no lleva la clave: la dirección se copia aparte y no se pega en documentos del equipo.</p>
        </div>
      </details>
    </section>
  );
}

const REGLA_VACIA: Regla = { campo: "", operador: "igual", valor: "", pipeline_id: null, etapa_id: null, etiqueta: "" };

// Lo que se guardaría con estos valores (también sirve para saber si hay cambios sin guardar)
type EstadoAjustes = {
  nombre: string;
  landing: string;
  formulario: string;
  desde: string;
  archivo: string;
  destino: { p: string | null; e: string | null };
  reglas: Regla[];
  ghlActivo: boolean;
  filas: { campo: string; id: string }[];
  opps: { pipeline: string; etapa: string }[];
  base: string;
  extra: string;
  espera: string;
  completo: string;
};
function estadoInicial(en: EntradaVista): EstadoAjustes {
  const g = en.ghl;
  return {
    nombre: en.nombre,
    landing: en.landing ?? "",
    formulario: en.formulario ?? "",
    desde: en.envia_desde ?? "",
    archivo: en.archivo ?? "",
    destino: { p: en.pipeline_id, e: en.etapa_id },
    reglas: en.reglas,
    ghlActivo: g.ghl_activo,
    filas: Object.entries(g.ghl_campos ?? {}).map(([campo, id]) => ({ campo, id })),
    // Plan GHL, B (7 nov): varias oportunidades. Una Entrada de antes (sin lista) enseña su pipeline de siempre
    opps: g.ghl_oportunidades?.length ? g.ghl_oportunidades.map((o) => ({ pipeline: o.pipeline_id, etapa: o.etapa_id ?? "" })) : g.ghl_pipeline_id ? [{ pipeline: g.ghl_pipeline_id, etapa: g.ghl_etapa_id ?? "" }] : [],
    base: g.ghl_etiqueta_base ?? "",
    extra: (g.ghl_etiquetas_extra ?? []).join(", "),
    espera: String(g.ghl_espera_seg ?? 60),
    completo: g.ghl_campo_completo ?? "quiz_completed",
  };
}
function paraGuardar(s: EstadoAjustes, conGhl: boolean) {
  return {
    entrada: { nombre: s.nombre, pipeline_id: s.destino.p, etapa_id: s.destino.e, reglas: s.reglas.filter((r) => r.campo.trim()), landing: s.landing, formulario: s.formulario, envia_desde: s.desde, archivo: s.archivo },
    ghl: conGhl
      ? {
          activo: s.ghlActivo,
          campos: Object.fromEntries(s.filas.filter((f) => f.campo.trim() && f.id).map((f) => [f.campo.trim(), f.id])),
          oportunidades: s.opps.filter((o) => o.pipeline).map((o) => ({ pipeline_id: o.pipeline, etapa_id: o.etapa || null })),
          etiqueta_base: s.base,
          etiquetas_extra: s.extra.split(","),
          espera_seg: Number(s.espera),
          campo_completo: s.completo,
        }
      : null,
  };
}

function AjustesEntrada({ entrada, pipelines, opciones }: { entrada: EntradaVista; pipelines: Pipe[]; opciones: OpcionesGhl | null }) {
  const { pendiente, error, ejecutar } = useAccion();
  const [inicial] = useState(() => estadoInicial(entrada));
  const [s, setS] = useState(inicial);
  const pon = (c: Partial<EstadoAjustes>) => setS((x) => ({ ...x, ...c }));
  const sinGuardar = JSON.stringify(paraGuardar(s, !!opciones)) !== JSON.stringify(paraGuardar(inicial, !!opciones));
  // Con cambios sin guardar, el navegador avisa antes de salir o recargar (también si se recarga sola al publicar)
  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  const cambiarRegla = (i: number, c: Partial<Regla>) => pon({ reglas: s.reglas.map((r, j) => (j === i ? { ...r, ...c } : r)) });
  const cambiarFila = (i: number, c: Partial<{ campo: string; id: string }>) => pon({ filas: s.filas.map((f, j) => (j === i ? { ...f, ...c } : f)) });
  const cambiarOpp = (i: number, c: Partial<{ pipeline: string; etapa: string }>) => pon({ opps: s.opps.map((o, j) => (j === i ? { ...o, ...c } : o)) });
  const nombreCampo = (id: string) => opciones?.campos.find((c) => c.id === id)?.name;
  const listaCampos = `campos-${entrada.id}`;

  return (
    <div className="mt-3 space-y-4">
      {sinGuardar && <p className="rounded-lg bg-aviso-suave px-3 py-2 text-sm text-aviso">Tienes cambios sin guardar. Pulsa «Guardar» o se perderán al salir.</p>}
      <label className="block"><span className="etiqueta-campo">Nombre</span><input className="campo" value={s.nombre} onChange={(e) => pon({ nombre: e.target.value })} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="etiqueta-campo">Landing</span><input className="campo" placeholder="Ej. biblioteca" value={s.landing} onChange={(e) => pon({ landing: e.target.value })} /></label>
        <label className="block"><span className="etiqueta-campo">Formulario</span><input className="campo" placeholder="Ej. registro" value={s.formulario} onChange={(e) => pon({ formulario: e.target.value })} /></label>
      </div>
      <div><span className="etiqueta-campo">Desde dónde manda los datos</span><ElegirDesde nombre={`desde-${entrada.id}`} valor={s.desde} onCambio={(v) => pon({ desde: v })} /></div>
      <label className="block"><span className="etiqueta-campo">Archivo que lo manda (opcional, para el programador)</span><input className="campo" placeholder="Ej. api/signup.js" value={s.archivo} onChange={(e) => pon({ archivo: e.target.value })} /></label>

      <div>
        <div className="etiqueta-campo">Si no se cumple ninguna regla, el lead va a</div>
        <SelectorDestino pipelines={pipelines} pipeline={s.destino.p} etapa={s.destino.e} onCambio={(p, e) => pon({ destino: { p, e } })} />
      </div>

      <div>
        <div className="etiqueta-campo">Reglas (como en el workflow de GHL)</div>
        <p className="mb-2 text-xs text-texto-3">Se aplican todas las que se cumplen, en orden. La última que elige pipeline manda; las etiquetas se suman. Solo cuentan para leads nuevos: a uno que ya existe no se le mueve de columna.</p>
        <datalist id={listaCampos}>{entrada.campos.map((c) => <option key={c} value={c} />)}</datalist>
        <ul className="space-y-2">
          {s.reglas.map((r, i) => (
            <li key={i} className="space-y-2 rounded-lg border border-borde bg-panel-2 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
                <input className="campo" list={listaCampos} placeholder="Campo (p. ej. quiz_completed)" value={r.campo} onChange={(e) => cambiarRegla(i, { campo: e.target.value })} aria-label="Campo" />
                <Pastillas className="campo" value={r.operador} onChange={(e) => cambiarRegla(i, { operador: e.target.value as Regla["operador"] })} aria-label="Condición">
                  {OPERADORES.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
                </Pastillas>
                <input className="campo" placeholder="Valor (p. ej. true)" value={r.valor ?? ""} disabled={r.operador === "existe" || r.operador === "no_existe"} onChange={(e) => cambiarRegla(i, { valor: e.target.value })} aria-label="Valor" />
                <button type="button" className="rounded-md p-2 text-texto-3 hover:bg-mal-suave hover:text-mal" title="Quitar regla" onClick={() => pon({ reglas: s.reglas.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
                <SelectorDestino pipelines={pipelines} pipeline={r.pipeline_id ?? null} etapa={r.etapa_id ?? null} vacio="No cambiar el pipeline" onCambio={(p, e) => cambiarRegla(i, { pipeline_id: p, etapa_id: e })} />
                <input className="campo" placeholder="Añadir etiqueta (opcional)" value={r.etiqueta ?? ""} onChange={(e) => cambiarRegla(i, { etiqueta: e.target.value })} aria-label="Etiqueta" />
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-secundario mt-2 text-xs" onClick={() => pon({ reglas: [...s.reglas, { ...REGLA_VACIA }] })}>
          <Plus className="h-3.5 w-3.5" /> Añadir regla
        </button>
      </div>

      <div className="space-y-3 border-t border-borde pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="titulo-seccion">Qué hacer en GHL</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="interruptor" checked={s.ghlActivo} disabled={!opciones} onChange={(e) => pon({ ghlActivo: e.target.checked })} /> Mandar a GHL
          </label>
        </div>
        {!opciones ? (
          <p className="text-sm text-texto-3">Este proyecto no tiene GHL conectado. Conéctalo en la pestaña «Integraciones GHL».</p>
        ) : (
          <>
            <p className="text-xs text-texto-3">
              El lead se guarda aquí al momento. Tras la espera, la app manda a GHL <b>un solo envío</b> con todo lo que ha llegado de esa persona: crea o actualiza el contacto, rellena los campos, pone la etiqueta
              {s.base.trim() ? <> <code>{s.base.trim().toLowerCase()}-completo</code> o <code>{s.base.trim().toLowerCase()}-incompleto</code> (en minúsculas, como las guarda GHL)</> : " (si pones una base)"}, las etiquetas fijas y una oportunidad en cada pipeline. Si falla, lo reintenta 5 veces y después avisa por email.
            </p>
            {opciones.error && <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{opciones.error}</p>}
            <div>
              <div className="etiqueta-campo">Campos: lo que llega → campo de GHL (UTM incluidos)</div>
              <ul className="space-y-2">
                {s.filas.map((f, i) => (
                  <li key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input className="campo" list={listaCampos} placeholder="Campo del envío (p. ej. quiz.situacion)" value={f.campo} onChange={(e) => cambiarFila(i, { campo: e.target.value })} aria-label="Campo del envío" />
                    <Desplegable className="campo" value={f.id} onChange={(e) => cambiarFila(i, { id: e.target.value })} aria-label="Campo de GHL">
                      <option value="">Elige el campo de GHL</option>
                      {f.id && !nombreCampo(f.id) && <option value={f.id}>{f.id} (no está en GHL)</option>}
                      {opciones.campos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Desplegable>
                    <button type="button" className="rounded-md p-2 text-texto-3 hover:bg-mal-suave hover:text-mal" title="Quitar campo" onClick={() => pon({ filas: s.filas.filter((_, j) => j !== i) })}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn-secundario mt-2 text-xs" onClick={() => pon({ filas: [...s.filas, { campo: "", id: "" }] })}>
                <Plus className="h-3.5 w-3.5" /> Añadir campo
              </button>
            </div>
            <div>
              <div className="etiqueta-campo">Oportunidades en GHL (una por pipeline)</div>
              <p className="mb-2 text-xs text-texto-3">Con «Primera columna», la que ya existe no se mueve (si GHL la pasó a «Agendan» al reservar, se queda ahí). Con una columna elegida, se mueve a esa.</p>
              <ul className="space-y-2">
                {s.opps.map((o, i) => {
                  const etapas = opciones.pipelines.find((p) => p.id === o.pipeline)?.etapas ?? [];
                  return (
                    <li key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <Desplegable className="campo" value={o.pipeline} onChange={(e) => cambiarOpp(i, { pipeline: e.target.value, etapa: "" })} aria-label="Pipeline de GHL">
                        <option value="">Elige el pipeline de GHL</option>
                        {o.pipeline && !opciones.pipelines.some((p) => p.id === o.pipeline) && <option value={o.pipeline}>{o.pipeline} (no está en GHL)</option>}
                        {opciones.pipelines.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </Desplegable>
                      <Desplegable className="campo" value={o.etapa} disabled={!o.pipeline} onChange={(e) => cambiarOpp(i, { etapa: e.target.value })} aria-label="Columna de GHL">
                        <option value="">{etapas[0] ? `Primera columna («${etapas[0].nombre}»)` : "Primera columna"}</option>
                        {o.etapa && !etapas.some((x) => x.id === o.etapa) && <option value={o.etapa}>{o.etapa} (no está en GHL)</option>}
                        {etapas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                      </Desplegable>
                      <button type="button" className="rounded-md p-2 text-texto-3 hover:bg-mal-suave hover:text-mal" title="Quitar pipeline" onClick={() => pon({ opps: s.opps.filter((_, j) => j !== i) })}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!s.opps.length && <p className="text-xs text-texto-3">Sin oportunidad en GHL.</p>}
              <button type="button" className="btn-secundario mt-2 text-xs" onClick={() => pon({ opps: [...s.opps, { pipeline: "", etapa: "" }] })}>
                <Plus className="h-3.5 w-3.5" /> Añadir pipeline
              </button>
            </div>
            <label className="block">
              <span className="etiqueta-campo">Etiquetas fijas (se ponen siempre, separadas por comas)</span>
              <input className="campo" placeholder="Ej. agenda biblioteca" value={s.extra} onChange={(e) => pon({ extra: e.target.value })} />
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block"><span className="etiqueta-campo">Etiqueta base</span><input className="campo" placeholder="Ej. Biblioteca-form" value={s.base} onChange={(e) => pon({ base: e.target.value })} /></label>
              <label className="block"><span className="etiqueta-campo">Espera (segundos)</span><input className="campo" type="number" min={0} max={3600} value={s.espera} onChange={(e) => pon({ espera: e.target.value })} /></label>
              <label className="block"><span className="etiqueta-campo">Completo si llega a true</span><input className="campo" list={listaCampos} value={s.completo} onChange={(e) => pon({ completo: e.target.value })} /></label>
            </div>
          </>
        )}
      </div>

      {error && <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{error}</p>}
      <button type="button" className="btn-primario" disabled={pendiente || !sinGuardar} onClick={() => ejecutar(() => guardarEntradaCompleta(entrada.id, paraGuardar(s, !!opciones)), "Guardado")}>
        <Save className="h-4 w-4" /> {pendiente ? "Guardando…" : "Guardar"}
      </button>

      <ZonaPeligro entrada={entrada} />
    </div>
  );
}

// ↑ ↓ y × de la cabecera: la × hace lo mismo que «Borrar» de la zona de peligro
function BotonesCabecera({ id }: { id: string }) {
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <span className="flex items-center gap-1">
      <button type="button" className="btn-secundario px-1.5 py-1" aria-label="Subir esta entrada" disabled={pendiente} onClick={() => ejecutar(() => moverEntrada(id, "arriba"))}><ArrowUp className="h-3.5 w-3.5" /></button>
      <button type="button" className="btn-secundario px-1.5 py-1" aria-label="Bajar esta entrada" disabled={pendiente} onClick={() => ejecutar(() => moverEntrada(id, "abajo"))}><ArrowDown className="h-3.5 w-3.5" /></button>
      <button
        type="button"
        className="btn-secundario px-1.5 py-1 text-mal"
        aria-label="Borrar esta entrada"
        disabled={pendiente}
        onClick={() => void confirmar("¿Borrar esta entrada? La landing dejará de poder enviar aquí. Los leads y envíos ya recibidos se quedan.").then((ok) => ok && ejecutar(() => borrarEntrada(id), "Entrada borrada"))}
      ><X className="h-3.5 w-3.5" /></button>
      {error && <span className="text-xs text-mal">{error}</span>}
    </span>
  );
}

// Lo que puede dejar a la landing sin mandar leads: aparte, explicado y siempre con confirmación
function ZonaPeligro({ entrada }: { entrada: EntradaVista }) {
  const { pendiente, ejecutar } = useAccion();
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-mal/40 p-3">
      <p className="text-sm text-texto-2"><b>Cuidado:</b> esto puede hacer que la landing deje de mandar leads.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secundario text-xs text-mal"
          disabled={pendiente}
          onClick={() => void confirmar("La dirección actual dejará de funcionar: la landing no mandará leads hasta que pongas la nueva en ella. Hazlo solo si alguien que no debe tiene la dirección. ¿Seguir?").then((ok) => ok && ejecutar(() => nuevaDireccionEntrada(entrada.id), "Dirección nueva creada: pásasela al programador de la landing"))}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Cambiar la dirección
        </button>
        <button
          type="button"
          className="btn-secundario text-xs text-mal"
          disabled={pendiente}
          onClick={() =>
            void confirmar(entrada.activa ? "Apagada, la dirección no acepta nada: los leads de esa landing no llegarán. ¿Apagarla?" : "¿Encenderla? Volverá a aceptar los leads de su landing.").then(
              (ok) => ok && ejecutar(() => cambiarActivaEntrada(entrada.id, !entrada.activa), entrada.activa ? "Entrada apagada" : "Entrada encendida")
            )
          }
        >
          <Power className="h-3.5 w-3.5" /> {entrada.activa ? "Apagar esta entrada" : "Encender esta entrada"}
        </button>
        <button
          type="button"
          className="btn-secundario text-xs text-mal"
          disabled={pendiente}
          onClick={() => void confirmar("¿Borrar esta entrada? La landing dejará de poder enviar aquí. Los leads y envíos ya recibidos se quedan.").then((ok) => ok && ejecutar(() => borrarEntrada(entrada.id), "Entrada borrada"))}
        >
          <Trash2 className="h-3.5 w-3.5" /> Borrar
        </button>
      </div>
    </div>
  );
}
