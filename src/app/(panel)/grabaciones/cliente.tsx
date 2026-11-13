"use client";

import { iniciales as inicialesDe } from "@/lib/formato";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent } from "react";
import { ArrowRight, Check, Download, Pause, Play, Search, Upload } from "lucide-react";
import { useToast } from "@/components/toasts";
import { PopupLead } from "@/components/popup-lead";
import { exigirOk } from "@/lib/resultado-cliente";
import { duracionTexto } from "@/lib/grabaciones";
import type { Proyecto } from "@/lib/tipos";
import { guardarTranscripcion } from "./acciones";

export type GrabacionFila = { id: string; leadId: string | null; lead: string; callerId: string; caller: string; duracion: number; transcripcion: string | null; creado_en: string };

// Maqueta «Grabaciones» (Cristian, 11 nov): perfiles arriba, lista por día y reproductor propio. El <audio> nativo
// no sirve: las grabaciones webm de MediaRecorder no guardan su duración (el navegador lee Infinity y se queda en 0:00),
// así que el total sale de duracion_seg de la base de datos.
const COLORES = ["#e8590c", "#0ca678", "#7048e8", "#1971c2", "#c2255c", "#2b8a3e", "#e67700", "#5f3dc4"];
const colorDe = (id: string) => COLORES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORES.length];
const iniciales = (n: string) => inicialesDe(n);
const BARRAS = Array.from({ length: 64 }, (_, i) => 20 + Math.abs(Math.sin(i * 1.7) * 60 + Math.cos(i * 0.6) * 20)); // decorativas, no es la onda real
const FILTROS = [["todas", "Todas"], ["sin", "Sin transcripción"], ["largas", "Más de 3 min"]] as const;

