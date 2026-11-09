"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useAccion } from "@/components/acciones-lead";
import { confirmar, pedirTexto } from "@/components/dialogos";
import { Insignia } from "@/components/ui";
import { crearEtiqueta, marcarEtiquetaGhl, ordenarEtiquetas, renombrarEtiqueta } from "./acciones";

// Plan GHL B3a (Cristian, 8 nov): las etiquetas del proyecto. Renombrar a una que ya existe las une. Renombrar, unir y
// borrar cambian también las Entradas y los workflows, y siempre se confirman antes. B3b: y también en GHL (con GHL conectado).
export type EtiquetaFila = { nombre: string; leads: number; usada_ghl: boolean };
// Texto del plan (B3b), siempre antes de renombrar, unir o borrar
const AVISO_GHL = " Los emails y SMS de las agendas los manda un workflow de GHL que arranca con la etiqueta; renombrarla, unirla o borrarla puede dejar de mandarlos o mandarlos de más";
const MARCA_GHL = " Está marcada «usada por GHL».";

export function EditorEtiquetas({ inicial, workflows = {} }: { inicial: EtiquetaFila[]; workflows?: Record<string, string[]> }) {
  const [filas, setFilas] = useState(inicial);
  const [nueva, setNueva] = useState("");
  // Unir en GHL va de 100 en 100 contactos: si faltan, se repite la misma acción (en la base ya no hace nada)
  const [seguir, setSeguir] = useState<{ de: string; a: string; faltan: number } | null>(null);
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
    // 1.7 (9 nov): unir 2 etiquetas que tienen workflow deja 2 workflows con el mismo disparador; se avisa y decide Cristian
    const dos = otra && workflows[f.nombre]?.length && workflows[a]?.length ? ` Las dos tienen workflow (${[...workflows[f.nombre], ...workflows[a]].map((n) => `«${n}»`).join(", ")}): quedarán con el mismo disparador.` : "";
    if (await confirmar(texto + dos + (f.usada_ghl || otra?.usada_ghl ? MARCA_GHL : "") + AVISO_GHL, { boton: otra ? "Unir" : "Renombrar" })) unir(f.nombre, a, otra ? "Etiquetas unidas" : "Etiqueta renombrada");
  }
  function unir(de: string, a: string, mensaje: string) {
    ejecutar(async () => {
      const r = await renombrarEtiqueta(de, a);
      setSeguir("faltan" in r && r.faltan ? { de, a, faltan: r.faltan } : null);
      return r;
    }, mensaje);
  }
  async function borrar(f: EtiquetaFila) {
    const texto = `¿Borrar «${f.nombre}»? Se quita de ${donde(f)}; un workflow que arranca con ella se apaga. No se puede deshacer.`;
    if (await confirmar(texto + (f.usada_ghl ? MARCA_GHL : "") + AVISO_GHL, { boton: "Borrar" })) ejecutar(() => renombrarEtiqueta(f.nombre, null), "Etiqueta borrada");
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
            <label className="flex items-center gap-1 text-xs text-texto-2">
              <input type="checkbox" checked={f.usada_ghl} disabled={pendiente} onChange={(e) => ejecutar(() => marcarEtiquetaGhl(f.nombre, e.target.checked), e.target.checked ? "Marcada «usada por GHL»" : "Ya no está marcada")} />
              {f.usada_ghl ? <Insignia tono="oro">usada por GHL</Insignia> : "usada por GHL"}
            </label>
            <span className="w-20 text-xs text-texto-3">{f.leads} lead{f.leads === 1 ? "" : "s"}</span>
            <button type="button" className="btn-secundario px-2 py-1 text-xs" disabled={pendiente} onClick={() => void renombrar(f)}>Renombrar o unir</button>
            <button type="button" className="btn-secundario px-2 py-1 text-xs" disabled={pendiente} onClick={() => void borrar(f)}>Borrar</button>
          </div>
        ))}
      </div>
      {movida && <button type="button" className="btn-primario" disabled={pendiente} onClick={() => ejecutar(() => ordenarEtiquetas(filas.map((f) => f.nombre)), "Orden guardado")}>Guardar el orden</button>}
      {seguir && (
        <button type="button" className="btn-secundario" disabled={pendiente} onClick={() => unir(seguir.de, seguir.a, "Seguimos uniendo en GHL")}>
          Seguir uniendo en GHL («{seguir.de}» → «{seguir.a}», faltan {seguir.faltan})
        </button>
      )}
      {error && <p className="text-xs text-mal">{error}</p>}
    </div>
  );
}
