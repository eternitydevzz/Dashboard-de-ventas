"use client";

import { useState } from "react";
import { useAccion } from "@/components/acciones-lead";
import { guardarRotacion } from "./acciones";

type Closer = { id: string; nombre: string; pct: number; cuenta: number; horario: boolean };

// Plan Callers (C11, punto 13; Cristian, 7 nov): cuando un caller marca «Agendado», el closer lo pone la rotación.
// Toca el closer con menos citas para su % (lib/rotacion.ts), y solo salen sus horas libres. Todos a 0 = sin rotación.
export function RotacionClosers({ closers }: { closers: Closer[] }) {
  const [pcts, setPcts] = useState<Record<string, string>>(Object.fromEntries(closers.map((c) => [c.id, String(c.pct)])));
  const { pendiente, error, ejecutar } = useAccion();
  const suma = Math.round(Object.values(pcts).reduce((a, b) => a + (Number(b) || 0), 0) * 100) / 100;
  if (!closers.length) return <p className="text-sm text-texto-3">No hay closers activos.</p>;
  return (
    <div className="space-y-4">
      <p className="text-xs text-texto-3">Cuando un caller marca «Agendado», la cita va al closer con menos citas para su %. Solo salen las horas libres de su horario. Todos a 0 % = los callers no pueden agendar.</p>
      <div className="space-y-1.5">
        {closers.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg border border-borde bg-panel-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {c.nombre}
              {!c.horario && <span className="ml-2 text-xs text-aviso-texto">sin horario</span>}
              <span className="ml-2 text-xs text-texto-3">{c.cuenta} citas</span>
            </span>
            <input type="number" min={0} max={100} step={1} value={pcts[c.id]} onChange={(e) => setPcts({ ...pcts, [c.id]: e.target.value })} className="campo w-20 py-1 text-right" aria-label={`% de rotación de ${c.nombre}`} />
            <span className="text-texto-3">%</span>
          </div>
        ))}
      </div>
      <p className={`text-sm ${suma === 100 || suma === 0 ? "text-ok-texto" : "text-aviso-texto"}`}>Suman <b>{suma} %</b>{suma !== 100 && suma !== 0 && " (tienen que sumar 100 o estar todos a 0)"}</p>
      {error && <p className="text-xs text-mal">{error}</p>}
      <button type="button" className="btn-primario" disabled={pendiente} onClick={() => ejecutar(() => guardarRotacion(Object.fromEntries(Object.entries(pcts).map(([k, v]) => [k, Number(v) || 0]))), "Rotación guardada")}>Guardar rotación</button>
    </div>
  );
}
