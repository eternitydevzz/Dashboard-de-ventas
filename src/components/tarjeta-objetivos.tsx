"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Modal } from "@/components/modal";
import { Anillo, Avatar } from "@/components/ui";

// Objetivos en tarjetas (Fase 5): por persona, el avance medio en un anillo y cuántos lleva cumplidos.
// Al pulsarla, sus barras de objetivos en una ventana y el botón para ir a su ficha.
export function TarjetaObjetivos({
  id,
  nombre,
  foto,
  rol,
  medio,
  cumplidos,
  total,
  conFicha,
  children,
}: {
  id: string;
  nombre: string;
  foto?: string | null; // N3: ruta de su foto (sin ella, sus iniciales)
  rol: string;
  medio: number | null; // % medio de sus objetivos (null = sin objetivos)
  cumplidos: number;
  total: number;
  conFicha: boolean;
  children: ReactNode; // sus barras (se pintan en el servidor)
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button onClick={() => setAbierta(true)} className="vidrio flex items-center gap-3 rounded-2xl border border-borde p-4 text-left transition hover:-translate-y-0.5 hover:border-primario/60 hover:shadow-md">
        <Anillo valor={Math.round(medio ?? 0)} tamano={64} color={medio !== null && medio >= 100 ? "var(--ok)" : "var(--primario)"} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Avatar nombre={nombre} foto={foto} tamano="h-6 w-6 text-[9px]" />
            <span className="truncate font-semibold">{nombre}</span>
          </div>
          <div className="mt-0.5 text-xs text-texto-3">{rol}</div>
          <div className="mt-1 text-xs text-texto-2">{total ? `${cumplidos} de ${total} objetivos cumplidos` : "Sin objetivos ahora"}</div>
        </div>
      </button>
      {abierta && (
        <Modal titulo={`Objetivos de ${nombre}`} onCerrar={() => setAbierta(false)} ancho="max-w-3xl">
          <div className="space-y-4">
            {children}
            {conFicha && (
              <Link href={`/equipo?ficha=${id}`} className="btn-primario w-full justify-center">
                <ExternalLink className="h-4 w-4" /> Ver su ficha
              </Link>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
