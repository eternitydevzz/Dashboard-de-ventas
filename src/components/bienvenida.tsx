"use client";

import { useEffect, useRef, useState } from "react";
import { M_MAESTRIA } from "@/lib/marca-m";
import { hayDatosPendientes } from "@/lib/pantalla-lista";

// Bienvenida (Cristian, 11 nov 2026; maqueta docs/maqueta-bienvenida.html, idea de beterangles.com).
// Tapa la app hasta que la pantalla de entrada tiene sus datos (esperarPantalla, abajo), también al recargar.
// Cristian (11 nov): «no tiene sentido que esté si no carga al menos 1 pantalla». Al quitarse avisa con «bienvenida-fin»
// (la ventana de mensajes espera y la barra lateral lanza entonces las 3 precargas de su rol).
export const FIN_BIENVENIDA = "bienvenida-fin";

// Cristian, 14 nov: la primera petición «_rsc» de una sección puede ser solo el árbol de rutas (sin datos), una
// redirección o un fallo; esas no la dan por cargada. Solo cuenta una respuesta buena con cuerpo.
// Ola 2 (14 nov): la bienvenida ya no la usa; queda porque la prueba tests/unit/ola-arreglos.test.ts (de otro carril) la importa.
// shortcut: «con datos» = más de 2 KB sin comprimir (el árbol pesa menos); si Next cambia sus precargas, revisar la cifra.
export function precargaConDatos(e: PerformanceResourceTiming) {
  const estado = e.responseStatus ?? 200; // Safari no da el estado: se da por bueno
  return e.name.includes("_rsc=") && estado >= 200 && estado < 300 && e.decodedBodySize > 2048;
}

// Cristian, 14 nov (Ola 2, «la velocidad, lo más importante»): ya no espera a las precargas del menú (la de /crm acababa a
// ~5,4 s y la capa se quedaba hasta el tope de 4 s); solo a la pantalla abierta: mínimo 0,8 s, máximo 4 s y, entre medias,
// en cuanto no tiene datos por llegar (lib/pantalla-lista.ts: el contador de cargandoDatos() y la marca
// data-datos-pendientes, que lleva también la pantalla de carga, (panel)/loading.tsx). Se mira cada 100 ms: el aviso de
// «ya llegaron» puede llegar antes de que la marca se quite del HTML. Las precargas empiezan al quitarse (barra-lateral.tsx).
// Cristian, 14 nov (noche): sin el mínimo de 0,8 s (se ganaba hasta 0,8 s al abrir la app); se quita en cuanto hay datos
export function esperarPantalla(salir: () => void, pendientes = hayDatosPendientes, [minimo, maximo] = [0, 4000]) {
  const t0 = Date.now();
  let hecho = false;
  const fin = () => {
    if (hecho) return;
    hecho = true;
    const espera = minimo - (Date.now() - t0);
    if (espera > 0) setTimeout(salir, espera);
    else salir();
  };
  const mirar = setInterval(() => {
    if (!pendientes()) fin();
  }, 100);
  const tope = setTimeout(fin, maximo);
  return () => {
    clearInterval(mirar);
    clearTimeout(tope);
  };
}

export function Bienvenida({ nombre, secciones }: { nombre: string; secciones: string[] }) {
  const [fase, setFase] = useState<"cargando" | "saliendo" | "fuera">("cargando");
  const capa = useRef<HTMLDivElement>(null);
  // Quita la capa y avisa a la ventana de mensajes, una sola vez (lo llaman el fin del fundido y el seguro)
  const avisado = useRef(false);
  const quitar = () => {
    setFase("fuera");
    if (avisado.current) return;
    avisado.current = true;
    window.dispatchEvent(new Event(FIN_BIENVENIDA));
  };

  // Siempre la completa, también al recargar (Cristian, 11 nov: «si recargo no hace la pantalla de carga completa»).
  // Una sola vez: si el servidor vuelve a pintar el layout (router.refresh), la capa no vuelve a salir
  useEffect(() => esperarPantalla(() => setFase("saliendo")), []);

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
