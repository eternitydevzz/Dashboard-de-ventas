"use client";

import { useRef, useState } from "react";
import type { PuntoSerie } from "@/lib/leads-cifras";

// 1c (Cristian, 26 oct 2026: «cuando ponga el ratón encima debería aparecer el día o la hora, si no, qué sentido
// tiene»): leads por día (o por hora con «Hoy»). Al pasar el ratón o el dedo, una línea vertical marca el punto y un
// cuadro de vidrio dice la fecha, cuántos leads y de qué fuentes. SVG puro, con los colores de la app.
const W = 800;
const H = 200;
const PAD = 8;
const COLORES = ["var(--primario)", "var(--oro)", "var(--ok)", "var(--morado)", "var(--aviso)"];

export function GraficoLeads({ puntos, porHoras }: { puntos: PuntoSerie[]; porHoras: boolean }) {
  const caja = useRef<HTMLDivElement>(null);
  const [i, setI] = useState<number | null>(null);
  const total = puntos.reduce((s, p) => s + p.total, 0);
  const max = Math.max(1, ...puntos.map((p) => p.total));
  const paso = puntos.length > 1 ? (W - PAD * 2) / (puntos.length - 1) : 0;
  const x = (k: number) => (puntos.length > 1 ? PAD + k * paso : W / 2);
  const y = (n: number) => H - PAD - (n / max) * (H - PAD * 2 - 10);
  const linea = puntos.map((p, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(p.total).toFixed(1)}`).join(" ");
  const area = puntos.length ? `${linea} L${x(puntos.length - 1)},${H} L${x(0)},${H} Z` : "";
  // Las fuentes, siempre con el mismo color en todos los puntos (por orden de primera aparición en el periodo)
  const orden = [...new Map(puntos.flatMap((p) => p.fuentes).map((f) => [f.t, 0])).keys()];
  const colorDe = (t: string) => COLORES[orden.indexOf(t) % COLORES.length];

  function mover(clienteX: number) {
    const r = caja.current?.getBoundingClientRect();
    if (!r || !puntos.length) return;
    const enSvg = ((clienteX - r.left) / r.width) * W;
    setI(Math.max(0, Math.min(puntos.length - 1, Math.round((enSvg - PAD) / (paso || 1)))));
  }
  const p = i !== null ? puntos[i] : null;
  const izquierda = i !== null ? (x(i) / W) * 100 : 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <span className="text-2xl font-semibold tabular-nums">{total.toLocaleString("es-ES")} leads</span>
        <span className="text-xs text-texto-3">{porHoras ? "por hora" : "por día"} · toca o pasa el ratón por la gráfica para ver cada {porHoras ? "hora" : "día"}</span>
      </div>
      <div
        ref={caja}
        className="relative touch-pan-y select-none"
        onMouseMove={(e) => mover(e.clientX)}
        onMouseLeave={() => setI(null)}
        onTouchStart={(e) => mover(e.touches[0].clientX)}
        onTouchMove={(e) => mover(e.touches[0].clientX)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full sm:h-52" preserveAspectRatio="none" role="img" aria-label={`Leads ${porHoras ? "por hora" : "por día"}`}>
          <defs>
            <linearGradient id="relleno-leads" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--primario)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--primario)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--borde)" strokeDasharray="3 5" />
          ))}
          {area && <path d={area} fill="url(#relleno-leads)" />}
          {linea && <path d={linea} fill="none" stroke="var(--primario)" strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          {p && <line x1={x(i!)} x2={x(i!)} y1="0" y2={H} stroke="var(--primario)" strokeOpacity="0.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* El punto marcado va fuera del SVG para que sea redondo aunque la gráfica se estire */}
        {p && (
          <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--panel)] bg-primario shadow-[0_0_0_4px_color-mix(in_srgb,var(--primario)_25%,transparent)]" style={{ left: `${izquierda}%`, top: `${(y(p.total) / H) * 100}%` }} />
        )}
        {p && (
          <div
            className="tarjeta ventana pointer-events-none absolute top-0 z-10 w-56 p-3 text-sm"
            style={{ left: `${izquierda}%`, transform: `translateX(${izquierda > 60 ? "calc(-100% - 12px)" : "12px"})` }}
            role="status"
          >
            <div className="text-xs capitalize text-texto-3">{p.largo}</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">{p.total.toLocaleString("es-ES")} {p.total === 1 ? "lead" : "leads"}</div>
            {p.fuentes.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {p.fuentes.slice(0, 5).map((f) => (
                  <li key={f.t} className="flex items-center gap-2 text-xs">
                    <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorDe(f.t) }} />
                    <span className="truncate text-texto-2">{f.t}</span>
                    <span className="ml-auto tabular-nums">{f.n.toLocaleString("es-ES")}</span>
                  </li>
                ))}
                {p.fuentes.length > 5 && <li className="text-[11px] text-texto-3">y {p.fuentes.length - 5} fuentes más</li>}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-texto-3">
        <span>{puntos[0]?.corto}</span>
        {puntos.length > 4 && <span>{puntos[Math.floor(puntos.length / 2)]?.corto}</span>}
        <span>{puntos[puntos.length - 1]?.corto}</span>
      </div>
    </div>
  );
}
