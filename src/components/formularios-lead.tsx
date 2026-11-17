import type { EnvioFormulario } from "@/lib/formularios-lead";

// Fase B (17 nov): cada formulario que llegó del lead, del más nuevo al más viejo, con sus respuestas tal cual.
// Sin estado ni imports de servidor: lo usan la ficha (servidor) y el popup (cliente). `fecha` llega ya en la zona del proyecto.
export function FormulariosLead({ envios }: { envios: EnvioFormulario[] }) {
  if (!envios.length) return <p className="text-sm text-texto-3">No ha llegado ningún formulario de este lead.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {envios.map((e, i) => (
        <li key={e.id}>
          <details open={i === 0} className="rounded-lg border border-borde bg-panel-2">
            <summary className="cursor-pointer px-3 py-2">
              <span className="font-medium">{e.fecha}</span>
              <span className="text-texto-3"> · {e.entrada}</span>
              {!e.vaciado && <span className="text-texto-3"> · {e.respuestas.length} {e.respuestas.length === 1 ? "respuesta" : "respuestas"}</span>}
            </summary>
            <div className="border-t border-borde px-3 py-2">
              {e.vaciado ? (
                <p className="text-texto-3">Contenido borrado (más de 12 meses)</p>
              ) : e.respuestas.length ? (
                <dl className="space-y-2">
                  {e.respuestas.map((r, j) => (
                    <div key={`${r.pregunta}-${j}`}>
                      <dt className="text-[11px] text-texto-3">{r.pregunta}</dt>
                      <dd>{r.respuesta || "—"}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-texto-3">Este envío no trae respuestas de formulario.</p>
              )}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
