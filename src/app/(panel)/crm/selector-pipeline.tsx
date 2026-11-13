"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { Portal } from "@/components/portal";
import type { Pipeline } from "@/lib/tipos";

import { ARRASTRE_PIPELINE } from "@/lib/orden";

// Selector de pipeline como en GHL (Cristian, 13 oct 2026): un desplegable a la izquierda del buscador, con la lista
// en el orden de GHL y «+ Nuevo pipeline» abajo. Se elige al momento (precarga al pasar el ratón), los administradores
// lo ordenan arrastrando y el abierto se renombra con doble clic. Mismo aspecto que los demás desplegables de la app.
export function SelectorPipeline({
  pipelines,
  actual,
  marcado,
  numeros = {},
  admin,
  editar,
  precargar,
  quiereVer,
  alIr,
  alReordenar,
  alNuevo,
  alRenombrar,
  alBorrar,
}: {
  pipelines: Pipeline[];
  actual: Pipeline | null;
  marcado: string | undefined; // el que se ve elegido (también mientras carga)
  numeros?: Record<string, number>; // N11: el número junto al nombre (hoy solo «Closers», con su tablero abierto)
  admin: boolean;
  editar: boolean;
  precargar: Set<string>;
  quiereVer: (id: string) => void;
  alIr: (id: string) => void;
  alReordenar: (desde: string, hasta: string) => void;
  alNuevo: () => void;
  alRenombrar: (p: Pipeline) => void;
  alBorrar: (p: Pipeline) => void; // Cristian (11 nov): la «x» de cada pipeline, solo admins
}) {
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [sobre, setSobre] = useState<string | null>(null);
  const elegido = pipelines.find((p) => p.id === marcado) ?? actual;

  const abrir = () => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 6, left: r.left, width: r.width });
    setAbierto(true);
  };

  // Se cierra al pulsar fuera, al girar la rueda fuera de la lista, al cambiar el tamaño o con Escape
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: Event) => {
      const t = e.target as Node;
      if (!lista.current?.contains(t) && !boton.current?.contains(t)) setAbierto(false);
    };
    const alMover = (e: Event) => {
      if (!lista.current?.contains(e.target as Node)) setAbierto(false);
    };
    const cerrar = () => setAbierto(false);
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && (setAbierto(false), boton.current?.focus());
    document.addEventListener("pointerdown", fuera, true);
    window.addEventListener("scroll", alMover, true);
    window.addEventListener("resize", cerrar);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera, true);
      window.removeEventListener("scroll", alMover, true);
      window.removeEventListener("resize", cerrar);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        title={elegido ? `Pipeline · ${elegido.nombre}` : "Elegir pipeline"}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onDoubleClick={() => elegido && editar && alRenombrar(elegido)}
        className="campo flex w-auto min-w-56 max-w-80 cursor-pointer items-center justify-between gap-2 text-left"
      >
        <span className="truncate">
          {elegido?.nombre ?? "Sin pipelines"}
          {elegido && numeros[elegido.id] !== undefined && <span className="text-texto-3"> · {numeros[elegido.id]}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-texto-3 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <Portal>
          <div
            ref={lista}
            role="listbox"
            aria-label="Pipelines"
            className="ventana vidrio fixed z-[60] flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-borde p-1 text-sm"
            style={{ top: pos.top, left: pos.left, minWidth: Math.max(pos.width, 260), maxWidth: Math.min(420, window.innerWidth - pos.left - 12) }}
          >
            <div className="px-3 pb-1 pt-2 text-xs text-texto-3">Todos los pipelines</div>
            <div className="overflow-y-auto">
              {pipelines.map((p) => {
                const es = p.id === marcado;
                return (
                  <Link
                    key={p.id}
                    href={`/crm?pipeline=${p.id}`}
                    role="option"
                    aria-selected={es}
                    prefetch={precargar.has(p.id) ? true : false}
                    onMouseEnter={() => quiereVer(p.id)}
                    onFocus={() => quiereVer(p.id)}
                    onTouchStart={() => quiereVer(p.id)}
                    onClick={() => {
                      alIr(p.id);
                      setAbierto(false);
                    }}
                    draggable={admin}
                    onDragStart={(ev) => ev.dataTransfer.setData(ARRASTRE_PIPELINE, p.id)}
                    onDragOver={(ev) => {
                      if (!ev.dataTransfer.types.includes(ARRASTRE_PIPELINE)) return;
                      ev.preventDefault();
                      setSobre(p.id);
                    }}
                    onDragLeave={() => setSobre((s) => (s === p.id ? null : s))}
                    onDrop={(ev) => {
                      const desde = ev.dataTransfer.getData(ARRASTRE_PIPELINE);
                      setSobre(null);
                      if (!desde) return;
                      ev.preventDefault();
                      alReordenar(desde, p.id);
                    }}
                    title={admin ? "Arrastra para ordenar" : undefined}
                    className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-panel-2 ${es ? "bg-panel-2 font-medium text-primario" : "text-texto"} ${sobre === p.id ? "ring-2 ring-primario" : ""}`}
                  >
                    <span className="truncate">{p.nombre}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {numeros[p.id] !== undefined && <span className="text-xs text-texto-3">{numeros[p.id]}</span>}
                      {es && <Check className="h-4 w-4" />}
                      {admin && p.tipo === "normal" && (
                        <button
                          type="button"
                          aria-label={`Borrar el pipeline ${p.nombre}`}
                          title="Borrar pipeline"
                          onClick={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            setAbierto(false);
                            alBorrar(p);
                          }}
                          className="rounded-md p-0.5 text-texto-3 hover:bg-mal-suave hover:text-mal"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
            {admin && (
              <button
                type="button"
                onClick={() => {
                  setAbierto(false);
                  alNuevo();
                }}
                className="mt-1 flex items-center gap-2 border-t border-borde px-3 py-2.5 font-medium text-primario hover:bg-primario-suave"
              >
                <Plus className="h-4 w-4" /> Nuevo pipeline
              </button>
            )}
          </div>
        </Portal>
      )}
    </>
  );
}
