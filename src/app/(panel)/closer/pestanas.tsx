import Link from "next/link";
import { BarChart3, PhoneCall, ScanSearch } from "lucide-react";

// Cristian (13 oct 2026): sin «Métricas»; Agendas abre en «Llamadas» (la página de métricas sigue oculta en /closer)
export const METRICAS_VISIBLE = false;

const PESTANAS = [
  ...(METRICAS_VISIBLE ? [{ href: "/closer", t: "Métricas", icono: BarChart3 } as const] : []),
  { href: "/closer/llamadas", t: "Llamadas", icono: PhoneCall },
  { href: "/closer/analisis", t: "Análisis", icono: ScanSearch },
];

// Métricas · Llamadas · Análisis (como la app que usa hoy el equipo)
export function PestanasAgendas({ activa, mostrarAnalisis = true }: { activa: "/closer" | "/closer/llamadas" | "/closer/analisis"; mostrarAnalisis?: boolean }) {
  return (
    <nav className="flex w-fit flex-wrap gap-1 rounded-xl border border-borde bg-panel p-1" aria-label="Secciones de Agendas">
      {PESTANAS.filter((p) => mostrarAnalisis || p.href !== "/closer/analisis").map((p) => {
        const Icono = p.icono;
        return (
          <Link key={p.href} href={p.href} className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm ${activa === p.href ? "bg-primario font-medium text-white" : "text-texto-2 hover:bg-panel-2"}`}>
            <Icono className="h-4 w-4" /> {p.t}
          </Link>
        );
      })}
    </nav>
  );
}
