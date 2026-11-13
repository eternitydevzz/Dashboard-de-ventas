"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { alCoger, alSoltar, deslizarPestanas, deslizarResalte, entrada, fotoPestanas, onda, salida, type FotoPestanas } from "./efectos";

let ultimaSalida = 0; // si la sección anterior acaba de irse, la nueva espera 90 ms (como la maqueta)
const CARGANDO = '[aria-busy="true"]'; // el esqueleto de (panel)/loading.tsx

// Envuelve cada sección (template.tsx: se vuelve a montar al cambiar de sección, no con las pestañas ni los filtros)
export function Animaciones({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const clave = `${usePathname()}?${useSearchParams()}`;
  const claveAntes = useRef(clave);
  const foto = useRef<FotoPestanas>(new Map());

  useLayoutEffect(() => {
    const raiz = ref.current!;
    const entrar = (base: number) => {
      entrada(raiz, { base, titulo: true });
      foto.current = fotoPestanas(raiz);
    };
    // con esqueleto, la entrada espera a que llegue la sección de verdad
    const obs = new MutationObserver(() => {
      if (raiz.querySelector(CARGANDO)) return;
      obs.disconnect();
      entrar(0);
    });
    if (raiz.querySelector(CARGANDO)) obs.observe(raiz, { childList: true, subtree: true });
    else entrar(Date.now() - ultimaSalida < 400 ? 90 : 0);
    document.addEventListener("pointerdown", onda, { passive: true });
    document.addEventListener("dragstart", alCoger, true);
    document.addEventListener("drop", alSoltar, true);
    return () => {
      obs.disconnect();
      document.removeEventListener("pointerdown", onda);
      document.removeEventListener("dragstart", alCoger, true);
      document.removeEventListener("drop", alSoltar, true);
      if (salida(raiz)) ultimaSalida = Date.now();
    };
  }, []);

  // Cambio de pestaña dentro de la sección: la raya o la píldora viaja y solo entra lo de debajo de su barra
  useLayoutEffect(() => {
    if (claveAntes.current === clave) return;
    claveAntes.current = clave;
    const raiz = ref.current!;
    const barra = deslizarPestanas(raiz, foto.current);
    if (barra) entrada(raiz, { barra });
    foto.current = fotoPestanas(raiz);
  }, [clave]);

  return <div ref={ref}>{children}</div>;
}

// Menú lateral: el resalte viaja de la opción vieja a la nueva (el enlace activo lleva data-activo)
export function useResalteMenu(nav: RefObject<HTMLElement | null>, clave: string) {
  const antes = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const nuevo = nav.current?.querySelector<HTMLElement>("a[data-activo]") ?? null;
    if (nuevo) deslizarResalte(nuevo, antes.current?.isConnected ? antes.current : null);
    antes.current = nuevo;
  }, [nav, clave]);
}
