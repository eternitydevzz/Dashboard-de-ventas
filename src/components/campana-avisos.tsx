"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { AvisoCeo } from "@/lib/avisos-ceo";

// Campana del CEO: todos los avisos a la vez (cada tipo ya viene agrupado con su cuenta)
// A2-05 (17 nov): fondo casi opaco («ventana», como los desplegables); se cierra con Escape o con un clic fuera
export function CampanaAvisos({ avisos }: { avisos: AvisoCeo[] }) {
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const total = avisos.length; // A2-06 (17 nov): cuántos avisos hay, no la suma de sus cuentas (salía «37» con 4 avisos)
  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierta(false);
    const fuera = (e: PointerEvent) => !caja.current?.contains(e.target as Node) && setAbierta(false);
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fuera);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fuera);
    };
  }, [abierta]);
  return (
    <div ref={caja} className="relative">
      <button onClick={() => setAbierta((v) => !v)} className="relative rounded-md p-1.5 text-texto-3 hover:bg-panel-2 hover:text-texto" title="Avisos" aria-label="Avisos" aria-expanded={abierta}>
        <Bell className="h-4 w-4" />
        {total > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-mal px-1 text-[10px] font-semibold leading-4 text-white">{total}</span>}
      </button>
      {abierta && (
        <div className="tarjeta ventana absolute bottom-full left-0 z-50 mb-2 w-72 p-3 text-sm shadow-lg">
          {avisos.length ? <ul className="space-y-2">{avisos.map((a) => <li key={a.tipo + a.texto}>{a.texto}</li>)}</ul> : <p className="text-texto-3">Sin avisos.</p>}
        </div>
      )}
    </div>
  );
}
