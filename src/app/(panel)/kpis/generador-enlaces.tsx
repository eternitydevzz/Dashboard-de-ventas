"use client";

import { useState } from "react";
import { Desplegable } from "@/components/eleccion";
import { Seccion } from "@/components/ui";
import { CANALES, NOMBRE_CANAL } from "@/lib/canal";
import { LANDINGS, enlaceUtm } from "@/lib/enlace-utm";
import { CopiarLink } from "@/app/(panel)/recursos/cliente";

// Canales que se eligen con utm_source; Facu, DFY y Directo los decide la página, y «Otro» no es un canal
const CANALES_ENLACE = CANALES.filter((c) => c !== "facu" && c !== "dfy" && c !== "directo" && c !== "otro");

// B4 (plan GHL): elige landing, canal y campaña → enlace listo para copiar
export function GeneradorEnlaces() {
  const [landing, setLanding] = useState(LANDINGS[0]);
  const [canal, setCanal] = useState<string>(CANALES_ENLACE[0]);
  const [campana, setCampana] = useState("");
  const enlace = campana.trim() ? enlaceUtm(landing, canal, campana) : null;
  return (
    <Seccion titulo="Generador de enlaces">
      <div className="flex flex-wrap items-end gap-2">
        <input list="landings-enlace" aria-label="Landing" value={landing} onChange={(e) => setLanding(e.target.value)} className="campo min-w-0 flex-1 sm:w-72 sm:flex-none" />
        <datalist id="landings-enlace">{LANDINGS.map((l) => <option key={l} value={l} />)}</datalist>
        <Desplegable aria-label="Canal" value={canal} onChange={(e) => setCanal(e.target.value)} className="campo min-w-0 flex-1 sm:w-44 sm:flex-none">
          {CANALES_ENLACE.map((c) => <option key={c} value={c}>{NOMBRE_CANAL[c]}</option>)}
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
