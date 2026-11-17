"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Maximize2, Settings2, Upload, X } from "lucide-react";
import { confirmar } from "@/components/dialogos";
import { Modal } from "@/components/modal";
import { BarraDeslizable } from "@/components/barra-deslizable";
import { useToast } from "@/components/toasts";
import { subirDelFormulario } from "@/lib/subir-cliente";
import { exigirOk } from "@/lib/resultado-cliente";
import { fechaHora } from "@/lib/formato";
import type { Proyecto } from "@/lib/tipos";
import { MERCADOS, type Mercado } from "@/lib/mercado";
import { reordenar } from "@/lib/orden";
import { borrarManual, guardarManual, guardarMercadosManual, ordenarManuales, prepararSubidaManual } from "./acciones";

const ARRASTRE_MANUAL = "application/x-eternity-manual";

// `vistos`: solo para jefes (ajuste ⚙). visto_en null = «Sin ver»
export type ManualFila = { id: string; titulo: string; actualizado_en: string; por: string | null; mercados: Mercado[]; vistos?: { id: string; nombre: string; visto_en: string | null }[] };

// Cristian (7 nov, tras verlo en la app): el manual ocupa todo el ancho y el alto; arriba, un botón por manual
// para cambiar de uno a otro (antes, una lista a la izquierda que le quitaba sitio al .html)
export function VisorManuales({ manuales, elegido, editor, zona, mercado = "latam" }: { manuales: ManualFila[]; elegido: ManualFila; editor: boolean; zona: Proyecto["zona_horaria"]; mercado?: "latam" | "es" }) {
  const src = `/api/manuales/${elegido.id}?v=${encodeURIComponent(elegido.actualizado_en)}`; // ?v=: al cambiarlo, no sale el viejo
  // Cristian, 14 nov: los jefes ordenan los botones arrastrándolos. El orden nuevo se ve al momento; si falla, vuelve
  // el de antes. `base`: cuando llega el orden guardado del servidor, manda ese.
  const [propio, setPropio] = useState<{ base: ManualFila[]; ids: string[] } | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const toast = useToast();
  const lista = propio?.base === manuales ? propio.ids.flatMap((id) => manuales.filter((m) => m.id === id)) : manuales;
  const mover = (desde: string, hasta: string) => {
    if (!editor || desde === hasta) return;
    const ids = reordenar(lista.map((m) => m.id), desde, hasta);
    setPropio({ base: manuales, ids });
    iniciar(async () => {
      try {
        await exigirOk(ordenarManuales(ids));
      } catch (err) {
        setPropio(null);
        toast(err instanceof Error ? err.message : "No se pudo guardar el orden.", "error");
      }
    });
  };
  return (
    <section className="tarjeta flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-borde px-3 py-2.5 sm:px-4">
        <BarraDeslizable role="navigation" className="flex min-w-0 flex-1 gap-1.5" aria-label="Manuales">
          {lista.map((m, i) => {
            const on = m.id === elegido.id;
            return (
              <span
                key={m.id}
                draggable={editor}
                // BarraDeslizable cancela todo arrastre de dentro (para que el enlace no se arrastre como imagen):
                // a los jefes se les para aquí, antes de llegar a ella. Con React (onDragStart) llegaría tarde.
                ref={(el) => {
                  if (!el || !editor) return;
                  const empezar = (ev: DragEvent) => {
                    ev.stopPropagation();
                    ev.dataTransfer?.setData(ARRASTRE_MANUAL, m.id);
                  };
                  el.addEventListener("dragstart", empezar);
                  return () => el.removeEventListener("dragstart", empezar);
                }}
                onDragOver={(ev) => {
                  if (!editor || !ev.dataTransfer.types.includes(ARRASTRE_MANUAL)) return;
                  ev.preventDefault();
                  setSobre(m.id);
                }}
                onDragLeave={() => setSobre((s) => (s === m.id ? null : s))}
                onDrop={(ev) => {
                  const desde = ev.dataTransfer.getData(ARRASTRE_MANUAL);
                  setSobre(null);
                  if (!desde) return;
                  ev.preventDefault();
                  mover(desde, m.id);
                }}
                title={editor ? "Arrastra para ordenar" : undefined}
                className={`inline-flex shrink-0 items-center gap-0.5 rounded-xl ${sobre === m.id ? "ring-2 ring-primario" : ""}`}
              >
                <Link href={`/manuales?m=${m.id}${editor && mercado === "es" ? "&mercado=es" : ""}`} aria-current={on ? "page" : undefined} title={`Actualizado el ${fechaHora(m.actualizado_en, { zona_horaria: zona })}${m.por ? ` · por ${m.por}` : ""}`} className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${on ? "border-transparent bg-primario-boton text-white shadow-[0_6px_20px_-8px_rgb(43_89_209/0.6)]" : "border-borde bg-panel-2 text-texto-2 hover:border-borde-fuerte hover:text-texto"}`}>
                  <BookOpen className="h-4 w-4" /> {m.titulo}
                </Link>
                {editor && <AjustesManual manual={m} zona={zona} alMover={(d) => mover(m.id, lista[i + d].id)} primero={i === 0} ultimo={i === lista.length - 1} />}
              </span>
            );
          })}
        </BarraDeslizable>
        <a href={src} target="_blank" rel="noreferrer" className="btn-secundario px-2.5 py-1.5 text-xs"><Maximize2 className="h-3.5 w-3.5" /> Pantalla completa</a>
        {editor && <SubirManual cambiar={elegido} mercado={mercado} />}
      </div>
      {/* Aislado: sin allow-same-origin, el manual no puede leer la sesión ni tocar la app (lib/csp.ts, CSP_VISOR) */}
      <iframe key={src} src={src} title={elegido.titulo} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" className="h-[calc(100dvh-210px)] min-h-[480px] w-full bg-white" />
    </section>
  );
}

// «Subir manual (.html)» (nuevo) o «Cambiar este manual» (el .html nuevo sustituye al anterior)
// 13 nov: mirando España, el manual nuevo es del equipo de España
export function SubirManual({ cambiar, mercado = "latam" }: { cambiar?: ManualFila; mercado?: "latam" | "es" }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState("");
  const [enviando, iniciar] = useTransition();
  const toast = useToast();
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError("");
    iniciar(async () => {
      try {
        await subirDelFormulario(fd, "archivo", "text/html", prepararSubidaManual);
        await exigirOk(guardarManual(fd));
        toast(cambiar ? "Manual cambiado" : "Manual subido");
        setAbierto(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo subir el manual.");
      }
    });
  };
  return (
    <>
      <button type="button" className={cambiar ? "btn-secundario px-2.5 py-1 text-xs" : "btn-primario"} onClick={() => setAbierto(true)}>
        <Upload className={cambiar ? "h-3.5 w-3.5" : "h-4 w-4"} /> {cambiar ? "Cambiar este manual" : "Subir manual (.html)"}
      </button>
      {abierto && (
        <Modal titulo={cambiar ? `Cambiar «${cambiar.titulo}»` : mercado === "es" ? "Subir manual · España" : "Subir manual"} onCerrar={() => setAbierto(false)}>
          <form onSubmit={enviar} className="space-y-3">
            {cambiar && <input type="hidden" name="id" value={cambiar.id} />}
            <input type="hidden" name="mercado" value={mercado} />
            <label className="block"><span className="etiqueta-campo">Título</span><input name="titulo" required maxLength={80} defaultValue={cambiar?.titulo ?? ""} className="campo" placeholder="Manual general" /></label>
            <label className="block"><span className="etiqueta-campo">Archivo .html</span><input name="archivo" type="file" accept=".html,text/html" required className="campo" /></label>
            {cambiar && <p className="text-xs text-texto-3">El archivo nuevo sustituye al anterior para todo el equipo.</p>}
            {error && <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{error}</p>}
            <button className="btn-primario w-full" disabled={enviando}>{enviando ? "Subiendo…" : cambiar ? "Cambiar" : "Subir"}</button>
          </form>
        </Modal>
      )}
    </>
  );
}

// Cristian, 14 nov: ajuste ⚙ de cada manual (CEO y directores): qué mercados lo ven y quién lo ha abierto
type Mover = { alMover: (d: -1 | 1) => void; primero: boolean; ultimo: boolean };
function AjustesManual({ manual, zona, ...mover }: { manual: ManualFila; zona: Proyecto["zona_horaria"] } & Mover) {
  const [abierto, setAbierto] = useState(false);
  const [borrando, iniciar] = useTransition();
  const toast = useToast();
  // Cristian, 17 nov: X para borrar un manual obsoleto (CEO y directores)
  const borrar = async () => {
    if (!(await confirmar(`¿Borrar el manual «${manual.titulo}»? No se puede deshacer.`, { boton: "Borrar" }))) return;
    iniciar(async () => {
      try {
        await exigirOk(borrarManual(manual.id));
        toast("Manual borrado"); // la página se refresca sola (revalidatePath) y enseña el primero
      } catch (err) {
        toast(err instanceof Error ? err.message : "No se pudo borrar.", "error");
      }
    });
  };
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} aria-label="Ajustes del manual" title="Ajustes del manual" className="rounded-lg p-1.5 text-texto-3 hover:bg-panel-2 hover:text-texto">
        <Settings2 className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => void borrar()} disabled={borrando} aria-label={`Borrar el manual ${manual.titulo}`} title="Borrar el manual" className="rounded-lg p-1.5 text-texto-3 hover:bg-mal-suave hover:text-mal disabled:opacity-50">
        <X className="h-4 w-4" />
      </button>
      {abierto && <VentanaAjustes manual={manual} zona={zona} onCerrar={() => setAbierto(false)} {...mover} />}
    </>
  );
}

function VentanaAjustes({ manual, zona, onCerrar, alMover, primero, ultimo }: { manual: ManualFila; zona: Proyecto["zona_horaria"]; onCerrar: () => void } & Mover) {
  const [marcados, setMarcados] = useState<Mercado[]>(manual.mercados);
  const [error, setError] = useState("");
  const [enviando, iniciar] = useTransition();
  const toast = useToast();
  const vistos = manual.vistos ?? [];
  const alterna = (m: Mercado) => setMarcados((a) => (a.includes(m) ? a.filter((x) => x !== m) : [...a, m]));
  const guardar = () => {
    setError("");
    iniciar(async () => {
      try {
        await exigirOk(guardarMercadosManual(manual.id, marcados));
        toast("Guardado");
        onCerrar();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  };
  return (
    <Modal titulo={`Ajustes · ${manual.titulo}`} onCerrar={onCerrar}>
      <div className="space-y-5">
        <section className="space-y-2">
          <h3 className="etiqueta-campo">Quién lo ve</h3>
          <div className="flex gap-4 text-sm">
            {[...MERCADOS].reverse().map((m) => (
              <label key={m.v} className="flex items-center gap-1.5"><input type="checkbox" checked={marcados.includes(m.v)} onChange={() => alterna(m.v)} />{m.t}</label>
            ))}
          </div>
          {!marcados.length && <p className="text-xs text-mal">Marca al menos un mercado.</p>}
          {error && <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{error}</p>}
          <button type="button" className="btn-primario w-full" disabled={enviando || !marcados.length} onClick={guardar}>{enviando ? "Guardando…" : "Guardar"}</button>
        </section>
        {/* Cristian, 14 nov: lo mismo que arrastrar, con teclado */}
        <section className="space-y-2">
          <h3 className="etiqueta-campo">Orden</h3>
          <div className="flex gap-2">
            <button type="button" className="btn-secundario flex-1" disabled={primero} onClick={() => alMover(-1)}><ArrowLeft className="h-4 w-4" /> Mover antes</button>
            <button type="button" className="btn-secundario flex-1" disabled={ultimo} onClick={() => alMover(1)}>Mover después <ArrowRight className="h-4 w-4" /></button>
          </div>
        </section>
        <section className="space-y-2">
          <h3 className="etiqueta-campo">Quién lo ha visto</h3>
          <p className="text-sm text-texto-2">{vistos.filter((v) => v.visto_en).length} de {vistos.length} lo han visto</p>
          <ul className="divide-y divide-borde text-sm">
            {vistos.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-1.5">
                <span>{v.nombre}</span>
                {v.visto_en ? (
                  <span className="inline-flex items-center gap-1 text-ok-texto"><Check className="h-4 w-4" /> {fechaHora(v.visto_en, { zona_horaria: zona })}</span>
                ) : (
                  <span className="text-texto-3">Sin ver</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