export function ListaGrabaciones({ filas, elegida, jefe, zona }: { filas: GrabacionFila[]; elegida: string | null; jefe: boolean; zona: Proyecto["zona_horaria"] }) {
  const toast = useToast();
  const [sel, setSel] = useState(elegida && filas.some((f) => f.id === elegida) ? elegida : filas[0].id);
  const [perfil, setPerfil] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number][0]>("todas");
  const [q, setQ] = useState("");
  const [sonando, setSonando] = useState(false);
  const [t, setT] = useState(0);
  const [vel, setVel] = useState(1);
  const [popup, setPopup] = useState<GrabacionFila | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const pendiente = useRef(false);
  const g = filas.find((f) => f.id === sel) ?? filas[0];
  const fecha = useMemo(() => new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: zona }), [zona]);
  const diaDe = useMemo(() => new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "short", timeZone: zona }), [zona]);

  const perfiles = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; n: number; seg: number }>();
    for (const f of filas) {
      const p = m.get(f.callerId) ?? { id: f.callerId, nombre: f.caller, n: 0, seg: 0 };
      m.set(f.callerId, { ...p, n: p.n + 1, seg: p.seg + f.duracion });
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [filas]);
  const busca = q.trim().toLowerCase();
  const visibles = filas.filter((f) => (!perfil || f.callerId === perfil) && (filtro !== "sin" || !f.transcripcion) && (filtro !== "largas" || f.duracion > 180) && f.lead.toLowerCase().includes(busca));

  const dur = g.duracion > 0 ? g.duracion : 0;
  const elegir = (id: string) => {
    if (id === sel) return;
    setSel(id);
    setT(0);
    setSonando(false);
    window.history.replaceState(null, "", `/grabaciones?g=${id}`);
  };
  const tocar = (id: string) => {
    const a = audio.current;
    if (id !== sel) {
      pendiente.current = true;
      return elegir(id);
    }
    if (!a) return;
    if (a.paused) a.play().catch(() => toast("No se pudo reproducir la grabación.", "error"));
    else a.pause();
  };
  // Al cambiar de grabación con el play, arranca la nueva en cuanto React pone su src.
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    a.playbackRate = vel;
    if (pendiente.current) {
      pendiente.current = false;
      a.play().catch(() => toast("No se pudo reproducir la grabación.", "error"));
    }
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps -- solo al cambiar de grabación
  const saltar = (s: number) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = Math.max(0, dur ? Math.min(dur, s) : s);
    setT(a.currentTime);
  };
  const cambiarVel = () => {
    const v = vel === 1 ? 1.5 : vel === 1.5 ? 2 : 1;
    setVel(v);
    if (audio.current) audio.current.playbackRate = v;
  };

  return (
    <div className="space-y-4">
      {jefe && perfiles.length > 1 && (
        <div>
          <p className="titulo-seccion">Perfiles</p>
          <div className="flex gap-2.5 overflow-x-auto pb-2">
            {[{ id: null, nombre: "Todos", n: filas.length, seg: filas.reduce((a, f) => a + f.duracion, 0) }, ...perfiles].map((p) => {
              const on = perfil === p.id;
              return (
                <button key={p.id ?? "todos"} type="button" onClick={() => setPerfil(p.id)} aria-pressed={on} className={`flex shrink-0 items-center gap-2.5 rounded-2xl border py-2 pl-2 pr-3.5 text-left transition ${on ? "border-primario bg-primario text-white" : "border-borde bg-panel hover:border-borde-fuerte"}`}>
                  <span className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white" style={{ background: p.id ? colorDe(p.id) : "var(--color-primario)" }}>{p.id ? iniciales(p.nombre) : "★"}</span>
                  <span>
                    <span className="block text-sm font-semibold">{p.nombre}</span>
                    <span className={`block text-xs ${on ? "text-white/80" : "text-texto-3"}`}>{p.n} llamadas · {Math.round(p.seg / 60)} min</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="tarjeta overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-borde p-3">
            <label className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar lead…" className="campo pl-9 text-sm" aria-label="Buscar lead" />
            </label>
            {FILTROS.map(([k, txt]) => (
              <button key={k} type="button" onClick={() => setFiltro(k)} aria-pressed={filtro === k} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${filtro === k ? "border-texto bg-texto text-panel" : "border-borde bg-panel text-texto-2"}`}>{txt}</button>
            ))}
          </div>
          {visibles.length === 0 ? (
            <p className="p-8 text-center text-sm text-texto-2">No hay grabaciones con este filtro.</p>
          ) : (
            <ul>
              {visibles.map((f, i) => {
                const on = f.id === g.id;
                const dia = diaDe.format(new Date(f.creado_en));
                const cabecera = i === 0 || dia !== diaDe.format(new Date(visibles[i - 1].creado_en)) ? (<li key={`d-${f.id}`} className="px-4 pb-1 pt-3.5 text-xs font-bold uppercase tracking-wider text-texto-3">{dia}</li>) : null;
                return [
                  cabecera,
                  <li key={f.id} onClick={() => elegir(f.id)} className={`grid cursor-pointer grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 border-l-[3px] px-4 py-2.5 ${on ? "border-primario bg-primario-suave" : "border-transparent hover:bg-panel-2"}`}>
                    <button type="button" onClick={(e) => (e.stopPropagation(), tocar(f.id))} aria-label={on && sonando ? `Pausar ${f.lead}` : `Escuchar ${f.lead}`} className={`grid h-10 w-10 place-items-center rounded-full shadow-sm ${on ? "bg-primario text-white" : "bg-panel text-primario ring-1 ring-borde"}`}>
                      {on && sonando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0">
                      <p className="truncate font-semibold" title={f.leadId ? "Doble clic: ver el lead" : undefined} onDoubleClick={(e) => (e.stopPropagation(), f.leadId && setPopup(f))}>{f.lead}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-texto-2">
                        <span className="tabular-nums">{fecha.format(new Date(f.creado_en))}</span>·
                        {jefe && <><span className="font-semibold" style={{ color: colorDe(f.callerId) }}>{f.caller}</span>·</>}
                        <span className="tabular-nums">{on ? `${duracionTexto(t)} / ` : ""}{duracionTexto(f.duracion)}</span>
                        {on && dur > 0 && <span className="h-1 w-24 overflow-hidden rounded bg-borde"><i className="block h-full bg-primario" style={{ width: `${Math.min(100, (t / dur) * 100)}%` }} /></span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {f.transcripcion ? <span className="chip hidden bg-ok-suave text-ok-texto sm:inline-flex"><Check className="h-3 w-3" /> Transcrita</span> : <span className="chip hidden bg-aviso-suave text-aviso-texto sm:inline-flex">Pendiente</span>}
                      <a href={`/api/grabaciones/${f.id}?descargar=1`} onClick={(e) => e.stopPropagation()} aria-label={`Descargar ${f.lead}`} title="Descargar" className="grid h-8 w-8 place-items-center rounded-lg border border-borde bg-panel text-texto-2 hover:text-texto"><Download className="h-4 w-4" /></a>
                    </div>
                  </li>,
                ];
              })}
            </ul>
          )}
        </div>

        <section className="tarjeta p-5 xl:sticky xl:top-5">
          <p className="titulo-seccion">Grabación</p>
          <h3 className="text-xl font-semibold">{g.lead}</h3>
          <p className="text-xs text-texto-3">{diaDe.format(new Date(g.creado_en))}, {fecha.format(new Date(g.creado_en))}{jefe ? <> · <b style={{ color: colorDe(g.callerId) }}>{g.caller}</b></> : ""}</p>
          {/* El audio llega por /api/grabaciones/<id> (enlace firmado de Supabase, 1 hora) */}
          <audio
            ref={audio}
            src={`/api/grabaciones/${g.id}`}
            preload="metadata"
            onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
            onPlay={() => setSonando(true)}
            onPause={() => setSonando(false)}
            onEnded={() => setSonando(false)}
            onError={() => toast("No se pudo cargar el audio de esta grabación.", "error")}
          />
          <div className="mt-4 rounded-2xl bg-gradient-to-br from-[#1c2350] to-primario p-4 text-white">
            <div
              role="slider"
              tabIndex={0}
              aria-label="Posición del audio"
              aria-valuemin={0}
              aria-valuemax={dur}
              aria-valuenow={Math.floor(t)}
              aria-valuetext={`${duracionTexto(t)} de ${duracionTexto(dur)}`}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                saltar(((e.clientX - r.left) / r.width) * dur);
              }}
              onKeyDown={(e) => (e.key === "ArrowRight" ? saltar(t + 5) : e.key === "ArrowLeft" ? saltar(t - 5) : null)}
              className="flex h-14 cursor-pointer items-center gap-0.5"
            >
              {BARRAS.map((h, i) => <b key={i} className={`flex-1 rounded-sm ${dur && i / BARRAS.length < t / dur ? "bg-white" : "bg-white/35"}`} style={{ height: `${h}%` }} />)}
            </div>
            <div className="mt-2 flex justify-between text-sm tabular-nums opacity-90"><span>{duracionTexto(t)}</span><span>{duracionTexto(dur)}</span></div>
            <div className="mt-2.5 flex items-center justify-center gap-3">
              <button type="button" onClick={() => saltar(t - 10)} className="rounded-full bg-white/15 px-3 py-2 text-sm hover:bg-white/25">−10 s</button>
              <button type="button" onClick={() => tocar(g.id)} aria-label={sonando ? "Pausar" : "Escuchar"} className="grid h-14 w-14 place-items-center rounded-full bg-white text-primario shadow">{sonando ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}</button>
              <button type="button" onClick={() => saltar(t + 10)} className="rounded-full bg-white/15 px-3 py-2 text-sm hover:bg-white/25">+10 s</button>
              <button type="button" onClick={cambiarVel} aria-label="Velocidad" className="rounded-full bg-white/15 px-3 py-2 text-sm tabular-nums hover:bg-white/25">{vel}×</button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <a href={`/api/grabaciones/${g.id}?descargar=1`} className="btn-secundario px-2.5 py-1.5 text-xs"><Download className="h-3.5 w-3.5" /> Descargar audio</a>
            {g.leadId && <Link href={jefe ? `/leads/${g.leadId}` : `/caller?lead=${g.leadId}`} className="btn-secundario px-2.5 py-1.5 text-xs">Abrir lead <ArrowRight className="h-3.5 w-3.5" /></Link>}
          </div>
          <Transcripcion key={g.id} g={g} jefe={jefe} />
        </section>
      </div>
      {popup?.leadId && <PopupLead leadId={popup.leadId} nombre={popup.lead} onCerrar={() => setPopup(null)} />}
    </div>
  );
}

function Transcripcion({ g, jefe }: { g: GrabacionFila; jefe: boolean }) {
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
    <>
      <p className="titulo-seccion mt-[18px]">Transcripción</p>
      {g.transcripcion && !editando ? (
        <>
          <div className="max-h-[280px] overflow-auto whitespace-pre-line rounded-xl border border-borde bg-panel-2 px-3 py-2.5 text-sm leading-relaxed">{g.transcripcion}</div>
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
    </>
  );
}
