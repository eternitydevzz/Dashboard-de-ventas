"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Trash2, RefreshCw, Save } from "lucide-react";
import { sinVaciar } from "@/components/sin-vaciar";
import { useAccion, Mensajes } from "@/components/acciones-lead";
import { Copiar } from "./cliente";
import { borrarEntrada, crearEntrada, guardarEntrada, guardarGhlEntrada, nuevaDireccionEntrada, reintentarEnvioGhl } from "./acciones";
import { OPERADORES, type Regla } from "@/lib/entrada";
import { confirmar } from "@/components/dialogos";
import { Desplegable, Pastillas } from "@/components/eleccion";

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

export function NuevaEntrada({ pipelines }: { pipelines: Pipe[] }) {
  const [estado, accion, enviando] = useActionState(crearEntrada, null as Res);
  const [destino, setDestino] = useState<{ p: string | null; e: string | null }>({ p: pipelines[0]?.id ?? null, e: null });
  // 1.1 (11 oct 2026): al crearla, el nombre se borra (antes se quedaba y se podía crear dos veces); si falla, se queda
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado?.ok) form.current?.reset();
  }, [estado]);
  return (
    <form ref={form} onSubmit={sinVaciar(accion)} className="space-y-3">
      <label className="block"><span className="etiqueta-campo">Nombre (el de la landing)</span><input name="nombre" required className="campo" placeholder="Ej. Opt-in masterclass" /></label>
      <div>
        <span className="etiqueta-campo">Pipeline y columna por defecto</span>
        <SelectorDestino pipelines={pipelines} pipeline={destino.p} etapa={destino.e} onCambio={(p, e) => setDestino({ p, e })} />
        <input type="hidden" name="pipeline_id" value={destino.p ?? ""} />
        <input type="hidden" name="etapa_id" value={destino.e ?? ""} />
      </div>
      <Mensajes error={estado?.error ?? ""} ok={estado?.ok ?? ""} />
      <button className="btn-primario w-full" disabled={enviando}>{enviando ? "Creando…" : "Crear entrada"}</button>
    </form>
  );
}

export type EntradaVista = {
  id: string;
  nombre: string;
  url: string;
  activa: boolean;
  pipeline_id: string | null;
  etapa_id: string | null;
  reglas: Regla[];
  campos: string[]; // los nombres de campo que han llegado (para elegir en las reglas)
};

const REGLA_VACIA: Regla = { campo: "", operador: "igual", valor: "", pipeline_id: null, etapa_id: null, etiqueta: "" };

