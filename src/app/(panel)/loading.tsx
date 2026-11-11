// Esqueleto mientras carga una sección (se ve un instante al cambiar de página). 11 nov 2026: con brillo que pasa
// (.esqueleto en globals.css) en vez de parpadear, como en la maqueta docs/maqueta-bienvenida.html.
export default function Cargando() {
  return (
    <div className="px-4 pt-16 sm:px-8 lg:pt-8" aria-busy="true" aria-label="Cargando">
      <div className="esqueleto h-8 w-48 rounded-lg" />
      <div className="esqueleto mt-2 h-4 w-72 rounded" />
      <div className="esqueleto mt-6 h-14 rounded-xl" />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="esqueleto h-28 rounded-xl" />)}
      </div>
      <div className="esqueleto mt-5 h-64 rounded-xl" />
    </div>
  );
}
