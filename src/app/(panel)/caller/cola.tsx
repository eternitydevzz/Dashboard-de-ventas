"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Search } from "lucide-react";
import { ETIQUETA_ESTADO_CALLER, nombrePais } from "@/lib/formato";
import { nivel } from "@/lib/prioridad";
import { Insignia, Vacio } from "@/components/ui";
import { AccionesLead } from "@/components/acciones-lead";
import type { Guion } from "@/lib/guiones";
import type { Lead, Producto, Proyecto, Rol } from "@/lib/tipos";
import type { CampoOrden, OrdenCola } from "@/lib/cola";
import { colorEstado } from "@/lib/estados-caller";

export type LeadCola = Pick<Lead, "id" | "nombre" | "apellido" | "email" | "telefono" | "pais" | "estado_caller" | "creado_en" | "etiquetas" | "respuestas" | "pipeline_id"> & { puntos: number };

const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("") || "?";
const nombreDe = (l: Pick<LeadCola, "nombre" | "apellido">) => `${l.nombre} ${l.apellido}`.trim() || "Sin nombre";
const letra = (puntos: number) => nivel(puntos).texto.slice(-1); // «Prioridad A» → «A»

// Velocidad (28 oct 2026, Cristian: «el equipo dice que va muy lento»): elegir un lead de la cola no pide la página al
// servidor: se cambia la dirección con pushState (Next la sincroniza con useSearchParams) y la ficha sale al momento.
// C5 (plan Callers, 7c.1; maqueta aprobada el 7 nov): a la izquierda la cola (pastillas, buscador, tabla con 4
// cabeceras que ordenan en el servidor); a la derecha la cabecera azul del lead, «¿Cómo ha ido?» y el formulario.
// En el móvil la tabla se desliza de lado dentro de su tarjeta y, al tocar un lead, la pantalla baja a su ficha.
export function ColaCaller({
  pestanas,
  leads,
  total,
  asignados,
  callerId,
  pestana,
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
}: {
  pestanas: ReactNode;
  leads: LeadCola[];
  total: number;
  asignados: number;
  callerId: string | null; // solo para los jefes, que miran la cola de otro
  pestana: string;
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
}) {
  const elegido = useSearchParams().get("lead");
  const [busca, setBusca] = useState("");
  const [guionDe, setGuionDe] = useState<string | null>(null); // lead con el guion abierto
  const posicion = useRef(0); // dónde estaba en la lista el lead del guion (por si sale de ella al cambiar de columna)
  const ficha = useRef<HTMLDivElement>(null);
  const q = busca.trim().toLowerCase();
  const filas = useMemo(() => (q ? leads.filter((l) => nombreDe(l).toLowerCase().includes(q) || (l.telefono ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, ""))) : leads), [leads, q]);
  const seleccionado = leads.find((l) => l.id === elegido) ?? filas[0] ?? null;
  const dia = useMemo(() => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: zona }), [zona]);
  const hora = useMemo(() => new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: zona }), [zona]);

  const parametros = () => {
    const p = new URLSearchParams();
    if (callerId) p.set("caller", callerId);
    p.set("columna", pestana);
    return p;
  };
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
      <aside className="tarjeta flex flex-col overflow-hidden min-[1100px]:sticky min-[1100px]:top-4 min-[1100px]:max-h-[calc(100vh-32px)]">
        {pestanas}
        <div className="relative border-b border-borde px-2.5 py-2">
          <Search className="pointer-events-none absolute left-[21px] top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} className="campo pl-[34px]" placeholder="Buscar por nombre o teléfono…" aria-label="Buscar por nombre o teléfono" />
        </div>
        <div className="max-h-[70vh] flex-1 overflow-auto min-[1100px]:max-h-none">
          <table className="w-full min-w-[470px] table-fixed border-collapse text-[13px]">
            <thead>
              <tr>
                {CABECERAS.map((c) => {
                  const on = orden?.campo === c.campo;
                  const Flecha = on ? (orden.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
                  return (
                    <th key={c.campo} className={`sticky top-0 z-[1] border-b border-borde bg-[var(--fondo)] px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.02em] text-texto-3 ${c.ancho}`} aria-sort={on ? (orden.dir === 1 ? "ascending" : "descending") : "none"}>
                      <Link href={enlaceOrden(c.campo)} title={`Ordenar por ${c.t.toLowerCase()}: ${c.ayuda}${on ? " (clic: al revés)" : ""}`} className="inline-flex items-center gap-1 hover:text-primario">
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
                          <div className="flex items-center gap-1 truncate text-[11.5px] text-texto-3"><span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: c }} />{ETIQUETA_ESTADO_CALLER[l.estado_caller] ?? l.estado_caller}</div>
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
        <div className="border-t border-borde px-3.5 py-2.5 text-xs text-texto-3">{total} leads{total > leads.length ? ` · se ven los ${leads.length} primeros: ordena o filtra para ver otros` : ""}{q ? ` · ${filas.length} con «${busca.trim()}»` : ""}</div>
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
              respuestas={seleccionado.respuestas}
              guionAbierto={guionDe === seleccionado.id}
              onGuionAbierto={abrirGuion}
              onSiguiente={siguiente}
              cabecera={
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl border border-white/30 bg-white/20 text-[15px] font-bold" aria-hidden>{iniciales(nombreDe(seleccionado))}</span>
                  <div className="min-w-0">
                    <h2 className="text-[19px] font-semibold leading-tight">{nombreDe(seleccionado)}</h2>
                    {seleccionado.telefono && <div className="mt-0.5 text-[14.5px] font-semibold tabular-nums">{seleccionado.telefono}</div>}
                    <div className="mt-0.5 break-words text-xs text-white/85">
                      {[nombrePais(seleccionado.pais), seleccionado.email, `Entró el ${dia.format(new Date(seleccionado.creado_en))}, ${hora.format(new Date(seleccionado.creado_en))}`, seleccionado.pipeline_id ? nombresPipeline[seleccionado.pipeline_id] : null].filter(Boolean).join(" · ")}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-[11.5px] font-bold">
                        <span className="h-2 w-2 rounded-full shadow-[0_0_0_1.5px_#fff]" style={{ background: colorEstado(seleccionado.estado_caller) }} />
                        {ETIQUETA_ESTADO_CALLER[seleccionado.estado_caller] ?? seleccionado.estado_caller}
                      </span>
                      <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-[11.5px] font-bold">Prioridad {letra(seleccionado.puntos)} · {seleccionado.puntos} pts{conIA ? " · IA" : ""}</span>
                    </div>
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
