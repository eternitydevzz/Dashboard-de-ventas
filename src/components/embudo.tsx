// Embudo dibujado (Fase 5): cada paso es una franja más estrecha que la anterior, con su número y, entre paso y
// paso, el % que pasa al siguiente. Se usa en KPIs y en Agendas. Sin JavaScript: se pinta en el servidor.
type PasoEmbudo = { t: string; n: number; d?: string };

const COLORES = ["#2f55d4", "#3b6ae0", "#4f7fe8", "#16a34a", "#0f9a4a"];

export function Embudo({ pasos, titulo }: { pasos: PasoEmbudo[]; titulo?: string }) {
  const max = Math.max(1, ...pasos.map((p) => p.n));
  return (
    <div className="space-y-1.5" role="list" aria-label={titulo ?? "Embudo"}>
      {pasos.map((p, i) => {
        // Ancho mínimo para que se lea aunque el número sea pequeño
        const ancho = 28 + (72 * p.n) / max;
        const anterior = i > 0 ? pasos[i - 1].n : null;
        const paso = anterior ? Math.round((p.n / anterior) * 100) : null;
        return (
          <div key={p.t} role="listitem">
            {i > 0 && (
              <div className="flex justify-center py-0.5 text-[11px] text-texto-3">
                ↓ {paso === null ? "—" : `${paso} %`} pasa a «{p.t}»
              </div>
            )}
            <div
              // 26 oct 2026: con un mínimo de 13rem se lee el nombre en el móvil (antes, «C.» en vez de «Contactados»)
              className="mx-auto flex min-w-[13rem] max-w-full items-center justify-between gap-3 rounded-xl px-8 py-2.5 text-white shadow-sm transition-[width]"
              style={{ width: `${ancho}%`, background: COLORES[i % COLORES.length], clipPath: "polygon(0 0, 100% 0, 98% 100%, 2% 100%)" }}
              title={p.d}
            >
              <span className="truncate text-sm font-medium">{p.t}</span>
              <span className="text-lg font-semibold tabular-nums">{p.n.toLocaleString("es-ES")}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
