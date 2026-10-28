"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { Inbox } from "lucide-react";
import { fechaHora, ETIQUETA_ESTADO_CALLER, nombrePais } from "@/lib/formato";
import { nivel } from "@/lib/prioridad";
import { Seccion, Insignia, Vacio } from "@/components/ui";
import { AccionesLead } from "@/components/acciones-lead";
import type { Guion } from "@/lib/guiones";
import type { Lead, Producto, Proyecto, Rol } from "@/lib/tipos";

export type LeadCola = Pick<Lead, "id" | "nombre" | "apellido" | "email" | "telefono" | "pais" | "estado_caller" | "llamar_en" | "creado_en" | "etiquetas" | "respuestas"> & { puntos: number };

// Velocidad (28 oct 2026, Cristian: «el equipo dice que va muy lento»): elegir un lead de la cola ya no pide la
// página al servidor (medido: 0,52–0,64 s por clic, ~9 consultas y todos los leads cada vez). Los leads ya están
// aquí; se cambia la dirección con pushState (Next la sincroniza con useSearchParams) y la ficha sale al momento.
// El lead elegido sale de la dirección (?lead=): así siguen valiendo «Atrás», el aviso «Te toca…» y guardar.
export function ColaCaller({
  pestanas,
  leads,
  total,
  asignados,
  callerId,
  pestana,
  zona,
  conIA,
  closers,
  productos,
  rol,
  linkAgenda,
  moneda,
  guion,
  miNombre,
}: {
  pestanas: ReactNode;
  leads: LeadCola[];
  total: number;
  asignados: number;
  callerId: string | null; // solo para los jefes, que miran la cola de otro
  pestana: string;
  zona: Proyecto["zona_horaria"];
  conIA: boolean;
  closers: { id: string; nombre: string }[];
  productos: Producto[];
  rol: Rol;
  linkAgenda?: string | null;
  moneda: string;
  guion: Guion;
  miNombre: string;
}) {
  const elegido = useSearchParams().get("lead");
  const seleccionado = leads.find((l) => l.id === elegido) ?? leads[0] ?? null;
  const proyecto = { zona_horaria: zona };
  const enlace = (leadId: string) => {
    const p = new URLSearchParams();
    if (callerId) p.set("caller", callerId);
    p.set("vista", pestana);
    p.set("lead", leadId);
    return `/caller?${p.toString()}`;
  };
  const elegir = (e: MouseEvent<HTMLAnchorElement>, leadId: string) => {
    // Con Cmd/Ctrl, Mayús o la rueda, el navegador hace lo suyo (abrir en otra pestaña)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (leadId !== seleccionado?.id) window.history.pushState(null, "", enlace(leadId));
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <div className="tarjeta flex max-h-[calc(100vh-280px)] min-h-96 flex-col overflow-hidden">
        {pestanas}
        <div className="border-b border-borde px-3 py-2 text-xs text-texto-3">{total} leads</div>
        <ul className="flex-1 divide-y divide-borde overflow-y-auto">
          {leads.length === 0 && <li><Vacio icono={Inbox} texto="Nada por aquí. ¡Buen trabajo!" /></li>}
          {leads.map((l) => {
            const n = nivel(l.puntos);
            return (
              <li key={l.id}>
                <a href={enlace(l.id)} onClick={(e) => elegir(e, l.id)} className={`block px-3 py-2.5 hover:bg-panel-2 ${seleccionado?.id === l.id ? "bg-primario-suave/50" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{`${l.nombre} ${l.apellido}`.trim()}</span>
                    <Insignia tono={n.tono}>{n.texto}</Insignia>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-xs text-texto-3">
                    <span>{l.telefono}{l.telefono && ` · ${nombrePais(l.pais)}`}</span>
                    <span>{l.estado_caller === "llamar_luego" && l.llamar_en ? `⏰ ${fechaHora(l.llamar_en, proyecto)}` : l.estado_caller === "link_enviado" && l.llamar_en ? `🔗 Link enviado · insistir ${fechaHora(l.llamar_en, proyecto)}` : ETIQUETA_ESTADO_CALLER[l.estado_caller]}</span>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      {seleccionado ? (
        <div className="space-y-5">
          <Seccion>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold">{`${seleccionado.nombre} ${seleccionado.apellido}`.trim()}</h2>
                <p className="text-sm text-texto-2">{seleccionado.telefono} · {nombrePais(seleccionado.pais)} · {seleccionado.email}</p>
                <p className="mt-1 text-xs text-texto-3">Entró el {fechaHora(seleccionado.creado_en, proyecto)} · {seleccionado.etiquetas.join(", ")}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Insignia tono={nivel(seleccionado.puntos).tono}>{nivel(seleccionado.puntos).texto} · {seleccionado.puntos} pts{conIA ? " · IA" : ""}</Insignia>
                <Link href={`/leads/${seleccionado.id}`} className="text-xs text-primario hover:underline">Ver ficha completa →</Link>
              </div>
            </div>
            <div className="mt-4">
              <AccionesLead
                leadId={seleccionado.id}
                telefono={seleccionado.telefono}
                closers={closers}
                productos={productos}
                rol={rol}
                linkAgenda={linkAgenda}
                moneda={moneda}
                guion={guion}
                nombreLead={`${seleccionado.nombre} ${seleccionado.apellido}`.trim()}
                miNombre={miNombre}
              />
            </div>
          </Seccion>
          <Seccion titulo="Lo que respondió en el formulario">
            <dl className="grid gap-3 sm:grid-cols-2">
              {seleccionado.respuestas.map((r) => (
                <div key={r.pregunta} className="rounded-lg border border-borde bg-panel-2 p-3">
                  <dt className="text-xs text-texto-3">{r.pregunta}</dt>
                  <dd className="mt-1 font-medium">{r.respuesta || <span className="text-texto-3">Sin responder</span>}</dd>
                </div>
              ))}
            </dl>
          </Seccion>
        </div>
      ) : (
        <div className="tarjeta"><Vacio icono={Inbox} texto={asignados ? "Elige un lead de la lista." : "Todavía no tienes leads asignados. Tu director te los asigna desde el CRM."} /></div>
      )}
    </div>
  );
}