export function EditorEntrada({ entrada, pipelines }: { entrada: EntradaVista; pipelines: Pipe[] }) {
  const { pendiente, error, ejecutar } = useAccion();
  const [nombre, setNombre] = useState(entrada.nombre);
  const [activa, setActiva] = useState(entrada.activa);
  const [destino, setDestino] = useState({ p: entrada.pipeline_id, e: entrada.etapa_id });
  const [reglas, setReglas] = useState<Regla[]>(entrada.reglas);
  const cambiarRegla = (i: number, c: Partial<Regla>) => setReglas((rs) => rs.map((r, j) => (j === i ? { ...r, ...c } : r)));
  const listaCampos = `campos-${entrada.id}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block"><span className="etiqueta-campo">Nombre</span><input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" className="interruptor" checked={activa} onChange={(e) => setActiva(e.target.checked)} /> Activa</label>
      </div>

      <div>
        <div className="etiqueta-campo">Dirección (pégala en la landing para que envíe aquí el mismo JSON que manda a GHL)</div>
        <code className="block break-all rounded-lg border border-borde bg-panel-2 p-2.5 text-xs">{entrada.url}</code>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <Copiar texto={entrada.url} etiqueta="Copiar dirección" />
          <button
            type="button"
            className="btn-secundario text-xs"
            disabled={pendiente}
            onClick={() => void confirmar("La dirección actual dejará de funcionar y habrá que poner la nueva en la landing. ¿Seguir?").then((ok) => ok && ejecutar(() => nuevaDireccionEntrada(entrada.id), "Dirección nueva creada"))}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Nueva dirección
          </button>
        </div>
      </div>

      <div>
        <div className="etiqueta-campo">Si no se cumple ninguna regla, el lead va a</div>
        <SelectorDestino pipelines={pipelines} pipeline={destino.p} etapa={destino.e} onCambio={(p, e) => setDestino({ p, e })} />
      </div>

      <div>
        <div className="etiqueta-campo">Reglas (como en el workflow de GHL)</div>
        <p className="mb-2 text-xs text-texto-3">Se aplican todas las que se cumplen, en orden. La última que elige pipeline manda; las etiquetas se suman. Solo cuentan para leads nuevos: a uno que ya existe no se le mueve de columna.</p>
        <datalist id={listaCampos}>{entrada.campos.map((c) => <option key={c} value={c} />)}</datalist>
        <ul className="space-y-2">
          {reglas.map((r, i) => (
            <li key={i} className="space-y-2 rounded-lg border border-borde bg-panel-2 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
                <input className="campo" list={listaCampos} placeholder="Campo (p. ej. quiz_completed)" value={r.campo} onChange={(e) => cambiarRegla(i, { campo: e.target.value })} aria-label="Campo" />
                <Pastillas className="campo" value={r.operador} onChange={(e) => cambiarRegla(i, { operador: e.target.value as Regla["operador"] })} aria-label="Condición">
                  {OPERADORES.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
                </Pastillas>
                <input className="campo" placeholder="Valor (p. ej. true)" value={r.valor ?? ""} disabled={r.operador === "existe" || r.operador === "no_existe"} onChange={(e) => cambiarRegla(i, { valor: e.target.value })} aria-label="Valor" />
                <button type="button" className="rounded-md p-2 text-texto-3 hover:bg-mal-suave hover:text-mal" title="Quitar regla" onClick={() => setReglas((rs) => rs.filter((_, j) => j !== i))}>
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
        <button type="button" className="btn-secundario mt-2 text-xs" onClick={() => setReglas((rs) => [...rs, { ...REGLA_VACIA }])}>
          <Plus className="h-3.5 w-3.5" /> Añadir regla
        </button>
      </div>

      {error && <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primario"
          disabled={pendiente}
          onClick={() => ejecutar(() => guardarEntrada(entrada.id, { nombre, activa, pipeline_id: destino.p, etapa_id: destino.e, reglas: reglas.filter((r) => r.campo.trim()) }), "Entrada guardada")}
        >
          <Save className="h-4 w-4" /> Guardar
        </button>
        <button
          type="button"
          className="btn-secundario hover:text-mal"
          disabled={pendiente}
          onClick={() => void confirmar("¿Borrar esta entrada? La landing dejará de poder enviar aquí. Los leads y envíos ya recibidos se quedan.").then((ok) => ok && ejecutar(() => borrarEntrada(entrada.id), "Entrada borrada"))}
        >
          <Trash2 className="h-4 w-4" /> Borrar
        </button>
      </div>
    </div>
  );
}

// ---------- Plan GHL, fase 1 (Cristian, 6 nov 2026): «Qué hacer en GHL» ----------
// Lo que hacía el workflow con «Inbound Webhook», ahora por la API: contacto, campos, etiqueta y oportunidad.
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
  ghl_etiqueta_base: string | null;
  ghl_espera_seg: number;
  ghl_campo_completo: string;
};

export function EditorGhlEntrada({
  entradaId,
  inicial,
  camposEnvio,
  opciones,
  errores,
}: {
  entradaId: string;
  inicial: GhlDeEntrada;
  camposEnvio: string[];
  opciones: OpcionesGhl | null;
  errores: number;
}) {
  const { pendiente, error, ejecutar } = useAccion();
  const [activo, setActivo] = useState(inicial.ghl_activo);
  const [filas, setFilas] = useState<{ campo: string; id: string }[]>(Object.entries(inicial.ghl_campos ?? {}).map(([campo, id]) => ({ campo, id })));
  const [pipeline, setPipeline] = useState(inicial.ghl_pipeline_id ?? "");
  const [etapa, setEtapa] = useState(inicial.ghl_etapa_id ?? "");
  const [base, setBase] = useState(inicial.ghl_etiqueta_base ?? "");
  const [espera, setEspera] = useState(String(inicial.ghl_espera_seg ?? 60));
  const [completo, setCompleto] = useState(inicial.ghl_campo_completo ?? "quiz_completed");
  const lista = `campos-ghl-${entradaId}`;
  const cambiarFila = (i: number, c: Partial<{ campo: string; id: string }>) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...c } : f)));
  const etapas = opciones?.pipelines.find((p) => p.id === pipeline)?.etapas ?? [];
  const nombreCampo = (id: string) => opciones?.campos.find((c) => c.id === id)?.name;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="titulo-seccion">Qué hacer en GHL</div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="interruptor" checked={activo} disabled={!opciones} onChange={(e) => setActivo(e.target.checked)} /> Mandar a GHL
        </label>
      </div>
      {errores > 0 && <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{errores === 1 ? "1 envío no llegó" : `${errores} envíos no llegaron`} a GHL. Están en rojo abajo, con «Reintentar».</p>}
      {!opciones ? (
        <p className="text-sm text-texto-3">Este proyecto no tiene GHL conectado. Conéctalo en la pestaña «Integraciones GHL».</p>
      ) : (
        <>
          <p className="text-xs text-texto-3">
            El lead se guarda aquí al momento. Tras la espera, la app manda a GHL <b>un solo envío</b> con todo lo que ha llegado de esa persona: crea o actualiza el contacto, rellena los campos, pone la etiqueta
            {base.trim() ? <> <code>{base.trim().toLowerCase()}-completo</code> o <code>{base.trim().toLowerCase()}-incompleto</code> (en minúsculas, como las guarda GHL)</> : " (si pones una base)"} y crea la oportunidad. Si falla, lo reintenta 5 veces y después avisa por email.
          </p>
          {opciones.error && <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{opciones.error}</p>}

          <div>
            <div className="etiqueta-campo">Campos: lo que llega → campo de GHL (UTM incluidos)</div>
            <datalist id={lista}>{camposEnvio.map((c) => <option key={c} value={c} />)}</datalist>
            <ul className="space-y-2">
              {filas.map((f, i) => (
                <li key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input className="campo" list={lista} placeholder="Campo del envío (p. ej. quiz.situacion)" value={f.campo} onChange={(e) => cambiarFila(i, { campo: e.target.value })} aria-label="Campo del envío" />
                  <Desplegable className="campo" value={f.id} onChange={(e) => cambiarFila(i, { id: e.target.value })} aria-label="Campo de GHL">
                    <option value="">Elige el campo de GHL</option>
                    {f.id && !nombreCampo(f.id) && <option value={f.id}>{f.id} (no está en GHL)</option>}
                    {opciones.campos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Desplegable>
                  <button type="button" className="rounded-md p-2 text-texto-3 hover:bg-mal-suave hover:text-mal" title="Quitar campo" onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-secundario mt-2 text-xs" onClick={() => setFilas((fs) => [...fs, { campo: "", id: "" }])}>
              <Plus className="h-3.5 w-3.5" /> Añadir campo
            </button>
          </div>

          <div>
            <div className="etiqueta-campo">Oportunidad en GHL (pipeline y columna)</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Desplegable className="campo" value={pipeline} onChange={(e) => { setPipeline(e.target.value); setEtapa(""); }} aria-label="Pipeline de GHL">
                <option value="">Sin oportunidad</option>
                {pipeline && !opciones.pipelines.some((p) => p.id === pipeline) && <option value={pipeline}>{pipeline} (no está en GHL)</option>}
                {opciones.pipelines.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </Desplegable>
              <Desplegable className="campo" value={etapa} disabled={!pipeline} onChange={(e) => setEtapa(e.target.value)} aria-label="Columna de GHL">
                <option value="">Primera columna</option>
                {etapa && !etapas.some((x) => x.id === etapa) && <option value={etapa}>{etapa} (no está en GHL)</option>}
                {etapas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </Desplegable>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block"><span className="etiqueta-campo">Etiqueta base</span><input className="campo" placeholder="Ej. Biblioteca-form" value={base} onChange={(e) => setBase(e.target.value)} /></label>
            <label className="block"><span className="etiqueta-campo">Espera (segundos)</span><input className="campo" type="number" min={0} max={3600} value={espera} onChange={(e) => setEspera(e.target.value)} /></label>
            <label className="block"><span className="etiqueta-campo">Completo si llega a true</span><input className="campo" list={lista} value={completo} onChange={(e) => setCompleto(e.target.value)} /></label>
          </div>

          {error && <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{error}</p>}
          <button
            type="button"
            className="btn-primario"
            disabled={pendiente}
            onClick={() =>
              ejecutar(
                () =>
                  guardarGhlEntrada(entradaId, {
                    activo,
                    campos: Object.fromEntries(filas.filter((f) => f.campo.trim() && f.id).map((f) => [f.campo.trim(), f.id])),
                    pipeline_id: pipeline || null,
                    etapa_id: etapa || null,
                    etiqueta_base: base,
                    espera_seg: Number(espera),
                    campo_completo: completo,
                  }),
                "Guardado lo de GHL"
              )
            }
          >
            <Save className="h-4 w-4" /> Guardar lo de GHL
          </button>
        </>
      )}
    </div>
  );
}

export function ReintentarGhl({ eventoId }: { eventoId: string }) {
  const { pendiente, ejecutar } = useAccion();
  return (
    <button type="button" className="btn-secundario text-xs" disabled={pendiente} onClick={() => ejecutar(() => reintentarEnvioGhl(eventoId), "Se manda en la próxima lectura (menos de 1 min)")}>
      <RefreshCw className="h-3.5 w-3.5" /> Reintentar
    </button>
  );
}
