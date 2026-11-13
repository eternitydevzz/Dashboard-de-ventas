"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Modal } from "@/components/modal";
import { Avatar } from "@/components/ui";
import { EtiquetaMercado } from "@/components/mercado-equipo";
import type { Mercado } from "@/lib/mercado";

// KPIs en tarjetas (Fase 5, estilo glass): una por persona con sus números clave y sus tasas en barras.
// Al pulsarla, una ventana con todo el detalle de esa sección y el botón para ir a su ficha (Equipo).
type CifraKpi = { t: string; v: string; d?: string; tasa?: number | null };
export type PersonaKpi = { id: string; nombre: string; foto?: string | null; rol: string; mercado?: Mercado; grandes: CifraKpi[]; tasas: CifraKpi[]; detalle: CifraKpi[] };

export function TarjetasKpis({ personas, vacio, conFicha }: { personas: PersonaKpi[]; vacio: string; conFicha: boolean }) {
  const [abierta, setAbierta] = useState<PersonaKpi | null>(null);
  if (!personas.length) return <p className="py-6 text-center text-sm text-texto-3">{vacio}</p>;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {personas.map((p) => (
          <button
            key={p.id}
            onClick={() => setAbierta(p)}
            className="vidrio group rounded-2xl border border-borde p-4 text-left transition hover:-translate-y-0.5 hover:border-primario/60 hover:shadow-md"
          >
            <div className="flex items-center gap-2.5">
              <Avatar nombre={p.nombre} foto={p.foto} tamano="h-9 w-9 text-xs" />
              <div className="min-w-0">
                <div className="truncate font-semibold">{p.nombre}</div>
                <div className="flex items-center gap-1.5 text-xs text-texto-3">{p.rol}{p.mercado && <EtiquetaMercado m={p.mercado} />}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {p.grandes.map((c) => (
                <div key={c.t} title={c.d}>
                  <div className="text-lg font-semibold tabular-nums leading-tight">{c.v}</div>
                  <div className="text-[11px] text-texto-3">{c.t}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1.5">
              {p.tasas.map((c) => (
                <div key={c.t} title={c.d}>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-texto-2">{c.t}</span>
                    <span className="font-medium tabular-nums">{c.v}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-borde">
                    <div className="h-full rounded-full bg-primario" style={{ width: `${Math.min(100, Math.max(0, c.tasa ?? 0))}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-right text-[11px] text-primario opacity-0 transition group-hover:opacity-100">Ver detalle →</div>
          </button>
        ))}
      </div>
      {abierta && (
        <Modal titulo={abierta.nombre} onCerrar={() => setAbierta(null)} ancho="max-w-lg">
          <div className="space-y-4">
            <div className="text-sm text-texto-3">{abierta.rol} · lo de este periodo</div>
            <dl className="grid grid-cols-2 gap-2">
              {abierta.detalle.map((c) => (
                <div key={c.t} className="rounded-lg bg-panel-2 px-3 py-2" title={c.d}>
                  <dt className="text-[11px] text-texto-3">{c.t}</dt>
                  <dd className="text-base font-semibold tabular-nums">{c.v}</dd>
                </div>
              ))}
            </dl>
            {conFicha && (
              <Link href={`/equipo?ficha=${abierta.id}`} className="btn-primario w-full justify-center">
                <ExternalLink className="h-4 w-4" /> Ver su ficha
              </Link>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
