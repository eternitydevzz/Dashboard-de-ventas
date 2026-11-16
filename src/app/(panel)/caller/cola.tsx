"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useOptimistic, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Search } from "lucide-react";
import { ETIQUETA_ESTADO_CALLER, fechaHora, iniciales as inicialesDe, nombrePais } from "@/lib/formato";
import { nivel } from "@/lib/prioridad";
import { Insignia, Vacio } from "@/components/ui";
import { AccionesLead } from "@/components/acciones-lead";
import type { Guion } from "@/lib/guiones";
import type { Lead, Producto, Proyecto, Rol } from "@/lib/tipos";
import { buscaCola, descompactarRespuestas, ordenarCola, type CampoOrden, type OrdenCola, type RespuestasCompactas } from "@/lib/cola";
import { colorEstado } from "@/lib/estados-caller";
import { conZona } from "@/app/(panel)/perfil/foto-zona";
import { nombreZona } from "@/lib/zona-persona";

export type LeadCola = Pick<Lead, "id" | "nombre" | "apellido" | "email" | "telefono" | "pais" | "estado_caller" | "llamar_en" | "creado_en" | "respuestas" | "pipeline_id"> & { puntos: number };
// Ola 2: llega con las respuestas compactas (lib/cola.ts) y aquí se rehacen
type LeadEnviado = Omit<LeadCola, "respuestas"> & { r: RespuestasCompactas };

const iniciales = (n: string) => inicialesDe(n) || "?";
const nombreDe = (l: Pick<LeadCola, "nombre" | "apellido">) => `${l.nombre} ${l.apellido}`.trim() || "Sin nombre";
const letra = (puntos: number) => nivel(puntos).texto.slice(-1); // «Prioridad A» → «A»
const SIN_CAMBIOS: Record<string, LeadCola> = {};

// R10/C3: cambiar de columna sigue yendo al servidor (aquí solo están los leads de la columna elegida); al menos se
// ve al momento que está cargando (punto en la pastilla y la lista atenuada). Va dentro de cada pastilla (Link).
export function CargandoColumna() {
  const { pending } = useLinkStatus();
  return <span aria-hidden data-cargando={pending ? "" : undefined} className={`ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primario align-middle transition-opacity ${pending ? "animate-pulse opacity-100" : "opacity-0"}`} />;
}

