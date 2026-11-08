"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import type { AvisoCeo } from "@/lib/avisos-ceo";

// Campana del CEO: todos los avisos a la vez (cada tipo ya viene agrupado con su cuenta)
export function CampanaAvisos({ avisos }: { avisos: AvisoCeo[] }) {
  const [abierta, setAbierta] = useState(false);
  const total = avisos.reduce((s, a) => s + a.cuantos, 0);
  return (
    <div className="relative">
      <button onClick={() => setAbierta((v) => !v)} className="relative rounded-md p-1.5 text-texto-3 hover:bg-panel-2 hover:text-texto" title="Avisos" aria-label="Avisos" aria-expanded={abierta}>
        <Bell className="h-4 w-4" />
        {total > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-mal px-1 text-[10px] font-semibold leading-4 text-white">{total}</span>}
      </button>
      {abierta && (
        <div className="tarjeta absolute bottom-full left-0 z-50 mb-2 w-72 p-3 text-sm">
          {avisos.length ? <ul className="space-y-2">{avisos.map((a) => <li key={a.tipo}>{a.texto}</li>)}</ul> : <p className="text-texto-3">Sin avisos.</p>}
        </div>
      )}
    </div>
  );
}
