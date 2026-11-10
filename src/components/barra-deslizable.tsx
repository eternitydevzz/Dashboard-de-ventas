"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Barra de pestañas que se desliza también en Windows con ratón (Cristian, 10 nov): la barra de scroll va oculta y
// allí la rueda solo baja; aquí la rueda la mueve hacia los lados y se puede agarrar y arrastrar.
// Si se arrastró, el clic al soltar no abre la pestaña.
export function BarraDeslizable({ children, className = "", ...resto }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let inicio: { x: number; left: number } | null = null;
    let arrastro = false;

    // passive: false para poder frenar el scroll vertical de la página mientras se mueve la barra
    const rueda = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const antes = el.scrollLeft;
      el.scrollLeft += e.deltaY;
      if (el.scrollLeft !== antes) e.preventDefault(); // en el borde, la página sigue bajando
    };
    const bajar = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return; // el dedo ya desliza solo
      inicio = { x: e.clientX, left: el.scrollLeft };
      arrastro = false;
    };
    const mover = (e: PointerEvent) => {
      if (!inicio) return;
      const dx = e.clientX - inicio.x;
      if (!arrastro && Math.abs(dx) < 5) return;
      arrastro = true;
      el.scrollLeft = inicio.left - dx;
    };
    const soltar = () => (inicio = null);
    const clic = (e: MouseEvent) => {
      if (!arrastro) return;
      e.preventDefault();
      e.stopPropagation();
      arrastro = false;
    };
    const arrastrarNativo = (e: DragEvent) => e.preventDefault(); // que el enlace no se «arrastre» como imagen

    el.addEventListener("wheel", rueda, { passive: false });
    el.addEventListener("pointerdown", bajar);
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    el.addEventListener("click", clic, true);
    el.addEventListener("dragstart", arrastrarNativo);
    return () => {
      el.removeEventListener("wheel", rueda);
      el.removeEventListener("pointerdown", bajar);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      el.removeEventListener("click", clic, true);
      el.removeEventListener("dragstart", arrastrarNativo);
    };
  }, []);

  return (
    <div ref={ref} className={`overflow-x-auto [scrollbar-width:none] ${className}`} {...resto}>
      {children}
    </div>
  );
}
