"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarRange, Search } from "lucide-react";
import { Desplegable } from "@/components/eleccion";

const PERIODOS = [
  { v: "hoy", t: "Hoy" },
  { v: "semana", t: "Semana" },
  { v: "mes", t: "Mes" },
  { v: "todo", t: "Todo" },
];

const CAMPO_LIGERO = "campo min-w-0 flex-1 px-2.5 py-1 text-[13px] sm:w-44 sm:flex-none";

// Barra de filtros: vendedor, periodo, fechas y búsqueda. Todo va en la URL.
export function Filtros({
  vendedores,
  productos,
  conBusqueda = false,
  periodoPorDefecto = "mes",
  ligero = false,
}: {
  vendedores?: { id: string; nombre: string; rol: string }[];
  productos?: { id: string; nombre: string }[];
  conBusqueda?: boolean;
  periodoPorDefecto?: string;
  // Sin tarjeta propia y con el periodo como texto (KPIs → «Leads», boceto B elegido por Cristian el 26 oct 2026)
  ligero?: boolean;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [cargando, iniciar] = useTransition();
  // Velocidad (17 oct 2026, Cristian: «en Funnel, de Mes a Todo se siente lento»): el periodo pulsado se marca al
  // momento, sin esperar al servidor (vale mientras no cambie la dirección)
  const [yendo, setYendo] = useState<{ a: string; desde: string } | null>(null);
  const periodo = (yendo && yendo.desde === params.toString() ? yendo.a : null) ?? params.get("periodo") ?? periodoPorDefecto;
  const [verFechas, setVerFechas] = useState(periodo === "rango");
  const [q, setQ] = useState(params.get("q") ?? "");

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
    <div className={`flex flex-wrap items-center ${ligero ? "gap-0.5" : "tarjeta gap-2 p-2.5"} ${cargando ? "opacity-70" : ""}`}>
      {/* ligero: vendedor y producto juntos en una línea y más pequeños (en el móvil, mitad y mitad; Cristian, 26 oct) */}
      <div className={ligero ? "flex w-full min-w-0 gap-1.5 sm:w-auto" : "contents"}>
      {vendedores && (
        <Desplegable
          aria-label="Vendedor"
          className={ligero ? CAMPO_LIGERO : "campo w-auto min-w-44"}
          value={params.get("vendedor") ?? ""}
          onChange={(e) => poner({ vendedor: e.target.value })}
        >
          <option value="">Todo el equipo</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nombre} · {v.rol}
            </option>
          ))}
        </Desplegable>
      )}
      {productos && (
        <Desplegable
          aria-label="Producto"
          className={ligero ? CAMPO_LIGERO : "campo w-auto min-w-44"}
          value={params.get("producto") ?? ""}
          onChange={(e) => poner({ producto: e.target.value })}
        >
          <option value="">Todos los productos</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Desplegable>
      )}
      </div>
      <div className={ligero ? "flex gap-0.5" : "flex rounded-lg border border-borde bg-panel-2 p-0.5"}>
        {PERIODOS.map((p) => (
          // Enlaces (17 oct 2026). Precarga por defecto (solo el esqueleto): la completa hacía demasiadas lecturas (D1, 13 nov)
          <Link
            key={p.v}
            href={conCambios({ periodo: p.v, desde: null, hasta: null })}
            replace
            scroll={false}
            onClick={() => {
              setVerFechas(false);
              if (p.v !== periodo) setYendo({ a: p.v, desde: params.toString() });
            }}
            className={
              ligero
                ? `rounded-full px-2.5 py-1 text-[13px] font-medium transition-colors ${periodo === p.v ? "bg-primario-suave text-primario" : "text-texto-3 hover:text-texto"}`
                : `rounded-md px-3 py-1.5 text-sm transition-colors ${periodo === p.v ? "bg-primario text-white shadow-sm" : "text-texto-2 hover:text-texto"}`
            }
          >
            {p.t}
          </Link>
        ))}
      </div>
      <button
        onClick={() => setVerFechas((v) => !v)}
        className={
          ligero
            ? `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium transition-colors ${periodo === "rango" || verFechas ? "bg-primario-suave text-primario" : "text-texto-3 hover:text-texto"}`
            : `btn-secundario ${periodo === "rango" ? "border-primario text-primario" : ""}`
        }
      >
        <CalendarRange className={ligero ? "h-3.5 w-3.5" : "h-4 w-4"} /> Fechas
      </button>
      {verFechas && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            poner({ periodo: "rango", desde: String(f.get("desde")), hasta: String(f.get("hasta")) });
          }}
        >
          <input type="date" name="desde" required defaultValue={params.get("desde") ?? ""} className="campo w-auto" />
          <span className="text-texto-3">→</span>
          <input type="date" name="hasta" required defaultValue={params.get("hasta") ?? ""} className="campo w-auto" />
          <button className="btn-primario">Aplicar</button>
        </form>
      )}
      {conBusqueda && (
        <form
          className="relative ml-auto min-w-56 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            poner({ q });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-texto-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => q !== (params.get("q") ?? "") && poner({ q })}
            placeholder="Buscar lead por nombre, email o teléfono…"
            className="campo pl-9"
          />
        </form>
      )}
    </div>
  );
}
