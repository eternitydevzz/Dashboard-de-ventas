"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useAccion, Mensajes } from "@/components/acciones-lead";
import { confirmar } from "@/components/dialogos";
import { guardarGuion, restaurarGuion } from "./acciones";
import type { Guion, RolGuion } from "@/lib/guiones";

// Editor del guion (Fase 6): pasos (título, qué decir, checklist y pistas, una por línea) y objeciones.
type PasoE = { titulo: string; texto: string; checklist: string; pistas: string };
type ObjE = { objecion: string; respuesta: string };

const aLineas = (t: string) => t.split("\n").map((x) => x.trim()).filter(Boolean);

// 13 nov: `mercado` = qué guion se guarda; en España, `propio` = ya tiene el suyo (si no, se parte del de Latam)
export function EditorGuion({ rol, guion, deEjemplo, mercado = "latam", propio = !deEjemplo }: { rol: RolGuion; guion: Guion; deEjemplo: boolean; mercado?: "latam" | "es"; propio?: boolean }) {
  const es = mercado === "es";
  const [pasos, setPasos] = useState<PasoE[]>(guion.pasos.map((p) => ({ titulo: p.titulo, texto: p.texto, checklist: p.checklist.join("\n"), pistas: p.pistas.join("\n") })));
  const [objs, setObjs] = useState<ObjE[]>(guion.objeciones.map((o) => ({ objecion: o.objecion, respuesta: o.respuesta })));
  const { pendiente, error, ejecutar } = useAccion();
  const cambiarPaso = (i: number, c: Partial<PasoE>) => setPasos((l) => l.map((p, k) => (k === i ? { ...p, ...c } : p)));
  const mover = (i: number, d: -1 | 1) =>
    setPasos((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  return (
    <div className="space-y-5">
      <p className="text-xs text-texto-3">
        En «Qué decir» puedes usar <code className="rounded bg-panel-2 px-1">{"{nombre}"}</code> (el nombre del lead) y <code className="rounded bg-panel-2 px-1">{"{tu nombre}"}</code> (quien llama). Checklist y pistas: una por línea.
        {deEjemplo && <b className="text-aviso"> Ahora sale el guion de ejemplo: guarda el tuyo.</b>}
      </p>
      <ol className="space-y-3">
        {pasos.map((p, i) => (
          <li key={i} className="rounded-xl border border-borde bg-panel-2/50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primario text-xs font-semibold text-white">{i + 1}</span>
              <input className="campo flex-1 py-1.5 font-medium" value={p.titulo} onChange={(e) => cambiarPaso(i, { titulo: e.target.value })} placeholder="Título del paso" aria-label={`Título del paso ${i + 1}`} />
              <button type="button" className="rounded p-1.5 text-texto-3 hover:text-texto disabled:opacity-30" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir paso"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" className="rounded p-1.5 text-texto-3 hover:text-texto disabled:opacity-30" disabled={i === pasos.length - 1} onClick={() => mover(i, 1)} aria-label="Bajar paso"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" className="rounded p-1.5 text-texto-3 hover:text-mal" onClick={() => setPasos((l) => l.filter((_, k) => k !== i))} aria-label="Quitar paso"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <label className="block md:col-span-3"><span className="etiqueta-campo">Qué decir</span><textarea className="campo" rows={2} value={p.texto} onChange={(e) => cambiarPaso(i, { texto: e.target.value })} /></label>
              <label className="block md:col-span-2"><span className="etiqueta-campo">Checklist (una por línea)</span><textarea className="campo" rows={3} value={p.checklist} onChange={(e) => cambiarPaso(i, { checklist: e.target.value })} /></label>
              <label className="block"><span className="etiqueta-campo">Pistas (una por línea)</span><textarea className="campo" rows={3} value={p.pistas} onChange={(e) => cambiarPaso(i, { pistas: e.target.value })} /></label>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn-secundario" onClick={() => setPasos((l) => [...l, { titulo: "", texto: "", checklist: "", pistas: "" }])}><Plus className="h-4 w-4" /> Añadir paso</button>

      <div className="space-y-2 border-t border-borde pt-4">
        <div className="titulo-seccion">Objeciones</div>
        {objs.map((o, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
            <input className="campo py-1.5" value={o.objecion} onChange={(e) => setObjs((l) => l.map((x, k) => (k === i ? { ...x, objecion: e.target.value } : x)))} placeholder="Lo que dice el lead" aria-label={`Objeción ${i + 1}`} />
            <textarea className="campo py-1.5" rows={1} value={o.respuesta} onChange={(e) => setObjs((l) => l.map((x, k) => (k === i ? { ...x, respuesta: e.target.value } : x)))} placeholder="Cómo responder" aria-label={`Respuesta ${i + 1}`} />
            <button type="button" className="rounded p-1.5 text-texto-3 hover:text-mal" onClick={() => setObjs((l) => l.filter((_, k) => k !== i))} aria-label="Quitar objeción"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" className="btn-secundario" onClick={() => setObjs((l) => [...l, { objecion: "", respuesta: "" }])}><Plus className="h-4 w-4" /> Añadir objeción</button>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-borde pt-4">
        <button
          type="button"
          className="btn-primario"
          disabled={pendiente}
          onClick={() =>
            ejecutar(
              () => guardarGuion(rol, { pasos: pasos.map((p) => ({ titulo: p.titulo, texto: p.texto, checklist: aLineas(p.checklist), pistas: aLineas(p.pistas) })), objeciones: objs }, mercado),
              "Guion guardado"
            )
          }
        >
          <Save className="h-4 w-4" /> Guardar guion
        </button>
        {es && !propio && <p className="self-center text-xs text-texto-3">España aún no tiene guion propio: ve el de Latam. Al guardar, este pasa a ser el de España.</p>}
        {propio && (
          <button type="button" className="btn-secundario" disabled={pendiente} onClick={() => void confirmar(es ? "¿Quitar el guion de España? El equipo de España verá el de Latam." : "¿Volver al guion de ejemplo? Se pierde el que tienes ahora.").then((ok) => ok && ejecutar(() => restaurarGuion(rol, mercado), es ? "Ahora España ve el de Latam" : "Guion de ejemplo puesto"))}>
            <RotateCcw className="h-4 w-4" /> {es ? "Usar el de Latam" : "Volver al de ejemplo"}
          </button>
        )}
      </div>
      <Mensajes error={error} ok="" />
    </div>
  );
}
