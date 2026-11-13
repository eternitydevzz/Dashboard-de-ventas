import { Animaciones } from "@/components/animaciones/animaciones";

// El template se vuelve a montar al cambiar de sección (no con las pestañas de dentro ni los filtros de la dirección).
// 13 nov 2026 (C7, plan 2.7): la entrada suave de antes (.entra-seccion) pasa a las animaciones de la maqueta aprobada.
export default function Plantilla({ children }: { children: React.ReactNode }) {
  return <Animaciones>{children}</Animaciones>;
}
