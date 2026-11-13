import Link from "next/link";
import { MERCADOS, type Mercado } from "@/lib/mercado";

// Cristian (13 nov 2026): quien edita cambia aquí entre lo de Latam y lo de España (mismas pantallas)
export function SelectorMercado({ actual, href }: { actual: Mercado; href: (m: Mercado) => string }) {
  return (
    <div className="tarjeta flex flex-wrap items-center gap-1 p-1.5" role="tablist" aria-label="Equipo">
      {MERCADOS.map((m) => (
        <Link key={m.v} href={href(m.v)} role="tab" aria-selected={actual === m.v} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${actual === m.v ? "bg-primario text-white" : "text-texto-2 hover:bg-panel-2"}`}>
          {m.t}
        </Link>
      ))}
      {actual === "es" && <span className="px-2 text-xs text-texto-3">Lo que España no tenga puesto aquí, lo ve de Latam.</span>}
    </div>
  );
}
