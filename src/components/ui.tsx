import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { iniciales, pct } from "@/lib/formato";

export function Cabecera({ titulo, subtitulo, acciones }: { titulo: string; subtitulo?: ReactNode; acciones?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 px-4 pb-4 pt-16 sm:px-8 lg:pt-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-texto-2">{subtitulo}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}

export function Contenido({ children }: { children: ReactNode }) {
  return <main className="space-y-5 px-4 pb-12 sm:px-8">{children}</main>;
}

type Tono = "primario" | "oro" | "ok" | "mal" | "aviso" | "morado";
const TONO_ICONO: Record<Tono, string> = {
  primario: "bg-primario-suave text-primario",
  oro: "bg-oro-suave text-oro",
  ok: "bg-ok-suave text-ok",
  mal: "bg-mal-suave text-mal",
  aviso: "bg-aviso-suave text-aviso",
  morado: "bg-primario-suave text-morado",
};

export function Kpi({
  titulo,
  valor,
  icono: Icono,
  tono = "primario",
  detalle,
  cambio,
  destacado,
  compacto,
  ayuda,
}: {
  titulo: string;
  valor: ReactNode;
  icono: LucideIcon;
  tono?: Tono;
  detalle?: ReactNode;
  cambio?: number | null;
  destacado?: boolean;
  compacto?: boolean; // a mitad de tamaño (KPIs → «Leads», Cristian, 26 oct 2026)
  ayuda?: string; // texto al pasar el ratón
}) {
  return (
    <div
      title={ayuda}
      className={`tarjeta relative overflow-hidden ${compacto ? "px-3 py-2.5" : "p-4"} ${
        destacado ? "border-oro/40 bg-gradient-to-br from-oro-suave to-panel" : ""
      }`}
    >
      {compacto ? (
        // A mitad de tamaño: el icono pequeño al lado del título y la cifra debajo
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${TONO_ICONO[tono]}`}>
              <Icono className="h-3 w-3" />
            </span>
            <div className="titulo-seccion truncate text-[10px]">{titulo}</div>
          </div>
          <div className={`mt-1 text-xl font-semibold tracking-tight tabular-nums ${destacado ? "text-oro" : ""}`}>{valor}</div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="titulo-seccion">{titulo}</div>
            <div className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${destacado ? "text-oro" : ""}`}>{valor}</div>
          </div>
          <span className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-full sm:flex ${TONO_ICONO[tono]}`}>
            <Icono className="h-5 w-5" />
          </span>
        </div>
      )}
      {(detalle || cambio !== undefined) && (
        <div className={`flex items-center gap-1.5 text-texto-3 ${compacto ? "mt-0.5 min-w-0 text-[11px]" : "mt-2 text-xs"}`}>
          {cambio !== undefined && cambio !== null && <Cambio valor={cambio} />}
          {compacto ? <span className="line-clamp-2">{detalle}</span> : detalle}
        </div>
      )}
    </div>
  );
}

export function Cambio({ valor }: { valor: number }) {
  if (valor === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-texto-3">
        <Minus className="h-3 w-3" />0 %
      </span>
    );
  const sube = valor > 0;
  const Icono = sube ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium ${sube ? "text-ok" : "text-mal"}`}>
      <Icono className="h-3 w-3" />
      {pct(Math.abs(valor), 0)}
    </span>
  );
}

export function Anillo({ valor, color = "var(--primario)", tamano = 76 }: { valor: number; color?: string; tamano?: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, valor));
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 76 76" className="shrink-0" role="img" aria-label={`${v}%`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--borde)" strokeWidth="7" />
      <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`}
        transform="rotate(-90 38 38)"
      />
      <text x="38" y="42.5" textAnchor="middle" fontSize="14" fontWeight="600" fill="var(--texto)">
        {pct(v)}
      </text>
    </svg>
  );
}

export function Seccion({ titulo, acciones, children, className = "" }: { titulo?: string; acciones?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`tarjeta p-4 sm:p-5 ${className}`}>
      {(titulo || acciones) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {titulo && <h2 className="titulo-seccion">{titulo}</h2>}
          {acciones}
        </div>
      )}
      {children}
    </section>
  );
}

export function Vacio({ icono: Icono, texto }: { icono: LucideIcon; texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-texto-3">
      <Icono className="h-6 w-6" />
      {texto}
    </div>
  );
}

// Gráfico de área diario (SVG puro).
export function GraficoDiario({ puntos, color = "var(--primario)", formato }: { puntos: { dia: string; valor: number }[]; color?: string; formato?: (n: number) => string }) {
  const W = 600;
  const H = 160;
  const pad = 6;
  const max = Math.max(1, ...puntos.map((p) => p.valor));
  const paso = puntos.length > 1 ? (W - pad * 2) / (puntos.length - 1) : 0;
  const xy = puntos.map((p, i) => [pad + i * paso, H - pad - (p.valor / max) * (H - pad * 2 - 14)] as const);
  const linea = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = xy.length ? `${linea} L${xy[xy.length - 1][0]},${H} L${xy[0][0]},${H} Z` : "";
  const id = `g${Math.abs(color.length * 7919 + puntos.length)}`;
  const total = puntos.reduce((s, p) => s + p.valor, 0);
  return (
    <div>
      <div className="mb-1 text-2xl font-semibold tabular-nums">{formato ? formato(total) : total}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" preserveAspectRatio="none" role="img" aria-label="Evolución diaria">
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--borde)" strokeDasharray="3 5" />
        ))}
        {area && <path d={area} fill={`url(#${id})`} />}
        {linea && <path d={linea} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />}
        {xy.map(([x, y], i) =>
          puntos[i].valor > 0 ? <circle key={i} cx={x} cy={y} r="2.8" fill={color}><title>{`${puntos[i].dia}: ${formato ? formato(puntos[i].valor) : puntos[i].valor}`}</title></circle> : null
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-texto-3">
        <span>{puntos[0]?.dia}</span>
        <span>{puntos[puntos.length - 1]?.dia}</span>
      </div>
    </div>
  );
}

export function Insignia({ children, tono = "neutro" }: { children: ReactNode; tono?: "neutro" | Tono }) {
  const clases: Record<string, string> = {
    neutro: "bg-panel-2 text-texto-2 ring-1 ring-borde",
    primario: "bg-primario-suave text-primario",
    // 7c.4 (plan Callers): texto más oscuro para llegar a 4,5:1 sobre el fondo suave
    oro: "bg-oro-suave text-oro-texto",
    ok: "bg-ok-suave text-ok-texto",
    mal: "bg-mal-suave text-mal",
    aviso: "bg-aviso-suave text-aviso-texto",
    morado: "bg-primario-suave text-morado",
  };
  return <span className={`chip ${clases[tono]}`}>{children}</span>;
}

export function Avatar({ nombre, tamano = "h-8 w-8 text-[11px]" }: { nombre: string; tamano?: string }) {
  const ini = iniciales(nombre);
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-primario-suave font-semibold text-primario ${tamano}`}>
      {ini}
    </span>
  );
}
