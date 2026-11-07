"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { ArrowRight, Check, Download, Play, Upload } from "lucide-react";
import { useToast } from "@/components/toasts";
import { exigirOk } from "@/lib/resultado-cliente";
import { duracionTexto } from "@/lib/grabaciones";
import type { Proyecto } from "@/lib/tipos";
import { guardarTranscripcion } from "./acciones";

export type GrabacionFila = { id: string; leadId: string | null; lead: string; caller: string; duracion: number; transcripcion: string | null; creado_en: string };

export function ListaGrabaciones({ filas, elegida, jefe, zona }: { filas: GrabacionFila[]; elegida: string | null; jefe: boolean; zona: Proyecto["zona_horaria"] }) {
  const [sel, setSel] = useState(elegida && filas.some((f) => f.id === elegida) ? elegida : filas[0].id);
  const g = filas.find((f) => f.id === sel) ?? filas[0];
  const fecha = useMemo(() => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: zona }), [zona]);
  const elegir = (id: string) => {
    setSel(id);
    window.history.replaceState(null, "", `/grabaciones?g=${id}`);
  };
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="tarjeta overflow-auto">
        <table className="tabla min-w-[560px] whitespace-nowrap">
          <thead><tr><th>Fecha</th>{jefe && <th>Caller</th>}<th>Lead</th><th>Duración</th><th>Transcripción</th><th></th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} tabIndex={0} onClick={() => elegir(f.id)} onKeyDown={(e) => e.key === "Enter" && elegir(f.id)} className={`cursor-pointer ${f.id === g.id ? "bg-primario-suave shadow-[inset_3px_0_0_var(--primario)]" : "hover:bg-panel-2"}`}>
                <td className="tabular-nums">{fecha.format(new Date(f.creado_en))}</td>
                {jefe && <td>{f.caller}</td>}
                <td className="font-semibold">{f.lead}</td>
                <td className="tabular-nums">{duracionTexto(f.duracion)}</td>
                <td>{f.transcripcion ? <span className="chip bg-ok-suave text-ok-texto"><Check className="h-3 w-3" /> Subida</span> : <span className="chip bg-panel-2 text-texto-2 ring-1 ring-borde">Pendiente</span>}</td>
                <td>
                  <div className="flex gap-1.5">
                    <button type="button" className="btn-secundario px-2 py-1 text-xs" onClick={(e) => (e.stopPropagation(), elegir(f.id))}><Play className="h-3.5 w-3.5" /> Escuchar</button>
                    <a href={`/api/grabaciones/${f.id}?descargar=1`} onClick={(e) => e.stopPropagation()} className="btn-secundario px-2 py-1 text-xs"><Download className="h-3.5 w-3.5" /> Descargar</a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Detalle key={g.id} g={g} jefe={jefe} fecha={fecha.format(new Date(g.creado_en))} />
    </div>
  );
}

function Detalle({ g, jefe, fecha }: { g: GrabacionFila; jefe: boolean; fecha: string }) {
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(g.transcripcion ?? "");
  const [guardando, iniciar] = useTransition();
  const guardar = (t: string) =>
    iniciar(async () => {
      try {
        await exigirOk(guardarTranscripcion(g.id, t));
        toast("Transcripción guardada");
        setEditando(false);
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      }
    });
  const leerTxt = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1_000_000) return toast("El .txt pesa más de 1 MB.", "error");
    const t = await f.text();
    setTexto(t);
    guardar(t);
  };
  return (
    <section className="tarjeta p-[18px]">
      <p className="titulo-seccion">Grabación</p>
      <h3 className="text-lg font-semibold">{g.lead}</h3>
      <p className="text-xs text-texto-3">{fecha} · {duracionTexto(g.duracion)}{jefe ? ` · ${g.caller}` : ""}</p>
      {/* El audio llega por /api/grabaciones/<id> (enlace firmado de Supabase, 1 hora) */}
      <audio controls preload="none" src={`/api/grabaciones/${g.id}`} className="mt-3 w-full">Tu navegador no puede reproducir el audio.</audio>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <a href={`/api/grabaciones/${g.id}?descargar=1`} className="btn-secundario px-2.5 py-1.5 text-xs"><Download className="h-3.5 w-3.5" /> Descargar audio</a>
        {g.leadId && <Link href={jefe ? `/leads/${g.leadId}` : `/caller?lead=${g.leadId}`} className="btn-secundario px-2.5 py-1.5 text-xs">Abrir lead <ArrowRight className="h-3.5 w-3.5" /></Link>}
      </div>
      <p className="titulo-seccion mt-[18px]">Transcripción</p>
      {g.transcripcion && !editando ? (
        <>
          <div className="max-h-[260px] overflow-auto whitespace-pre-line rounded-xl border border-borde bg-panel-2 px-3 py-2.5 text-sm">{g.transcripcion}</div>
          {jefe && <button type="button" className="btn-secundario mt-2 px-2.5 py-1.5 text-xs" onClick={() => setEditando(true)}>Cambiar transcripción</button>}
        </>
      ) : jefe ? (
        <div className="space-y-2">
          {!g.transcripcion && <p className="rounded-xl border border-borde bg-panel-2 px-3 py-2.5 text-xs text-texto-2">Todavía sin transcripción. Descárgala, transcríbela en local y súbela aquí.</p>}
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} className="campo text-sm" placeholder="Pega aquí el texto…" />
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="btn-primario px-2.5 py-1.5 text-xs" disabled={guardando || !texto.trim()} onClick={() => guardar(texto)}>{guardando ? "Guardando…" : "Guardar texto"}</button>
            <label className="btn-secundario cursor-pointer px-2.5 py-1.5 text-xs"><Upload className="h-3.5 w-3.5" /> Subir .txt<input type="file" accept=".txt,text/plain" className="sr-only" onChange={(e) => void leerTxt(e)} /></label>
            {editando && <button type="button" className="btn-secundario px-2.5 py-1.5 text-xs" onClick={() => (setEditando(false), setTexto(g.transcripcion ?? ""))}>Cancelar</button>}
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-borde bg-panel-2 px-3 py-2.5 text-xs text-texto-2">Todavía sin transcripción. La sube tu director.</p>
      )}
    </section>
  );
}
