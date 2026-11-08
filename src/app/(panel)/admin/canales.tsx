"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useAccion } from "@/components/acciones-lead";
import type { TablaCanales } from "@/lib/canal";
import { guardarCanales } from "./acciones";

// Plan GHL B2b (Cristian, 8 nov): los canales del proyecto. La clave es fija; nombre, alias, páginas y orden se cambian.
// Alias y páginas van separados por comas. Al guardar, el servidor los limpia y comprueba (canal.ts, tablaValida).
const lista = (t: string) => t.split(",").map((x) => x.trim()).filter(Boolean);

export function EditorCanales({ inicial }: { inicial: TablaCanales }) {
  const [filas, setFilas] = useState(inicial.map((c) => ({ clave: c.clave, nombre: c.nombre, alias: c.alias.join(", "), paginas: c.paginas.join(", ") })));
  const { pendiente, error, ejecutar } = useAccion();
  const poner = (i: number, cambio: Partial<(typeof filas)[number]>) => setFilas(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  const mover = (i: number, d: number) => {
    const l = [...filas];
    [l[i], l[i + d]] = [l[i + d], l[i]];
    setFilas(l);
  };
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {filas.map((f, i) => (
          <div key={f.clave} className="flex flex-wrap items-center gap-2 rounded-lg border border-borde bg-panel-2 px-3 py-2 text-sm">
            <div className="flex flex-col">
              <button type="button" className="rounded p-0.5 text-texto-3 hover:text-texto disabled:opacity-30" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir «${f.nombre}»`}><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" className="rounded p-0.5 text-texto-3 hover:text-texto disabled:opacity-30" disabled={i === filas.length - 1} onClick={() => mover(i, 1)} aria-label={`Bajar «${f.nombre}»`}><ArrowDown className="h-3.5 w-3.5" /></button>
            </div>
            <code className="w-20 text-xs text-texto-3" title="Clave fija: la guardan las citas">{f.clave}</code>
            <input className="campo w-36 py-1" value={f.nombre} maxLength={40} onChange={(e) => poner(i, { nombre: e.target.value })} aria-label={`Nombre del canal ${f.clave}`} />
            <input className="campo min-w-40 flex-1 py-1 text-xs" value={f.alias} onChange={(e) => poner(i, { alias: e.target.value })} placeholder="utm_source (yt, youtube)" aria-label={`Alias de ${f.clave}`} />
            <input className="campo min-w-48 flex-1 py-1 text-xs" value={f.paginas} onChange={(e) => poner(i, { paginas: e.target.value })} placeholder="páginas (agenda-yt, dominio.com/ruta)" aria-label={`Páginas de ${f.clave}`} />
          </div>
        ))}
      </div>
      <button type="button" className="btn-primario" disabled={pendiente} onClick={() => ejecutar(() => guardarCanales(filas.map((f) => ({ ...f, alias: lista(f.alias), paginas: lista(f.paginas) }))), "Canales guardados")}>Guardar</button>
      {error && <p className="text-xs text-mal">{error}</p>}
    </div>
  );
}
