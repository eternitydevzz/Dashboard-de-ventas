"use client";

import { useState } from "react";

// 1c (Cristian, 26 oct 2026: «el embudo, con estilo glassmorphism, es lo único que no encaja con la app»): cada paso es
// una franja de vidrio que se llena con el color de su etapa según cuántos llegan. Al pasar el ratón (o tocar) un paso: cuántos, % del total, % del paso anterior y cuántos
// se pierden. Colores de la app (cambian solos en modo oscuro). Lo usa la pestaña «Leads»; «Por persona» sigue con el suyo.
// 26 oct (Cristian: «que vuelva la anterior y a mitad de tamaño»): la mitad de ancho, de alto y de letra.
// 26 oct (Cristian): azul para contacto (3 tonos), amarillo para agenda y asistencia (2 tonos) y verde solo para la
// compra; dentro de cada color, más claro cuanto más lejos de la compra.
type Paso = { t: string; n: number; d?: string };
const TONO = [
  "color-mix(in srgb, var(--primario) 65%, white)",
  "var(--primario-2)",
  "var(--primario)",
  "color-mix(in srgb, var(--oro) 70%, white)",
  "var(--oro)",
  "var(--ok)",
];

export function EmbudoVidrio({ pasos }: { pasos: Paso[] }) {
  const [activo, setActivo] = useState<number | null>(null);
  const total = pasos[0]?.n ?? 0;
  const pct = (a: number, b: number) => (b ? `${(Math.round((a / b) * 1000) / 10).toLocaleString("es-ES")} %` : "—");
  return (
    <div className="mx-auto max-w-3xl space-y-0.5" role="list" aria-label="Embudo">
      {pasos.map((p, i) => {
        const tono = TONO[Math.min(i, TONO.length - 1)];
        // Ancho: proporcional, pero cada franja se lee siempre (mínimo 10,5rem, para que en el móvil no se corte «Agendan · 1,4 %») y baja poco a poco como un embudo
        const ancho = 30 + 70 * Math.sqrt(total ? p.n / total : 0);
        const anterior = i > 0 ? pasos[i - 1].n : null;
        const abierto = activo === i;
        // Nunca negativo: un paso puede tener más que el anterior (p. ej. un caller que vende sin cita)
        const pierden = anterior === null ? 0 : Math.max(0, anterior - p.n);
        return (
          <div key={p.t} role="listitem">
            {anterior !== null && (
              <div className="flex justify-center py-0.5">
                <span className="text-[10px] tabular-nums text-texto-3">
                  ↓ {pct(p.n, anterior)} pasa · se pierden {pierden.toLocaleString("es-ES")}
                </span>
              </div>
            )}
            <div
              tabIndex={0}
              onMouseEnter={() => setActivo(i)}
              onMouseLeave={() => setActivo(null)}
              onFocus={() => setActivo(i)}
              onBlur={() => setActivo(null)}
              onClick={() => setActivo(abierto ? null : i)}
              className={`vidrio relative mx-auto min-w-[10.5rem] max-w-full cursor-default overflow-hidden rounded-xl border transition-all duration-200 ${abierto ? "scale-[1.01] border-primario/50" : "border-borde"}`}
              style={{ width: `${ancho}%` }}
              title={p.d}
            >
              {/* El color de la etapa, como un líquido dentro del vidrio */}
              {/* Más intenso a la derecha, donde va la cifra en blanco (en claro, un tono suave no daría contraste) */}
              <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${tono} 72%, transparent), ${tono})` }} />
              <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--brillo)] to-transparent opacity-40" />
              <div className="relative flex items-center justify-between gap-2 px-3 py-1.5 text-white">
                <div className="min-w-0 truncate text-xs font-semibold">
                  {p.t} <span className="font-normal opacity-85">· {pct(p.n, total)}</span>
                </div>
                <div className="text-sm font-semibold tabular-nums">{p.n.toLocaleString("es-ES")}</div>
              </div>
            </div>
            {abierto && (
              <div className="tarjeta ventana mx-auto mt-1.5 grid max-w-md grid-cols-3 gap-2 p-3 text-center text-xs" role="status">
                <div><div className="text-texto-3">Del total</div><div className="text-base font-semibold tabular-nums">{pct(p.n, total)}</div></div>
                <div><div className="text-texto-3">Del paso anterior</div><div className="text-base font-semibold tabular-nums">{anterior === null ? "—" : pct(p.n, anterior)}</div></div>
                <div><div className="text-texto-3">Se pierden</div><div className="text-base font-semibold tabular-nums">{anterior === null ? "—" : pierden.toLocaleString("es-ES")}</div></div>
                {p.d && <div className="col-span-3 text-left text-texto-2">{p.d}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
