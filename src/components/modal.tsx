"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Portal } from "@/components/portal";

// Ventanas abiertas, de la de abajo a la de encima: Escape cierra solo la de encima (Cristian, 26 oct 2026)
const abiertas: string[] = [];

// `cabecera` y `claseVentana` (C5, plan Callers, 7 nov): la ventana del guion pone su propia cabecera (con su X) y
// su tamaño (solo se desplaza el centro; en el móvil, pantalla completa)
export function Modal({
  titulo,
  onCerrar,
  children,
  ancho = "max-w-md",
  cabecera,
  claseVentana,
  claseFondo = "p-4",
}: {
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
  ancho?: string;
  cabecera?: React.ReactNode;
  claseVentana?: string;
  claseFondo?: string;
}) {
  const id = useId();
  // La última onCerrar, sin volver a apuntar la ventana en cada pintado
  const cerrar = useRef(onCerrar);
  useEffect(() => {
    cerrar.current = onCerrar;
  }, [onCerrar]);
  useEffect(() => {
    abiertas.push(id);
    const tecla = (e: KeyboardEvent) => {
      // defaultPrevented: Escape ya lo usó algo de dentro (p. ej. cerrar un desplegable abierto)
      if (e.key !== "Escape" || e.defaultPrevented || abiertas[abiertas.length - 1] !== id) return;
      e.preventDefault();
      cerrar.current();
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      const i = abiertas.lastIndexOf(id);
      if (i >= 0) abiertas.splice(i, 1);
    };
  }, [id]);

  return (
    <Portal>
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-md ${claseFondo}`} onClick={onCerrar}>
      <div className={`tarjeta ventana ${claseVentana ?? `w-full ${ancho} p-5`}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titulo}>
        {cabecera ?? (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{titulo}</h2>
            <button onClick={onCerrar} className="rounded-md p-1 text-texto-3 hover:bg-panel-2" aria-label="Cerrar"><X className="h-5 w-5" /></button>
          </div>
        )}
        {children}
      </div>
    </div>
    </Portal>
  );
}
