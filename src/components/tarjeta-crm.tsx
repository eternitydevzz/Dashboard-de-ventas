"use client";

import { useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { Phone, Mail } from "lucide-react";
import { PopupLead } from "@/components/popup-lead";
import { nombrePais } from "@/lib/formato";

// Tarjeta común del CRM (Fase 4, como GHL): la misma en los pipelines de origen, «Callers» y «Closers».
// Arriba el nombre y la casilla para las acciones masivas; debajo teléfono y email; después las
// etiquetas (chips) y, si hace falta, lo propio de cada tablero (botones de la cita, importes de la venta…).
// Se mueve solo arrastrando: sin «Mover a…» (Cristian, 12 oct 2026).
// Un clic en cualquier parte (menos sus botones y la casilla) abre el popup del lead (Cristian, 13 oct 2026).
export function TarjetaCrm({
  leadId,
  nombre,
  telefono,
  pais,
  email,
  arriba,
  chips,
  pie,
  arrastrable,
  onArrastrar,
  apagada,
  marcada,
  onMarcar,
  alerta,
}: {
  leadId: string;
  nombre: string;
  telefono?: string | null;
  pais?: string | null; // 1b: el país del lead (sale junto al teléfono); sin pasarlo, no se enseña
  email?: string | null;
  arriba?: ReactNode; // a la derecha del nombre (closer, importe…)
  chips?: ReactNode;
  pie?: ReactNode;
  arrastrable: boolean;
  onArrastrar?: (e: DragEvent<HTMLDivElement>) => void;
  apagada?: boolean; // mientras se arrastra
  marcada?: boolean;
  onMarcar?: () => void; // sin esto, no hay casilla
  alerta?: boolean; // 3 nov (Cristian, boceto B): toda la tarjeta en rojo suave (cita por recuperar)
}) {
  const [popup, setPopup] = useState(false);
  // Los botones, enlaces y casillas de la card hacen lo suyo; los clics que vienen del popup (va en un Portal) no cuentan
  function abrir(e: MouseEvent<HTMLDivElement>) {
    const destino = e.target as HTMLElement;
    if (!e.currentTarget.contains(destino) || destino.closest("button, a, input, select, textarea, label")) return;
    setPopup(true);
  }
  return (
    <div
      onClick={abrir}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && setPopup(true)}
      tabIndex={0}
      role="button"
      aria-label={`Ver datos de ${nombre || "este lead"}`}
      draggable={arrastrable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onArrastrar?.(e);
      }}
      className={`space-y-1.5 rounded-lg border p-3 text-sm shadow-sm transition hover:border-primario/60 ${alerta ? "bg-mal-suave" : "bg-panel"} ${
        marcada ? "border-primario ring-1 ring-primario" : alerta ? "border-mal/50" : "border-borde"
      } ${arrastrable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${apagada ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-2">
        {onMarcar && (
          <input
            type="checkbox"
            checked={!!marcada}
            onChange={onMarcar}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 shrink-0"
            aria-label={`Seleccionar a ${nombre}`}
          />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{nombre || "Sin nombre"}</span>
        {arriba}
      </div>
      {(telefono || email) && (
        <div className="space-y-0.5 text-xs text-texto-3">
          {telefono && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{telefono}{pais !== undefined && <span className="truncate">· {nombrePais(pais)}</span>}</div>}
          {email && <div className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3" />{email}</div>}
        </div>
      )}
      {chips && <div className="flex flex-wrap items-center gap-1">{chips}</div>}
      {pie}
      {popup && <PopupLead leadId={leadId} nombre={nombre} onCerrar={() => setPopup(false)} />}
    </div>
  );
}

// «hace 3 d» desde que entró el lead (o la fecha que se pase)
export function haceDias(fecha: string, ahora = Date.now()) {
  const d = Math.floor((ahora - new Date(fecha).getTime()) / 86_400_000);
  return d <= 0 ? "hoy" : `hace ${d} d`;
}
