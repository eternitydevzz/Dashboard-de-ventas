"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { PERIODOS_NAV } from "@/lib/periodos";
import { BarraCarga } from "@/components/barra-carga";
import { Desplegable } from "@/components/eleccion";

// Día / Semana / Mes / Año / Personalizado + ‹ periodo › + Actualizar. Todo va en la URL (p, n, desde, hasta).
export function BarraPeriodo({ etiqueta, porDefecto = "mes", conActualizar = true }: { etiqueta: string; porDefecto?: string; conActualizar?: boolean }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [cargando, iniciar] = useTransition();
  // Velocidad (17 oct 2026): el periodo pulsado se marca al momento (vale mientras no cambie la dirección)
  const [yendo, setYendo] = useState<{ a: string; desde: string } | null>(null);
  const periodo = (yendo && yendo.desde === params.toString() ? yendo.a : null) ?? params.get("p") ?? porDefecto;
  const n = Number(params.get("n") ?? 0) || 0;
  const [verFechas, setVerFechas] = useState(periodo === "rango");

  function conCambios(cambios: Record<string, string | null>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    return `${ruta}?${p.toString()}`;
  }
  function poner(cambios: Record<string, string | null>) {
    iniciar(() => router.replace(conCambios(cambios), { scroll: false }));
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${cargando ? "opacity-70" : ""}`}>
      <BarraCarga activa={cargando} />
      <div className="flex rounded-lg border border-borde bg-panel-2 p-0.5">
        {/* Enlaces (17 oct 2026). Precarga por defecto (solo el esqueleto): la completa hacía demasiadas lecturas (D1, 13 nov);
            «Personalizado» sigue siendo un botón: abre las fechas */}
        {PERIODOS_NAV.map((x) => {
          const clase = `rounded-md px-3 py-1.5 text-sm transition-colors ${periodo === x.v ? "bg-primario text-white shadow-sm" : "text-texto-2 hover:text-texto"}`;
          if (x.v === "rango")
            return (
              <button key={x.v} type="button" onClick={() => setVerFechas(true)} className={clase}>
                {x.t}
              </button>
            );
          return (
            <Link
              key={x.v}
              href={conCambios({ p: x.v, n: null, desde: null, hasta: null })}
              replace
              scroll={false}
              onClick={() => {
                setVerFechas(false);
                if (x.v !== periodo) setYendo({ a: x.v, desde: params.toString() });
              }}
              className={clase}
            >
              {x.t}
            </Link>
          );
        })}
      </div>
      {periodo !== "rango" && (
        <div className="flex items-center rounded-lg border border-borde bg-panel">
          <Link href={conCambios({ n: String(n - 1) })} replace scroll={false} className="p-2 text-texto-2 hover:text-texto" aria-label="Periodo anterior">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-32 px-1 text-center text-sm font-medium">{etiqueta}</span>
          <Link href={conCambios({ n: String(n + 1) })} replace scroll={false} className="p-2 text-texto-2 hover:text-texto" aria-label="Periodo siguiente">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}
      {periodo === "rango" && <span className="text-sm font-medium">{etiqueta}</span>}
      {verFechas && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            poner({ p: "rango", n: null, desde: String(f.get("desde")), hasta: String(f.get("hasta")) });
          }}
        >
          <input type="date" name="desde" required defaultValue={params.get("desde") ?? ""} className="campo w-auto" aria-label="Desde" />
          <span className="text-texto-3">→</span>
          <input type="date" name="hasta" required defaultValue={params.get("hasta") ?? ""} className="campo w-auto" aria-label="Hasta" />
          <button className="btn-primario">Aplicar</button>
        </form>
      )}
      {conActualizar && (
        <button type="button" className="btn-secundario" disabled={cargando} onClick={() => iniciar(() => router.refresh())}>
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} /> Actualizar
        </button>
      )}
    </div>
  );
}

// Selector simple que va a la URL (closer, producto, evento…)
export function FiltroUrl({ nombre, etiqueta, opciones, todos }: { nombre: string; etiqueta: string; opciones: { v: string; t: string }[]; todos: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [cargando, iniciar] = useTransition();
  return (
    <>
      <BarraCarga activa={cargando} />
      <Desplegable
      aria-label={etiqueta}
      className={`campo w-auto min-w-40 ${cargando ? "opacity-70" : ""}`}
      value={params.get(nombre) ?? ""}
      onChange={(e) => {
        const p = new URLSearchParams(params.toString());
        if (e.target.value) p.set(nombre, e.target.value);
        else p.delete(nombre);
        iniciar(() => router.replace(`${ruta}?${p.toString()}`, { scroll: false }));
      }}
    >
      <option value="">{todos}</option>
      {opciones.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </Desplegable>
    </>
  );
}
