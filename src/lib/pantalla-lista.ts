"use client";

// Cuenta los datos que la pantalla aún está cargando. Un componente que carga datos tras pintar (p. ej. KPIs → «Leads»)
// avisa con cargandoDatos(); la bienvenida (components/bienvenida.tsx) espera a que no quede ninguno.
let pendientes = 0;

// Llamar al empezar a cargar; devuelve la función para avisar de que ya está (se puede llamar varias veces)
export function cargandoDatos() {
  pendientes++;
  let hecho = false;
  return () => {
    if (hecho) return;
    hecho = true;
    pendientes--;
  };
}

// También cuenta lo que se ve en pantalla con la marca data-datos-pendientes (p. ej. «Cargando los 1.629 leads…»):
// llega en el HTML antes de que el componente pida sus datos (medido el 18 oct: medio segundo después de cargar)
export function hayDatosPendientes() {
  return pendientes > 0 || !!document.querySelector("[data-datos-pendientes]");
}
