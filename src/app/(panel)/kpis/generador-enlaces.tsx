"use client";

import { useState } from "react";
import { Desplegable } from "@/components/eleccion";
import { Seccion } from "@/components/ui";
import type { TablaCanales } from "@/lib/canal";
import { LANDINGS, enlaceUtm } from "@/lib/enlace-utm";
import { CopiarLink } from "@/app/(panel)/recursos/cliente";

// B4 (plan GHL): elige landing, canal y campaña → enlace listo para copiar. Los canales y sus nombres, los del proyecto
// (Administración → Canales, 1.7 del 9 nov); Facu y DFY no: los decide la página (Directo y Otro no son filas)
export function GeneradorEnlaces({ canales }: { canales: TablaCanales }) {
  const lista = canales.filter((c) => c.clave !== "facu" && c.clave !== "dfy");
  const [landing, setLanding] = useState(LANDINGS[0]);
  const [canal, setCanal] = useState<string>(lista[0]?.clave ?? "");
  const [campana, setCampana] = useState("");
  const enlace = campana.trim() ? enlaceUtm(landing, canal, campana) : null;
  return (
    <Seccion titulo="Generador de enlaces">
      <div className="flex flex-wrap items-end gap-2">
        <input list="landings-enlace" aria-label="Landing" value={landing} onChange={(e) => setLanding(e.target.value)} className="campo min-w-0 flex-1 sm:w-72 sm:flex-none" />
        <datalist id="landings-enlace">{LANDINGS.map((l) => <option key={l} value={l} />)}</datalist>
        <Desplegable aria-label="Canal" value={canal} onChange={(e) => setCanal(e.target.value)} className="campo min-w-0 flex-1 sm:w-44 sm:flex-none">
          {lista.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
        </Desplegable>
        <input aria-label="Campaña" placeholder="Campaña (utm_campaign)" value={campana} onChange={(e) => setCampana(e.target.value)} className="campo min-w-0 flex-1 sm:w-56 sm:flex-none" />
      </div>
      {enlace ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <code className="break-all text-xs text-texto-2">{enlace}</code>
          <CopiarLink url={enlace} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-texto-3">{campana.trim() ? "La landing no es una dirección válida." : "Escribe la campaña para generar el enlace."}</p>
      )}
    </Seccion>
  );
}
