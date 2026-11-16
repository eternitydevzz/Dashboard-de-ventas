"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useAccion } from "@/components/acciones-lead";
import { borrarPasoCloser, guardarPasoCloser, marcarPasoCloser } from "./acciones";
import { confirmar, pedirTexto } from "@/components/dialogos";
import { Desplegable } from "@/components/eleccion";
import { useToast } from "@/components/toasts";
import { exigirOk } from "@/lib/resultado-cliente";

type Paso = { id: string; nombre: string };

// Fase 5: seguimiento visual por cliente (línea de pasos) y, para el CEO y los directores, los pasos se editan
// en el sitio (renombrar, quitar, añadir). Marcar un paso = pulsar su círculo.
export function ChecklistCliente({ leadId, pasos, hechos, editable = false, zona }: { leadId: string; pasos: Paso[]; hechos: Record<string, string>; editable?: boolean; zona: string }) {
  const { pendiente, error, ejecutar } = useAccion();
  const toast = useToast();
  return (
    <div>
      <ol className="relative space-y-0">
        {pasos.map((p, i) => {
          const hecho = !!hechos[p.id];
          const ultimo = i === pasos.length - 1;
          return (
            <li key={p.id} className="group relative flex gap-3 pb-3">
              {!ultimo && <span className={`absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5 ${hecho ? "bg-ok" : "bg-borde"}`} aria-hidden />}
              <button
                type="button"
                disabled={pendiente}
                onClick={() => {
                  const mensaje = !hecho ? `${p.nombre}: hecho` : `${p.nombre}: sin hacer`;
                  // N2: si sale bien, «Deshacer» (y Ctrl+Z) lo deja como estaba con la misma acción
                  ejecutar(async () => {
                    const r = await exigirOk(marcarPasoCloser(leadId, p.id, !hecho));
                    toast(mensaje, "ok", { deshacer: { texto: mensaje, deshacer: () => ejecutar(() => marcarPasoCloser(leadId, p.id, hecho), "Deshecho") } });
                    return r;
                  });
                }}
                className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition ${hecho ? "border-ok bg-ok text-white" : "border-borde-fuerte bg-panel text-texto-3 hover:border-primario hover:text-primario"}`}
                aria-label={`${p.nombre}: ${hecho ? "hecho (pulsa para desmarcar)" : "sin hacer (pulsa para marcar)"}`}
                aria-pressed={hecho}
              >
                {hecho ? <Check className="h-4 w-4" /> : i + 1}
              </button>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm ${hecho ? "text-texto-2" : "font-medium"}`}>{p.nombre}</span>
                  {editable && (
                    <span className="flex gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <button type="button" className="rounded p-0.5 text-texto-3 hover:text-primario" aria-label={`Renombrar ${p.nombre}`} onClick={() => void pedirTexto("Nombre del punto", p.nombre).then((n) => n && n.trim() !== p.nombre && ejecutar(() => guardarPasoCloser(p.id, n), "Punto renombrado"))}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" className="rounded p-0.5 text-texto-3 hover:text-mal" aria-label={`Quitar ${p.nombre}`} onClick={() => void confirmar(`¿Quitar «${p.nombre}»? Se quita de la checklist de todos los clientes.`).then((ok) => ok && ejecutar(() => borrarPasoCloser(p.id), "Punto quitado"))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </div>
                {/* Cristian, 15 nov: en la zona del proyecto, igual en el servidor y en el navegador (sin el error #418) */}
                {hecho && <div className="text-[11px] text-texto-3">Hecho el {new Date(hechos[p.id]).toLocaleDateString("es-ES", { timeZone: zona })}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {editable && (
        <button type="button" className="mt-1 flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs text-primario hover:bg-primario-suave" onClick={() => void pedirTexto("Nuevo punto del onboarding", "", { boton: "Añadir" }).then((n) => n && ejecutar(() => guardarPasoCloser(null, n), "Punto añadido"))}>
          <Plus className="h-3.5 w-3.5" /> Añadir punto (para todos los clientes)
        </button>
      )}
      {error && <p className="text-xs text-mal">{error}</p>}
    </div>
  );
}

export function EditorPasosCloser({ pasos }: { pasos: Paso[] }) {
  const [nuevo, setNuevo] = useState("");
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <div className="space-y-2">
      {pasos.map((p) => <FilaPaso key={p.id} paso={p} />)}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ejecutar(async () => { const r = await guardarPasoCloser(null, nuevo); if (!(r && typeof r === "object" && "error" in r)) setNuevo(""); return r; }, "Punto añadido"); }}>
        <input className="campo flex-1" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nuevo punto (ej. Grupo de WhatsApp creado)" aria-label="Nuevo punto del onboarding" />
        <button className="btn-secundario" disabled={pendiente || !nuevo.trim()}><Plus className="h-4 w-4" /> Añadir</button>
      </form>
      {error && <p className="text-xs text-mal">{error}</p>}
    </div>
  );
}

function FilaPaso({ paso }: { paso: Paso }) {
  const [nombre, setNombre] = useState(paso.nombre);
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className="campo flex-1 py-1.5" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label={`Nombre del punto ${paso.nombre}`} />
      <button type="button" className="btn-secundario px-2 py-1 text-xs" disabled={pendiente || nombre.trim() === paso.nombre} onClick={() => ejecutar(() => guardarPasoCloser(paso.id, nombre), "Punto guardado")}>Guardar</button>
      <button type="button" className="rounded p-1.5 text-texto-3 hover:text-mal" disabled={pendiente} onClick={() => void confirmar(`¿Quitar «${paso.nombre}»? Se quita de la checklist de todos los clientes.`).then((ok) => ok && ejecutar(() => borrarPasoCloser(paso.id), "Punto quitado"))} aria-label={`Quitar el punto ${paso.nombre}`}><Trash2 className="h-4 w-4" /></button>
      {error && <span className="w-full text-xs text-mal">{error}</span>}
    </div>
  );
}

export function FiltroCloser({ closers, valor }: { closers: Paso[]; valor: string }) {
  const router = useRouter();
  return (
    <Desplegable className="campo w-auto" value={valor} aria-label="Closer" onChange={(e) => router.push(e.target.value ? `/onboarding-closers?closer=${e.target.value}` : "/onboarding-closers")}>
      <option value="">Todos los closers</option>
      {closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
    </Desplegable>
  );
}
