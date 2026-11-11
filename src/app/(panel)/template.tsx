// 11 nov 2026 (bienvenida y cambio de sección): cada sección entra suave (subiendo 8 px en 0,35 s). El template se
// vuelve a montar al cambiar de sección (no con las pestañas de dentro ni los filtros de la dirección).
export default function Plantilla({ children }: { children: React.ReactNode }) {
  return <div className="entra-seccion">{children}</div>;
}
