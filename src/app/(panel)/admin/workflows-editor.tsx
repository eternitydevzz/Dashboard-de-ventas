"use client";

// Workflows 4c (boceto del editor aprobado por Cristian el 7 nov 2026): editar el workflow en el lienzo.
// «+» entre cajas abre los tipos de paso; cada caja se elige (panel de la derecha; en el móvil, debajo) o se quita.
// Un solo «Guardar versión N»; aviso de cambios sin guardar. Encender/apagar y prueba/real, con confirmación.
import { Fragment, useEffect, useState } from "react";
import { Check, Clock, GitBranch, MoveRight, Pencil, Plus, Save, Tag, Target, Trash2, User, Zap } from "lucide-react";
import { useAccion } from "@/components/acciones-lead";
import { confirmar } from "@/components/dialogos";
import { Desplegable } from "@/components/eleccion";
import type { Disparador, Paso } from "@/lib/workflows";
import { describirPaso, condicionTexto, disparadorTexto, type Icono, type Nombres } from "@/lib/workflows-vista";
import { cambiarPaso, insertarPaso, mismoContenido, pasoNuevo, quitarPaso, verPaso, type Ruta } from "@/lib/workflows-editar";
import { crearWorkflowDeCita, crearWorkflowDeEtiqueta, devolverAHoy, encenderWorkflow, guardarWorkflow, pararWorkflow, pasarWorkflowAReal } from "./acciones";

type Pipe = { id: string; nombre: string; etapas: { id: string; nombre: string }[] };
export type OpcionesEditor = { camposGhl: { id: string; name: string }[]; pipelinesGhl: Pipe[]; pipelinesDashboard: Pipe[]; errorGhl: string | null };
type Rama = Extract<Paso, { tipo: "rama" }>;

const ICONOS: Record<Icono, { C: typeof Zap; color: string }> = {
  rayo: { C: Zap, color: "from-[#5b78ff] to-[#2341c8]" },
  reloj: { C: Clock, color: "from-[#9aa3b8] to-[#5d6679]" },
  persona: { C: User, color: "from-[#ffb35c] to-[#e46a00]" },
  etiqueta: { C: Tag, color: "from-[#ff8ab5] to-[#d63a78]" },
  diana: { C: Target, color: "from-[#4ade80] to-[#0e7a45]" },
  rama: { C: GitBranch, color: "from-[#a78bfa] to-[#6d28d9]" },
  mover: { C: MoveRight, color: "from-[#5ec8ff] to-[#0b72c4]" },
};
function Cuadro({ icono }: { icono: Icono }) {
  const { C, color } = ICONOS[icono];
  return (
    <span aria-hidden className={`grid h-8 w-8 flex-none place-items-center rounded-[10px] bg-gradient-to-b text-white shadow-sm ${color}`}>
      <C className="h-[17px] w-[17px]" strokeWidth={2.2} />
    </span>
  );
}
const TIPOS: { tipo: Paso["tipo"]; icono: Icono; t: string; d: string }[] = [
  { tipo: "esperar", icono: "reloj", t: "Esperar", d: "Un tiempo antes del siguiente paso" },
  { tipo: "contacto_ghl", icono: "persona", t: "Contacto en GHL", d: "Crear o actualizar, con sus campos" },
  { tipo: "etiquetas_ghl", icono: "etiqueta", t: "Etiquetas en GHL", d: "Poner etiquetas" },
  { tipo: "quitar_etiqueta_ghl", icono: "etiqueta", t: "Quitar etiqueta en GHL", d: "Quitar una etiqueta" },
  { tipo: "oportunidad_ghl", icono: "diana", t: "Oportunidad en GHL", d: "En un pipeline y columna" },
  { tipo: "mover_dashboard", icono: "mover", t: "Mover en el dashboard", d: "A un pipeline y columna" },
  { tipo: "rama", icono: "rama", t: "Rama «si el campo…»", d: "Un camino distinto según un campo" },
];
// Fase 4d, B3 (plan GHL 2.4): los workflows de cita se crean aquí (los de Entrada, desde su tarjeta). A3: y los de etiqueta.
export function NuevoWorkflowCita() {
  const { pendiente, ejecutar } = useAccion();
  const [etiqueta, setEtiqueta] = useState("");
  const creado = "Workflow creado (apagado): ponle sus pasos con «Editar» y enciéndelo";
  return (
    <div className="flex flex-wrap gap-2">
      {(["agendada", "cancelada"] as const).map((ev) => (
        <button key={ev} type="button" className="btn-secundario text-xs" disabled={pendiente} onClick={() => ejecutar(() => crearWorkflowDeCita(ev), creado)}>
          <Plus className="h-3.5 w-3.5" /> Nuevo: cuando se {ev === "agendada" ? "agenda" : "cancela"} una cita
        </button>
      ))}
      <form
        className="flex w-full gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ejecutar(async () => {
            const r = await crearWorkflowDeEtiqueta(etiqueta);
            if (!("error" in r)) setEtiqueta("");
            return r;
          }, creado);
        }}
      >
        <input className="campo min-w-0 flex-1 text-xs" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="etiqueta" aria-label="Etiqueta que arranca el workflow" maxLength={100} />
        <button type="submit" className="btn-secundario text-xs" disabled={pendiente || !etiqueta.trim()}>
          <Plus className="h-3.5 w-3.5" /> Nuevo: cuando se pone la etiqueta…
        </button>
      </form>
    </div>
  );
}

