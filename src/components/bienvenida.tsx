"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

// Bienvenida (Cristian, 11 nov 2026; maqueta docs/maqueta-bienvenida.html, idea de beterangles.com): capa solo visual.
// No espera a ninguna petición (la de octubre esperaba a la precarga de las 16 secciones y saturó la base el 25 oct).
// Al abrir la pestaña dura 2 s; al recargar en la misma pestaña, la versión corta de 0,8 s (sin barra). Antes 3,4 s: «tarda mucho» (Cristian, 11 nov).
// Al terminar avisa con el evento «bienvenida-fin» (la ventana de mensajes espera a que se quite).
const CLAVE = "eternity_bienvenida_vista";
export const FIN_BIENVENIDA = "bienvenida-fin";

export function Bienvenida({ nombre, secciones }: { nombre: string; secciones: string[] }) {
  const [visible, setVisible] = useState(true);
  const capa = useRef<HTMLDivElement>(null);

  // La versión corta se pone en la propia capa (no en el estado): el servidor no sabe si es una recarga
  useEffect(() => {
    try {
      if (sessionStorage.getItem(CLAVE)) capa.current?.classList.add("corta");
      else sessionStorage.setItem(CLAVE, "1");
    } catch {} // sin sessionStorage (modo privado estricto): sale siempre la larga
  }, []);

  if (!visible) return null;
  const lista = secciones.length > 1 ? `${secciones.slice(0, -1).join(", ")} y ${secciones.at(-1)}` : secciones[0];
  return (
    <div
      ref={capa}
      className="capa-bienvenida"
      role="status"
      aria-live="polite"
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return; // solo la animación de la capa, no la del texto o la barra
        setVisible(false);
        window.dispatchEvent(new Event(FIN_BIENVENIDA));
      }}
    >
      <div className="logo flex h-14 w-14 items-center justify-center rounded-2xl bg-primario shadow-[0_8px_30px_rgb(43_89_209/0.35)]">
        <Image src="/marca/maestria-m.png" alt="Maestria" width={34} height={25} priority style={{ height: "auto" }} />
      </div>
      <h1 className="px-6 text-center text-[clamp(26px,4.2vw,40px)] font-bold tracking-[-0.03em]">
        Bienvenido <b className="text-primario">{nombre}</b>
      </h1>
      <div className="capa-pista"><i /></div>
      {lista && <p className="text-sm text-texto-3">Preparando {lista}…</p>}
    </div>
  );
}
