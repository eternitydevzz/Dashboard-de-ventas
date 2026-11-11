"use client";

import { useEffect, useRef, useState } from "react";
import { M_MAESTRIA } from "@/lib/marca-m";

// Bienvenida (Cristian, 11 nov 2026; maqueta docs/maqueta-bienvenida.html, idea de beterangles.com).
// Tapa la app mientras se precargan las 3 secciones de su rol (los enlaces del menú, barra-lateral.tsx) y se quita
// cuando están las 3, como mínimo a los 0,8 s y como máximo a los 2 s (al recargar en la misma pestaña: 0,3-0,8 s).
// Cristian (11 nov): «no tiene sentido que esté si no carga al menos 1 pantalla». En octubre esperaba a 16 secciones y
// saturó la base (25 oct); ahora son 3. Al quitarse avisa con «bienvenida-fin» (la ventana de mensajes espera).
const CLAVE = "eternity_bienvenida_vista";
export const FIN_BIENVENIDA = "bienvenida-fin";

export function Bienvenida({ nombre, secciones, rutas }: { nombre: string; secciones: string[]; rutas: string[] }) {
  const [fase, setFase] = useState<"cargando" | "saliendo" | "fuera">("cargando");
  const capa = useRef<HTMLDivElement>(null);
  // Texto fijo en vez del array: si el servidor vuelve a pintar el layout (router.refresh) llega otro array con lo mismo,
  // y el efecto no debe repetirse (la capa volvería a salir)
  const claveRutas = rutas.join("|");
  // Quita la capa y avisa a la ventana de mensajes, una sola vez (lo llaman el fin del fundido y el seguro)
  const avisado = useRef(false);
  const quitar = () => {
    setFase("fuera");
    if (avisado.current) return;
    avisado.current = true;
    window.dispatchEvent(new Event(FIN_BIENVENIDA));
  };

  useEffect(() => {
    let corta = false;
    try {
      corta = !!sessionStorage.getItem(CLAVE);
      if (corta) capa.current?.classList.add("corta"); // en la propia capa: el servidor no sabe si es una recarga
      else sessionStorage.setItem(CLAVE, "1");
    } catch {} // sin sessionStorage (modo privado estricto): sale siempre la larga
    const [minimo, maximo] = corta ? [300, 800] : [800, 2000];
    const t0 = performance.now();
    const faltan = new Set(claveRutas.split("|").filter((r) => r && r !== location.pathname)); // la de entrada ya está cargada
    let hecho = false;
    const salir = () => {
      if (hecho) return;
      hecho = true;
      setTimeout(() => setFase("saliendo"), Math.max(0, minimo - (performance.now() - t0)));
    };
    // Cada precarga de sección llega como una petición «…?_rsc=» a su ruta
    const observador = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (!e.name.includes("_rsc=")) continue;
        faltan.delete(new URL(e.name).pathname);
      }
      if (!faltan.size) salir();
    });
    observador.observe({ type: "resource", buffered: true });
    if (!faltan.size) salir();
    const tope = setTimeout(salir, maximo);
    return () => {
      observador.disconnect();
      clearTimeout(tope);
    };
  }, [claveRutas]);

  // Seguro (11 nov 2026, medido en la app publicada): en una pestaña oculta Chrome congela las animaciones y el fundido no
  // terminaba nunca; la capa seguía puesta hasta mirar la pestaña. Si a los 0,5 s de empezar a salir sigue ahí, se quita.
  useEffect(() => {
    if (fase !== "saliendo") return;
    const t = setTimeout(quitar, 500);
    return () => clearTimeout(t);
  }, [fase]);

  if (fase === "fuera") return null;
  const lista = secciones.length > 1 ? `${secciones.slice(0, -1).join(", ")} y ${secciones.at(-1)}` : secciones[0];
  return (
    <div
      ref={capa}
      className={`capa-bienvenida${fase === "saliendo" ? " saliendo" : ""}`}
      role="status"
      aria-live="polite"
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget || fase !== "saliendo") return; // solo el fundido de salida de la capa
        quitar();
      }}
    >
      <div className="logo flex h-14 w-14 items-center justify-center rounded-2xl bg-primario shadow-[0_8px_30px_rgb(43_89_209/0.35)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- la M va dentro del HTML para salir sin esperar */}
        <img src={M_MAESTRIA} alt="Maestria" width={34} height={25} />
      </div>
      <h1 className="px-6 text-center text-[clamp(26px,4.2vw,40px)] font-bold tracking-[-0.03em]">
        Bienvenido <b className="text-primario">{nombre}</b>
      </h1>
      <div className="capa-pista"><i /></div>
      {lista && <p className="text-sm text-texto-3">Preparando {lista}…</p>}
    </div>
  );
}
