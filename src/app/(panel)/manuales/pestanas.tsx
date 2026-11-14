import Link from "next/link";

// Cristian, 14 nov: pestañas «Manuales | Guiones» arriba, como las de KPIs (texto con línea azul debajo de la abierta).
// Cada una solo sale con su permiso; con una sola, no hay barra.
export function PestanasManuales({ activa, manuales, guiones }: { activa: "manuales" | "guiones"; manuales: boolean; guiones: boolean }) {
  const lista = [...(manuales ? [{ v: "manuales", t: "Manuales", href: "/manuales" }] : []), ...(guiones ? [{ v: "guiones", t: "Guiones", href: "/guiones" }] : [])];
  if (lista.length < 2) return null;
  return (
    <div className="tarjeta px-4">
      <div className="flex gap-6" role="tablist">
        {lista.map((p) => (
          <Link key={p.v} href={p.href} role="tab" aria-selected={activa === p.v} className={`relative shrink-0 py-3 text-sm font-medium transition-colors ${activa === p.v ? "text-texto" : "text-texto-3 hover:text-texto"}`}>
            {p.t}
            {activa === p.v && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primario" aria-hidden />}
          </Link>
        ))}
      </div>
    </div>
  );
}
