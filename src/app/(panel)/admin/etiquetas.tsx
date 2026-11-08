"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useAccion } from "@/components/acciones-lead";
import { confirmar, pedirTexto } from "@/components/dialogos";
import { Insignia } from "@/components/ui";
import { crearEtiqueta, ordenarEtiquetas, renombrarEtiqueta } from "./acciones";

// Plan GHL B3a (Cristian, 8 nov): las etiquetas del proyecto. Renombrar a una que ya existe las une. Renombrar, unir y
// borrar cambian también las Entradas y los workflows, y siempre se confirman antes. Nada de esto toca GHL.
export type EtiquetaFila = { nombre: string; leads: number; usada_ghl: boolean };
const AVISO_GHL = " Está marcada «usada por GHL»: algún workflow de GHL arranca con ella (emails y SMS) y en GHL sigue igual.";

export function EditorEtiquetas({ inicial }: { inicial: EtiquetaFila[] }) {
  const [filas, setFilas] = useState(inicial);
  const [nueva, setNueva] = useState("");
  const { pendiente, error, ejecutar } = useAccion();
  const movida = filas.some((f, i) => f.nombre !== inicial[i]?.nombre);
  const mover = (i: number, d: number) => {
    const l = [...filas];
    [l[i], l[i + d]] = [l[i + d], l[i]];
    setFilas(l);
  };
  const donde = (f: EtiquetaFila) => `${f.leads} lead${f.leads === 1 ? "" : "s"}, sus Entradas y sus workflows`;
  async function renombrar(f: EtiquetaFila) {
    const a = (await pedirTexto(`Nuevo nombre de «${f.nombre}»`, f.nombre, { boton: "Seguir" }))?.trim().toLowerCase();
    if (!a || a === f.nombre) return;
    const otra = filas.find((x) => x.nombre === a);
    const texto = otra
      ? `¿Unir «${f.nombre}» con «${a}»? Queda solo «${a}» en ${donde(f)}, sin repetirse.`
      : `¿Renombrar «${f.nombre}» a «${a}» en ${donde(f)}?`;
    if (await confirmar(texto + (f.usada_ghl || otra?.usada_ghl ? AVISO_GHL : ""), { boton: otra ? "Unir" : "Renombrar" })) ejecutar(() => renombrarEtiqueta(f.nombre, a), otra ? "Etiquetas unidas" : "Etiqueta renombrada");
  }
  async function borrar(f: EtiquetaFila) {
    const texto = `¿Borrar «${f.nombre}»? Se quita de ${donde(f)}; un workflow que arranca con ella se apaga. No se puede deshacer.`;
    if (await confirmar(texto + (f.usada_ghl ? AVISO_GHL : ""), { boton: "Borrar" })) ejecutar(() => renombrarEtiqueta(f.nombre, null), "Etiqueta borrada");
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input className="campo w-60 py-1" value={nueva} maxLength={80} onChange={(e) => setNueva(e.target.value)} placeholder="nueva etiqueta" aria-label="Nueva etiqueta" />
        <button type="button" className="btn-secundario" disabled={pendiente || !nueva.trim()} onClick={() => ejecutar(async () => { const r = await crearEtiqueta(nueva); if (!("error" in r)) setNueva(""); return r; }, "Etiqueta creada")}>Crear</button>
      </div>
      {!filas.length && <p className="text-sm text-texto-3">Todavía no hay etiquetas.</p>}
      <div className="space-y-1.5">
        {filas.map((f, i) => (
          <div key={f.nombre} className="flex flex-wrap items-center gap-2 rounded-lg border border-borde bg-panel-2 px-3 py-2 text-sm">
            <div className="flex flex-col">
              <button type="button" className="rounded p-0.5 text-texto-3 hover:text-texto disabled:opacity-30" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir «${f.nombre}»`}><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" className="rounded p-0.5 text-texto-3 hover:text-texto disabled:opacity-30" disabled={i === filas.length - 1} onClick={() => mover(i, 1)} aria-label={`Bajar «${f.nombre}»`}><ArrowDown className="h-3.5 w-3.5" /></button>
            </div>
            <span className="min-w-40 flex-1 font-medium">{f.nombre}</span>
            {f.usada_ghl && <Insignia tono="oro">usada por GHL</Insignia>}
            <span className="w-20 text-xs text-texto-3">{f.leads} lead{f.leads === 1 ? "" : "s"}</span>
            <button type="button" className="btn-secundario px-2 py-1 text-xs" disabled={pendiente} onClick={() => void renombrar(f)}>Renombrar o unir</button>
            <button type="button" className="btn-secundario px-2 py-1 text-xs" disabled={pendiente} onClick={() => void borrar(f)}>Borrar</button>
          </div>
        ))}
      </div>
      {movida && <button type="button" className="btn-primario" disabled={pendiente} onClick={() => ejecutar(() => ordenarEtiquetas(filas.map((f) => f.nombre)), "Orden guardado")}>Guardar el orden</button>}
      {error && <p className="text-xs text-mal">{error}</p>}
    </div>
  );
}