const igual = (a: Ruta | null, b: Ruta | null) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
const Une = () => <span aria-hidden className="block h-4 w-0.5 bg-primario/30" />;

export function EditorWorkflow({
  w,
  enCurso,
  nombres,
  opciones,
  disparador,
}: {
  w: { id: string; nombre: string; pasos: Paso[]; version: number; modo: string; encendido: boolean; disparador: Disparador };
  enCurso: number;
  nombres: Nombres;
  opciones: OpcionesEditor;
  disparador: string;
}) {
  const { pendiente, error, ejecutar } = useAccion();
  const [pasos, setPasos] = useState<Paso[]>(w.pasos);
  const [sel, setSel] = useState<Ruta | null>(null);
  const [menu, setMenu] = useState<{ lista: Ruta; en: number } | null>(null);
  const sinGuardar = !mismoContenido(pasos, w.pasos);
  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  const elegido = sel ? verPaso(pasos, sel) : null;
  const poner = (p: Paso) => sel && setPasos((ps) => cambiarPaso(ps, sel, p));
  const anadir = (tipo: Paso["tipo"]) => {
    if (!menu) return;
    const nuevo = pasoNuevo(tipo);
    setPasos((ps) => insertarPaso(ps, menu.lista, menu.en, nuevo));
    setSel([...menu.lista, menu.en]);
    setMenu(null);
  };
  const quitar = (r: Ruta) => {
    setPasos((ps) => quitarPaso(ps, r));
    setSel(null);
  };

  const mas = (lista: Ruta, en: number) => {
    const abierto = !!menu && igual(menu.lista, lista) && menu.en === en;
    return (
      <div key={`mas-${[...lista, en].join(".")}`} className="flex w-full flex-col items-center">
        <button type="button" aria-label="Añadir un paso aquí" onClick={() => setMenu(abierto ? null : { lista, en })} className={`grid h-7 w-7 place-items-center rounded-full border shadow-sm transition-colors ${abierto ? "border-primario bg-primario text-white" : "border-primario/30 bg-panel text-primario hover:bg-primario-suave"}`}>
          <Plus className="h-4 w-4" />
        </button>
        {abierto && (
          <div className="vidrio my-2 w-full max-w-[300px] rounded-[18px] border border-borde p-1.5 shadow-[0_10px_28px_rgb(15_23_42/0.10)]">
            {TIPOS.map((t) => (
              <button key={t.tipo} type="button" onClick={() => anadir(t.tipo)} className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left hover:bg-panel-2">
                <Cuadro icono={t.icono} />
                <span className="min-w-0"><span className="block text-sm font-medium">{t.t}</span><span className="block text-xs text-texto-3">{t.d}</span></span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const pintar = (lista: Paso[], ruta: Ruta) => (
    <>
      <Une />
      {mas(ruta, 0)}
      {lista.map((p, i) => {
        const r = [...ruta, i];
        const c = describirPaso(p, nombres);
        const activo = igual(sel, r);
        return (
          <Fragment key={p.id}>
            <Une />
            <div className={`vidrio relative flex w-full max-w-[300px] items-center gap-3 rounded-[18px] border px-3.5 py-3 shadow-[0_10px_28px_rgb(15_23_42/0.08)] ${activo ? "border-primario ring-4 ring-primario/15" : "border-borde"}`}>
              <button type="button" onClick={() => setSel(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Editar: ${c.clave}`}>
                <Cuadro icono={c.icono} />
                <span className="min-w-0">
                  <span className="block text-[11.5px] font-semibold text-texto-3">{c.clave}</span>
                  <span className="block break-words text-sm font-semibold leading-snug">{c.titulo || "Sin elegir"}</span>
                  {c.detalle && <span className="block break-words text-xs text-texto-3">{c.detalle}</span>}
                </span>
              </button>
              <button type="button" onClick={() => setSel(r)} className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-panel-2 text-texto-2 hover:text-primario" aria-label="Editar este paso"><Pencil className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => void confirmar(p.tipo === "rama" ? "¿Quitar la rama con todos sus caminos y pasos?" : "¿Quitar este paso?").then((ok) => ok && quitar(r))} className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-panel-2 text-texto-2 hover:text-mal" aria-label="Quitar este paso"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            {p.tipo === "rama" && (
              // Cada camino con ancho fijo: si no caben, la rama se desplaza en horizontal (antes se encogían y el texto salía letra a letra)
              <div className="mt-4 w-full overflow-x-auto pb-2">
                <div className="mx-auto flex w-max flex-col items-center gap-4 sm:flex-row sm:items-start">
                {[...p.caminos.map((cm, n) => ({ etiqueta: condicionTexto(cm.condicion), pasos: cm.pasos, ruta: [...r, "c", n] as Ruta, no: false })), { etiqueta: "si no", pasos: p.si_no, ruta: [...r, "s"] as Ruta, no: true }].map((cm) => (
                  <div key={cm.ruta.join(".")} className="flex w-[280px] flex-none flex-col items-center">
                    <span className={`whitespace-nowrap rounded-full border border-borde bg-panel px-3 py-1 text-xs font-semibold shadow-sm ${cm.no ? "text-texto-3" : "text-primario"}`}>{cm.etiqueta}</span>
                    {pintar(cm.pasos, cm.ruta)}
                  </div>
                ))}
                </div>
              </div>
            )}
            <Une />
            {mas(ruta, i + 1)}
          </Fragment>
        );
      })}
    </>
  );

  const real = w.modo === "real";
  // Sin Entrada (cita o etiqueta): no hay «Qué hacer en GHL» que apagar ni al que volver; «Prueba» solo lo vuelve a prueba
  const d = w.disparador;
  const cita = d.tipo !== "entrada";
  const quien = d.tipo === "cita" ? `las citas que se ${d.evento === "cancelada" ? "cancelen" : "agenden"}` : d.tipo === "etiqueta" ? `los leads a los que se ponga «${d.etiqueta}»` : "los leads de su Entrada";
  return (
    <section className="tarjeta min-w-0 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold tracking-tight">{w.nombre}</h2>
          <p className="text-xs text-texto-3">Versión {w.version}{enCurso ? ` · ${enCurso === 1 ? "1 lead en curso termina" : `${enCurso} leads en curso terminan`} con la versión ${w.version}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="interruptor"
              checked={w.encendido}
              disabled={pendiente || sinGuardar}
              onChange={(e) => {
                const on = e.target.checked;
                void confirmar(on ? `¿Encender el workflow? Empieza a recibir ${quien}.` : `¿Apagar el workflow? Deja de recibir ${quien}.`).then((ok) => ok && ejecutar(() => (on ? encenderWorkflow(w.id) : pararWorkflow(w.id)), on ? "Encendido" : "Apagado"));
              }}
            />
            Encendido
          </label>
          <div className="inline-flex rounded-xl bg-panel-2 p-0.5 ring-1 ring-borde" role="group" aria-label="Modo">
            {(["prueba", "real"] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={pendiente || sinGuardar || w.modo === m || (!w.encendido && !(cita && m === "prueba"))}
                onClick={() =>
                  void confirmar(
                    m === "real"
                      ? cita
                        ? `¿Pasar a real? El workflow manda a GHL con ${quien}. En prueba no se compara con nada: mira antes en el historial que sus pasos son los que esperas.`
                        : "¿Pasar a real? El workflow manda a GHL y «Qué hacer en GHL» de su Entrada se apaga. Criterio acordado: 3 días en prueba, 20 leads de registro, todos los de agenda y 0 diferencias."
                      : cita
                        ? "¿Volver a prueba? Deja de mandar a GHL: solo apunta lo que haría."
                        : "¿Volver a lo de hoy? «Qué hacer en GHL» de su Entrada vuelve a mandar y el workflow se para."
                  ).then(
                    (ok) => ok && ejecutar(() => (m === "real" ? pasarWorkflowAReal(w.id) : devolverAHoy(w.id)), m === "real" ? "Ya manda a GHL" : cita ? "Vuelve a prueba" : "Vuelve a mandar «Qué hacer en GHL»")
                  )
                }
                className={`rounded-[10px] px-3 py-1 text-sm font-semibold ${w.modo === m ? "bg-panel text-texto shadow-sm" : "text-texto-2 disabled:opacity-60"}`}
              >
                {m === "real" ? "Real" : "Prueba"}
              </button>
            ))}
          </div>
          <button type="button" className="btn-secundario" disabled={!sinGuardar || pendiente} onClick={() => { setPasos(w.pasos); setSel(null); setMenu(null); }}>Descartar</button>
          <button type="button" className="btn-primario" disabled={!sinGuardar || pendiente} onClick={() => ejecutar(() => guardarWorkflow(w.id, pasos), `Guardada la versión ${w.version + 1}`)}>
            <Save className="h-4 w-4" /> {pendiente ? "Guardando…" : `Guardar versión ${w.version + 1}`}
          </button>
        </div>
      </div>
      {sinGuardar && <p className="mb-3 rounded-xl bg-aviso-suave px-3 py-2 text-sm text-aviso">Tienes cambios sin guardar. Si sales, el navegador te avisa.</p>}
      {real && <p className="mb-3 rounded-xl bg-ok-suave px-3 py-2 text-sm text-ok">En real: lo que guardes se aplica a los leads nuevos que lleguen.</p>}
      {opciones.errorGhl && <p className="mb-3 rounded-xl bg-mal-suave px-3 py-2 text-sm text-mal">{opciones.errorGhl}</p>}
      {error && <p className="mb-3 rounded-xl bg-mal-suave px-3 py-2 text-sm text-mal">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col items-center rounded-[20px] border border-borde bg-panel-2 bg-[radial-gradient(rgb(15_23_42/0.10)_1px,transparent_1.2px)] [background-size:18px_18px] px-3 pb-8 pt-7">
          <div className="vidrio flex w-full max-w-[300px] items-center gap-3 rounded-[18px] border border-primario/35 px-3.5 py-3 ring-4 ring-primario/10">
            <Cuadro icono="rayo" />
            <div className="min-w-0"><div className="text-[11.5px] font-semibold text-texto-3">Cuando</div><div className="text-sm font-semibold">{disparadorTexto(w.disparador, nombres).titulo}</div><div className="break-words text-xs text-texto-3">{disparador}</div></div>
          </div>
          {pintar(pasos, [])}
        </div>
        <aside className="vidrio min-w-0 self-start rounded-[22px] border border-borde p-4 lg:sticky lg:top-4">
          {!elegido ? (
            <p className="text-sm text-texto-3">Elige una caja del lienzo para cambiarla, o pulsa «+» para añadir un paso.</p>
          ) : (
            <Inspector paso={elegido} poner={poner} opciones={opciones} />
          )}
        </aside>
      </div>
    </section>
  );
}

// ---------- Panel para editar la caja elegida ----------
function Titulo({ t, d }: { t: string; d: string }) {
  return (
    <>
      <h3 className="text-base font-semibold">{t}</h3>
      <p className="mb-3 text-xs text-texto-3">{d}</p>
    </>
  );
}
function Inspector({ paso, poner, opciones }: { paso: Paso; poner: (p: Paso) => void; opciones: OpcionesEditor }) {
  const etapasDe = (lista: Pipe[], id: string) => lista.find((p) => p.id === id)?.etapas ?? [];
  switch (paso.tipo) {
    case "esperar":
      return (
        <>
          <Titulo t="Esperar" d="El lead espera antes del siguiente paso (por ejemplo, por si llega el cuestionario)." />
          <label className="block"><span className="etiqueta-campo">Minutos</span>
            <input className="campo" type="number" min={0} max={10080} value={Math.round(paso.segundos / 60)} onChange={(e) => poner({ ...paso, segundos: Math.max(0, Number(e.target.value) || 0) * 60 })} />
          </label>
        </>
      );
    case "contacto_ghl": {
      const filas = Object.entries(paso.campos);
      const cambiar = (nuevas: [string, string][]) => poner({ ...paso, campos: Object.fromEntries(nuevas) });
      return (
        <>
          <Titulo t="Contacto en GHL" d="Crea o actualiza el contacto con nombre, email y teléfono, y rellena estos campos." />
          <ul className="space-y-2">
            {filas.map(([campo, id], i) => (
              <li key={i} className="space-y-1.5 rounded-xl bg-panel-2 p-2 ring-1 ring-borde">
                <input className="campo" placeholder="Lo que llega (p. ej. quiz.situacion)" value={campo} onChange={(e) => cambiar(filas.map((f, j) => (j === i ? [e.target.value, f[1]] : f)))} aria-label="Campo del envío" />
                <div className="flex gap-1.5">
                  <Desplegable className="campo" value={id} onChange={(e) => cambiar(filas.map((f, j) => (j === i ? [f[0], e.target.value] : f)))} aria-label="Campo de GHL">
                    <option value="">Campo de GHL</option>
                    {id && !opciones.camposGhl.some((c) => c.id === id) && <option value={id}>{id}</option>}
                    {opciones.camposGhl.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Desplegable>
                  <button type="button" className="rounded-lg px-2 text-texto-3 hover:text-mal" aria-label="Quitar campo" onClick={() => cambiar(filas.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-secundario mt-2 text-xs" onClick={() => cambiar([...filas, ["", ""]])}><Plus className="h-3.5 w-3.5" /> Añadir campo</button>
        </>
      );
    }
    case "etiquetas_ghl":
      return (
        <>
          <Titulo t="Etiquetas en GHL" d="Con base, pone «base-completo» o «base-incompleto» (en minúsculas). Las fijas se ponen siempre." />
          <label className="block"><span className="etiqueta-campo">Etiqueta base (opcional)</span><input className="campo" placeholder="Ej. biblioteca-agenda" value={paso.base ?? ""} onChange={(e) => poner({ ...paso, base: e.target.value || null })} /></label>
          <label className="mt-2 block"><span className="etiqueta-campo">Etiquetas fijas, separadas por comas</span><input className="campo" placeholder="Ej. agenda biblioteca" value={paso.fijas.join(", ")} onChange={(e) => poner({ ...paso, fijas: e.target.value.split(",").map((t) => t.trimStart()) })} /></label>
          <label className="mt-2 block"><span className="etiqueta-campo">Completo si llega a true</span><input className="campo" value={paso.campo_completo} onChange={(e) => poner({ ...paso, campo_completo: e.target.value })} /></label>
        </>
      );
    case "quitar_etiqueta_ghl":
      return (
        <>
          <Titulo t="Quitar etiqueta en GHL" d="Quita esta etiqueta del contacto." />
          <label className="block"><span className="etiqueta-campo">Etiqueta</span><input className="campo" value={paso.etiqueta} onChange={(e) => poner({ ...paso, etiqueta: e.target.value })} /></label>
        </>
      );
    case "oportunidad_ghl":
    case "mover_dashboard": {
      const lista = paso.tipo === "oportunidad_ghl" ? opciones.pipelinesGhl : opciones.pipelinesDashboard;
      return (
        <>
          <Titulo t={paso.tipo === "oportunidad_ghl" ? "Oportunidad en GHL" : "Mover en el dashboard"} d={paso.tipo === "oportunidad_ghl" ? "Una por pipeline. Con «Primera columna», la que ya existe no se mueve." : "Pasa el lead a este pipeline y columna del dashboard (si está en otro pipeline, mueve su tarjeta en este)."} />
          <label className="block"><span className="etiqueta-campo">Pipeline</span>
            <Desplegable className="campo" value={paso.pipeline_id} onChange={(e) => poner({ ...paso, pipeline_id: e.target.value, etapa_id: null })}>
              <option value="">Elige el pipeline</option>
              {paso.pipeline_id && !lista.some((p) => p.id === paso.pipeline_id) && <option value={paso.pipeline_id}>{paso.pipeline_id}</option>}
              {lista.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Desplegable>
          </label>
          <label className="mt-2 block"><span className="etiqueta-campo">Columna</span>
            <Desplegable className="campo" value={paso.etapa_id ?? ""} disabled={!paso.pipeline_id} onChange={(e) => poner({ ...paso, etapa_id: e.target.value || null })}>
              <option value="">Primera columna</option>
              {etapasDe(lista, paso.pipeline_id).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </Desplegable>
          </label>
        </>
      );
    }
    case "rama": {
      const r = paso as Rama;
      const campo = r.caminos[0]?.condicion.campo ?? "";
      const caminos = (cs: Rama["caminos"]) => poner({ ...r, caminos: cs });
      return (
        <>
          <Titulo t="Rama" d="Cada lead va por el primer camino que cumple. Si ninguno, por «si no»." />
          <label className="block"><span className="etiqueta-campo">Campo que se mira</span><input className="campo" value={campo} onChange={(e) => caminos(r.caminos.map((c) => ({ ...c, condicion: { ...c.condicion, campo: e.target.value } })))} /></label>
          <div className="etiqueta-campo mt-2">Caminos</div>
          <ul className="space-y-2">
            {r.caminos.map((c, i) => (
              <li key={i} className="flex gap-1.5 rounded-xl bg-panel-2 p-2 ring-1 ring-borde">
                <Desplegable className="campo w-[118px] flex-none" value={c.condicion.operador} onChange={(e) => caminos(r.caminos.map((x, j) => (j === i ? { ...x, condicion: { ...x.condicion, operador: e.target.value as typeof c.condicion.operador } } : x)))} aria-label="Condición">
                  <option value="igual">es</option>
                  <option value="contiene">contiene</option>
                  <option value="existe">tiene valor</option>
                  <option value="no_existe">está vacío</option>
                </Desplegable>
                <input className="campo min-w-0" value={c.condicion.valor ?? ""} disabled={c.condicion.operador === "existe" || c.condicion.operador === "no_existe"} onChange={(e) => caminos(r.caminos.map((x, j) => (j === i ? { ...x, condicion: { ...x.condicion, valor: e.target.value } } : x)))} aria-label="Valor" />
                <button type="button" className="rounded-lg px-1.5 text-texto-3 hover:text-mal disabled:opacity-40" disabled={r.caminos.length === 1} aria-label="Quitar camino" onClick={() => void confirmar("¿Quitar este camino y sus pasos?").then((ok) => ok && caminos(r.caminos.filter((_, j) => j !== i)))}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-secundario mt-2 text-xs" disabled={r.caminos.length >= 10} onClick={() => caminos([...r.caminos, { condicion: { campo, operador: "igual", valor: "" }, pasos: [] }])}><Plus className="h-3.5 w-3.5" /> Añadir camino</button>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-texto-3"><Check className="h-3.5 w-3.5" /> Los pasos de cada camino se añaden con su «+» en el lienzo.</p>
        </>
      );
    }
  }
}
