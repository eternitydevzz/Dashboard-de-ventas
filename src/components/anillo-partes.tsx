// 1c · L4 (26 oct 2026): anillo con varias partes (p. ej. leads por fuente o por país) y su leyenda. SVG puro, con los
// colores de la app (cambian solos en modo oscuro). El de components/ui.tsx («Anillo») enseña un solo %.
const COLORES = ["var(--primario)", "var(--oro)", "var(--ok)", "var(--morado)", "var(--aviso)", "var(--mal)", "var(--texto-3)"];

// `centro`: lo que va en el centro si no es la suma (p. ej. etiquetas: un lead tiene varias, la suma no son leads)
export function AnilloPartes({ titulo, partes, max = 6, centro }: { titulo: string; partes: { t: string; n: number }[]; max?: number; centro?: string }) {
  const ordenadas = [...partes].filter((p) => p.n > 0).sort((a, b) => b.n - a.n);
  // Las pequeñas se juntan en «Otros» para que se lea
  const visibles = ordenadas.length > max ? [...ordenadas.slice(0, max - 1), { t: "Otros", n: ordenadas.slice(max - 1).reduce((s, p) => s + p.n, 0) }] : ordenadas;
  const total = visibles.reduce((s, p) => s + p.n, 0);
  const r = 30;
  const c = 2 * Math.PI * r;
  // Dónde empieza cada parte (la suma de las anteriores), calculado antes de dibujar
  const largos = visibles.map((p) => (total ? (p.n / total) * c : 0));
  const inicios = largos.map((_, i) => largos.slice(0, i).reduce((s, x) => s + x, 0));
  return (
    <div>
      <div className="mb-2 text-sm font-medium">{titulo}</div>
      {total === 0 ? (
        <p className="text-sm text-texto-3">Sin datos.</p>
      ) : (
        <div className="flex items-center gap-4">
          <svg width={112} height={112} viewBox="0 0 76 76" className="shrink-0" role="img" aria-label={titulo}>
            <circle cx="38" cy="38" r={r} fill="none" stroke="var(--borde)" strokeWidth="9" />
            {visibles.map((p, i) => (
              <circle key={p.t} cx="38" cy="38" r={r} fill="none" stroke={COLORES[i % COLORES.length]} strokeWidth="9" strokeDasharray={`${largos[i]} ${c - largos[i]}`} strokeDashoffset={-inicios[i]} transform="rotate(-90 38 38)">
                <title>{`${p.t}: ${p.n.toLocaleString("es-ES")} (${Math.round((p.n / total) * 100)} %)`}</title>
              </circle>
            ))}
            <text x="38" y="42" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--texto)">{centro ?? total.toLocaleString("es-ES")}</text>
          </svg>
          <ul className="min-w-0 flex-1 space-y-1 text-sm">
            {visibles.map((p, i) => (
              <li key={p.t} className="flex items-center gap-2">
                <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORES[i % COLORES.length] }} />
                <span className="truncate text-texto-2" title={p.t}>{p.t}</span>
                <span className="ml-auto shrink-0 whitespace-nowrap tabular-nums">{Math.round((p.n / total) * 100)} %</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