// Velocidad (28 oct 2026, Cristian: «el equipo dice que va muy lento»): elegir un lead de la cola no pide la página al
// servidor: se cambia la dirección con pushState (Next la sincroniza con useSearchParams) y la ficha sale al momento.
// C5 (plan Callers, 7c.1; maqueta aprobada el 7 nov): a la izquierda la cola (pastillas, buscador, tabla con 4
// cabeceras que ordenan en el servidor); a la derecha la cabecera azul del lead, «¿Cómo ha ido?» y el formulario.
// En el móvil la tabla se desliza de lado dentro de su tarjeta y, al tocar un lead, la pantalla baja a su ficha.
export function ColaCaller({
  pestanas,
  leads: enviados,
  preguntas,
  total,
  asignados,
  callerId,
  pestana,
  busqueda,
  orden,
  zona,
  conIA,
  closers,
  productos,
  rol,
  linkAgenda,
  moneda,
  guion,
  miNombre,
  nombresPipeline,
  puedeGrabar,
}: {
  pestanas: ReactNode;
  leads: LeadEnviado[];
  preguntas: string[];
  total: number;
  asignados: number;
  callerId: string | null; // solo para los jefes, que miran la cola de otro
  pestana: string;
  busqueda: string; // R8: ?q= (el servidor ya buscó en todos los leads del caller)
  orden: OrdenCola | null;
  zona: Proyecto["zona_horaria"];
  conIA: boolean;
  closers: { id: string; nombre: string }[];
  productos: Producto[];
  rol: Rol;
  linkAgenda?: string | null;
  moneda: string;
  guion: Guion;
  miNombre: string;
  nombresPipeline: Record<string, string>; // pipeline de origen del lead («Webinar 1»…), en la cabecera
  puedeGrabar: boolean; // C10
}) {
  const servidor = useMemo((): LeadCola[] => enviados.map(({ r, ...l }) => ({ ...l, respuestas: descompactarRespuestas(preguntas, r) })), [enviados, preguntas]);
  // C1/R2/C13: un resultado cambia el lead en pantalla al momento (mientras guarda); al responder el servidor manda lo suyo.
  // Si falla, React lo devuelve solo a como estaba. Deshacer lo trae de vuelta igual (por eso se guarda el lead entero).
  const [cambios, cambiar] = useOptimistic(SIN_CAMBIOS, (s, l: LeadCola) => ({ ...s, [l.id]: l }));
  const leads = useMemo(() => {
    const vistos = servidor.map((l) => cambios[l.id] ?? l);
    const vuelven = Object.values(cambios).filter((c) => !servidor.some((l) => l.id === c.id));
    if (!vuelven.length) return vistos;
    const todos = [...vistos, ...vuelven];
    return orden ? ordenarCola(todos, orden) : todos.sort((a, b) => b.creado_en.localeCompare(a.creado_en)); // el orden de siempre (lib/cola)
  }, [servidor, cambios, orden]);
  const elegido = useSearchParams().get("lead");
  const router = useRouter();
  const [busca, setBusca] = useState(busqueda);
  const [busquedaVista, setBusquedaVista] = useState(busqueda);
  if (busqueda !== busquedaVista) {
    setBusquedaVista(busqueda); // al cambiar de pastilla (sin ?q=) el buscador se vacía
    if (busqueda.trim() !== busca.trim()) setBusca(busqueda);
  }
  const [guionDe, setGuionDe] = useState<string | null>(null); // lead con el guion abierto
  const posicion = useRef(0); // dónde estaba en la lista el lead del guion (por si sale de ella al cambiar de columna)
  const ficha = useRef<HTMLDivElement>(null);
  const q = busca.trim();
  // Con ?q= la lista trae todas las columnas; sin él, solo la de la pastilla (un lead que cambia de columna sale al momento)
  const filas = useMemo(() => leads.filter((l) => (busqueda || l.estado_caller === pestana) && buscaCola(l, q)), [leads, busqueda, pestana, q]);
  // Revisión del 7 nov: si el lead elegido sale de la lista al cambiarlo de columna (p. ej. con la pastilla «Leads
  // nuevos» puesta), se queda en pantalla (y su guion abierto) en vez de saltar a otro a mitad de la llamada
  const [ultimo, setUltimo] = useState<LeadCola | null>(null);
  const encontrado = leads.find((l) => l.id === elegido);
  if (encontrado && encontrado !== ultimo) setUltimo(encontrado); // patrón de React: se ajusta al pintar, sin efecto
  const seleccionado = encontrado ?? (elegido && ultimo?.id === elegido ? ultimo : null) ?? filas[0] ?? null;
  const dia = useMemo(() => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: zona }), [zona]);
  const hora = useMemo(() => new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: zona }), [zona]);

  const parametros = () => {
    const p = new URLSearchParams();
    if (callerId) p.set("caller", callerId);
    p.set("columna", pestana);
    if (busqueda) p.set("q", busqueda);
    return p;
  };
  // R8: lo escrito va a la dirección (?q=) tras una pausa y el servidor busca en todos los leads del caller
  useEffect(() => {
    if (q === busqueda.trim()) return;
    const t = setTimeout(() => {
      const p = parametros();
      if (orden) (p.set("orden", orden.campo), p.set("dir", orden.dir === 1 ? "asc" : "desc"));
      p.delete("q"); // al vaciar el buscador, fuera la búsqueda vieja
      if (q) p.set("q", q);
      startTransition(() => router.replace(`/caller?${p.toString()}`, { scroll: false }));
    }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps -- solo al escribir
  const enlace = (leadId: string) => {
    const p = parametros();
    if (orden) {
      p.set("orden", orden.campo);
      p.set("dir", orden.dir === 1 ? "asc" : "desc");
    }
    p.set("lead", leadId);
    return `/caller?${p.toString()}`;
  };
  // C2: cada cabecera ordena en el servidor (sobre todos los leads); otro clic, al revés
  const enlaceOrden = (campo: CampoOrden) => {
    const p = parametros();
    p.set("orden", campo);
    p.set("dir", orden?.campo === campo && orden.dir === 1 ? "desc" : "asc");
    return `/caller?${p.toString()}`;
  };
  const elegir = (leadId: string) => {
    if (leadId !== seleccionado?.id) window.history.pushState(null, "", enlace(leadId));
    if (window.matchMedia("(max-width: 1099px)").matches) requestAnimationFrame(() => ficha.current?.scrollIntoView({ block: "start" }));
  };
  const clicFila = (e: MouseEvent, leadId: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return void window.open(enlace(leadId), "_blank");
    elegir(leadId);
  };
  const teclaFila = (e: KeyboardEvent, leadId: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      elegir(leadId);
    }
  };
  // «Siguiente» del guion: el siguiente de la lista tal como se ve ahora (orden, filtro y buscador)
  const abrirGuion = (abierto: boolean) => {
    if (abierto && seleccionado) posicion.current = Math.max(0, filas.findIndex((l) => l.id === seleccionado.id));
    // Cristian, 10 nov: el lead que sale elegido de serie no iba en la URL; al cambiarlo de columna salía de la lista,
    // se cerraba su guion y la pantalla saltaba a otro lead (con su ficha vacía). Con él en la URL se queda en pantalla.
    if (abierto && seleccionado && seleccionado.id !== elegido) window.history.replaceState(null, "", enlace(seleccionado.id));
    setGuionDe(abierto ? seleccionado?.id ?? null : null);
  };
  const siguiente = () => {
    const i = filas.findIndex((l) => l.id === seleccionado?.id);
    const n = i >= 0 ? i + 1 : posicion.current; // si salió de la lista (cambió de columna), el que ocupó su sitio
    const sig = filas[n];
    if (!sig) return setGuionDe(null);
    posicion.current = n;
    window.history.pushState(null, "", enlace(sig.id));
    setGuionDe(sig.id);
  };

  const CABECERAS: { campo: CampoOrden; t: string; ayuda: string; ancho: string }[] = [
    { campo: "nombre", t: "Nombre", ayuda: "de la A a la Z", ancho: "w-[35%]" },
    { campo: "pais", t: "País", ayuda: "de la A a la Z", ancho: "w-[28%]" },
    { campo: "prio", t: "Prioridad", ayuda: "primero las A", ancho: "w-[21%]" },
    { campo: "entro", t: "Entró", ayuda: "los más recientes primero", ancho: "" },
  ];

  return (
    <div className="grid items-start gap-[18px] min-[1100px]:grid-cols-[492px_minmax(0,1fr)]">
      <aside className="group/cola tarjeta flex flex-col overflow-hidden min-[1100px]:sticky min-[1100px]:top-4 min-[1100px]:max-h-[calc(100vh-32px)]">
        {pestanas}
        {/* Revisión en la app (7 nov): sin shrink-0, la columna aplastaba las pastillas y el buscador a 1440 px */}
        <div className="relative shrink-0 border-b border-borde px-2.5 py-2">
          <Search className="pointer-events-none absolute left-[21px] top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} className="campo pl-[34px]" placeholder="Buscar por nombre o teléfono…" aria-label="Buscar por nombre o teléfono" />
        </div>
        <div className="max-h-[70vh] flex-1 overflow-auto transition-opacity group-has-[[data-cargando]]/cola:opacity-50 min-[1100px]:max-h-none">
          <table className="w-full min-w-[470px] table-fixed border-collapse text-[13px]">
            <thead>
              <tr>
                {CABECERAS.map((c) => {
                  const on = orden?.campo === c.campo;
                  const Flecha = on ? (orden.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
                  return (
                    <th key={c.campo} className={`sticky top-0 z-[1] border-b border-borde bg-[var(--fondo)] px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.02em] text-texto-3 ${c.ancho}`} aria-sort={on ? (orden.dir === 1 ? "ascending" : "descending") : "none"}>
                      <Link prefetch={false} href={enlaceOrden(c.campo)} title={`Ordenar por ${c.t.toLowerCase()}: ${c.ayuda}${on ? " (clic: al revés)" : ""}`} className="inline-flex items-center gap-1 hover:text-primario">
                        {c.t} <Flecha className={`h-3 w-3 ${on ? "text-primario" : ""}`} />
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td colSpan={4}><Vacio icono={Inbox} texto={q ? "Nadie con ese nombre o teléfono en esta lista." : "Nada por aquí. ¡Buen trabajo!"} /></td></tr>
              )}
              {filas.map((l) => {
                const sel = seleccionado?.id === l.id;
                const c = colorEstado(l.estado_caller);
                return (
                  <tr key={l.id} tabIndex={0} aria-selected={sel} onClick={(e) => clicFila(e, l.id)} onKeyDown={(e) => teclaFila(e, l.id)} className={`cursor-pointer border-b border-borde transition-colors ${sel ? "bg-primario-suave shadow-[inset_3px_0_0_var(--primario)]" : "hover:bg-panel-2"}`}>
                    <td className="px-2 py-2.5 align-top">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="hidden h-8 w-8 shrink-0 place-items-center rounded-[10px] text-[11.5px] font-bold sm:grid" style={{ background: `color-mix(in srgb, ${c} 16%, var(--panel-2))` }}>{iniciales(nombreDe(l))}</span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{nombreDe(l)}</div>
                          <div className="flex items-center gap-1 truncate text-[11.5px] text-texto-3"><span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: c }} />{ETIQUETA_ESTADO_CALLER[l.estado_caller] ?? l.estado_caller}{l.estado_caller === "llamar_luego" && l.llamar_en && <span className="font-semibold text-texto-2"> · {fechaHora(l.llamar_en, { zona_horaria: zona })}</span>}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 align-top">
                      <div className="truncate">{nombrePais(l.pais)}</div>
                      <div className="truncate whitespace-nowrap text-[11.5px] tabular-nums text-texto-3">{l.telefono ?? "—"}</div>
                    </td>
                    <td className="px-2 py-2.5 align-top"><Insignia tono={nivel(l.puntos).tono}>{letra(l.puntos)}</Insignia> <span className="text-[11.5px] text-texto-3">{l.puntos}</span></td>
                    <td className="whitespace-nowrap px-2 py-2.5 align-top tabular-nums">{dia.format(new Date(l.creado_en))}<div className="text-[11.5px] text-texto-3">{hora.format(new Date(l.creado_en))}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* F7: avisa cuando no se pintan todos */}
        <div className="shrink-0 border-t border-borde px-3.5 py-2.5 text-xs text-texto-3">{total} leads{busqueda ? " en todas las columnas" : ""}{total > servidor.length ? ` · se ven los ${servidor.length} primeros: ordena o filtra para ver otros` : ""}{q ? ` · ${filas.length} con «${q}»` : ""}</div>
      </aside>

      <div ref={ficha} className="flex min-w-0 scroll-mt-4 flex-col gap-4">
        {seleccionado ? (
          <>
            <AccionesLead
              key={seleccionado.id}
              variante="cola"
              leadId={seleccionado.id}
              telefono={seleccionado.telefono}
              closers={closers}
              productos={productos}
              rol={rol}
              linkAgenda={linkAgenda}
              moneda={moneda}
              guion={guion}
              nombreLead={nombreDe(seleccionado)}
              miNombre={miNombre}
              estado={seleccionado.estado_caller}
              onCambio={(c) => {
                // A4-01: sin ?lead= la pantalla saltaría al siguiente al salir el lead de la lista
                if (location.pathname === "/caller" && !new URLSearchParams(location.search).get("lead")) window.history.replaceState(null, "", enlace(seleccionado.id)); // revisor: no si se deshace desde otra pantalla
                cambiar({ ...seleccionado, ...c });
              }}
              respuestas={seleccionado.respuestas}
              guionAbierto={guionDe === seleccionado.id}
              onGuionAbierto={abrirGuion}
              onSiguiente={siguiente}
              puedeGrabar={puedeGrabar}
              cabecera={
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl border border-white/30 bg-white/20 text-[15px] font-bold" aria-hidden>{iniciales(nombreDe(seleccionado))}</span>
                  <div className="min-w-0">
                    <h2 className="text-[19px] font-semibold leading-tight">{nombreDe(seleccionado)}</h2>
                    {seleccionado.telefono && <div className="mt-0.5 text-[14.5px] font-semibold tabular-nums">{seleccionado.telefono}</div>}
                    <div className="mt-0.5 break-words text-xs text-white/85">
                      {[nombrePais(seleccionado.pais), seleccionado.email?.trim(), `Entró el ${dia.format(new Date(seleccionado.creado_en))}, ${hora.format(new Date(seleccionado.creado_en))}${conZona(rol) ? ` (hora de ${nombreZona(zona)})` : ""}`, seleccionado.pipeline_id ? nombresPipeline[seleccionado.pipeline_id] : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
                  {/* Cristian (7 nov): estado y prioridad arriba a la derecha (en el móvil, debajo del nombre) */}
                  <div className="flex flex-wrap gap-1.5 sm:max-w-[45%] sm:shrink-0 sm:justify-end">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-[11.5px] font-bold">
                        <span className="h-2 w-2 rounded-full shadow-[0_0_0_1.5px_#fff]" style={{ background: colorEstado(seleccionado.estado_caller) }} />
                        {ETIQUETA_ESTADO_CALLER[seleccionado.estado_caller] ?? seleccionado.estado_caller}
                      </span>
                      <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-[11.5px] font-bold">Prioridad {letra(seleccionado.puntos)} · {seleccionado.puntos} pts{conIA ? " · IA" : ""}</span>
                  </div>
                </div>
              }
            />
            <section className="tarjeta px-4 py-4 sm:px-5">
              <h3 className="mb-3.5 text-[15px] font-semibold">Lo que respondió en el formulario</h3>
              {seleccionado.respuestas.length === 0 ? (
                <p className="text-sm text-texto-3">Este lead no tiene respuestas de formulario.</p>
              ) : (
                <dl className="grid gap-2.5 sm:grid-cols-2">
                  {seleccionado.respuestas.map((r) => (
                    <div key={r.pregunta} className="rounded-xl border border-borde bg-panel-2 px-3 py-2.5">
                      <dt className="text-[11.5px] text-texto-3">{r.pregunta}</dt>
                      <dd className="mt-0.5 font-semibold">{r.respuesta || <span className="font-normal text-texto-3">Sin responder</span>}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          </>
        ) : (
          <div className="tarjeta"><Vacio icono={Inbox} texto={asignados ? "Elige un lead de la lista." : "Todavía no tienes leads asignados. Tu director te los asigna desde el CRM."} /></div>
        )}
      </div>
    </div>
  );
}
