import Link from "next/link";
import { PhoneCall, ScanSearch } from "lucide-react";

const PESTANAS = [
  { href: "/closer/llamadas", t: "Llamadas", icono: PhoneCall },
  { href: "/closer/analisis", t: "Análisis", icono: ScanSearch },
];

// Llamadas · Análisis (Cristian, 13 oct 2026: sin «Métricas»)
export function PestanasAgendas({ activa }: { activa: "/closer/llamadas" | "/closer/analisis" }) {
  return (
    <nav className="flex w-fit flex-wrap gap-1 rounded-xl border border-borde bg-panel p-1" aria-label="Secciones de Agendas">
      {PESTANAS.map((p) => {
        const Icono = p.icono;
        return (
          <Link prefetch={false} key={p.href} href={p.href} className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm ${activa === p.href ? "bg-primario font-medium text-white" : "text-texto-2 hover:bg-panel-2"}`}>
            <Icono className="h-4 w-4" /> {p.t}
          </Link>
        );
      })}
    </nav>
  );
}
