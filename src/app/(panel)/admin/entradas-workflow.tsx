"use client";

import { FlaskConical, RefreshCw, Square, Undo2, X, Zap } from "lucide-react";
import { useAccion } from "@/components/acciones-lead";
import { confirmar } from "@/components/dialogos";
import type { ResumenWorkflow } from "@/lib/workflows-motor";
import { coincidenTexto } from "@/lib/workflows-vista";
import { borrarWorkflow, crearWorkflowDePrueba, devolverAHoy, pararWorkflow, pasarWorkflowAReal, reintentarEjecuciones } from "./acciones";

// Workflows, 4a-1 (Cristian 7 nov 2026): en la tarjeta de cada Entrada, el botón
// «Probar como workflow» y la línea «Workflow en prueba: 18 de 18 leads coinciden» (modo prueba: no llama a GHL).
export type WorkflowVista = { id: string; modo: string; resumen: ResumenWorkflow; diferencias: { quien: string; lista: string[] }[] };

export function LineaWorkflow({ entradaId, workflow, puedeProbar }: { entradaId: string; workflow: WorkflowVista | null; puedeProbar: boolean }) {
  const { pendiente, ejecutar } = useAccion();
  if (!workflow) {
    if (!puedeProbar) return null;
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-borde px-3 py-2 text-sm text-texto-2">
        <span className="min-w-0 flex-1">Probar esta Entrada con un workflow: calcula lo mismo que «Qué hacer en GHL», <b>sin tocar GHL</b>, y lo compara.</span>
        <button type="button" className="btn-secundario text-xs" disabled={pendiente} onClick={() => ejecutar(() => crearWorkflowDePrueba(entradaId), "Workflow en prueba creado")}>
          <FlaskConical className="h-3.5 w-3.5" /> Probar como workflow
        </button>
      </div>
    );
  }
  const r = workflow.resumen;
  // 4a-2 (Cristian, 7 nov): en real, el workflow manda a GHL en lugar de «Qué hacer en GHL»
  if (workflow.modo === "real")
    return (
      <div className={`mt-3 rounded-xl px-3 py-2 text-sm ${r.errores ? "bg-mal-suave text-mal" : "bg-ok-suave text-ok"}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="min-w-0 flex-1">
            <Zap className="mr-1 inline h-4 w-4" />
            <b>Lo manda su workflow</b> (en lugar de «Qué hacer en GHL»)
            {r.esperando ? ` · ${r.esperando} esperando` : ""}
            {r.errores ? ` · ${r.errores} con error` : ""}
          </span>
          {r.errores > 0 && (
            <button type="button" className="btn-secundario text-xs" disabled={pendiente} onClick={() => ejecutar(() => reintentarEjecuciones(workflow.id), "Se reintentan en la próxima lectura (menos de 1 min)")}>
              <RefreshCw className="h-3.5 w-3.5" /> Reintentar
            </button>
          )}
          <button
            type="button"
            className="btn-secundario text-xs"
            disabled={pendiente}
            onClick={() =>
              void confirmar("¿Volver a lo de hoy? «Qué hacer en GHL» de la Entrada vuelve a mandar y el workflow se para. Lo que estaba esperando lo manda el camino de hoy en la próxima lectura.").then(
                (ok) => ok && ejecutar(() => devolverAHoy(workflow.id), "Vuelve a mandar «Qué hacer en GHL»")
              )
            }
          >
            <Undo2 className="h-3.5 w-3.5" /> Volver a lo de hoy
          </button>
        </div>
      </div>
    );
  const terminados = r.coinciden + r.no_coinciden;
  const bien = terminados > 0 && r.no_coinciden === 0;
  return (
    <div className={`mt-3 rounded-xl px-3 py-2 text-sm ${r.no_coinciden || r.errores ? "bg-mal-suave text-mal" : "bg-primario-suave text-texto"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1">
          <FlaskConical className="mr-1 inline h-4 w-4" />
          <b>Workflow en prueba:</b>{" "}
          {terminados ? <>{coincidenTexto(r.coinciden, terminados, "lead")}{bien ? " ✓" : ""}</> : "esperando el primer lead"}
          {r.esperando ? ` · ${r.esperando} esperando` : ""}
          {r.errores ? ` · ${r.errores} con error` : ""}
        </span>
        {r.errores > 0 && (
          <button type="button" className="btn-secundario text-xs" disabled={pendiente} onClick={() => ejecutar(() => reintentarEjecuciones(workflow.id), "Se reintentan en la próxima lectura (menos de 1 min)")}>
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </button>
        )}
        <button
          type="button"
          className="btn-secundario text-xs"
          disabled={pendiente}
          onClick={() =>
            void confirmar(
              `¿Pasar a real? Desde ahora el workflow manda a GHL y «Qué hacer en GHL» de la Entrada se apaga. Criterio acordado: 3 días en prueba, 20 leads de registro, todos los de agenda y 0 diferencias (ahora: ${coincidenTexto(r.coinciden, terminados)}). Se puede volver a lo de hoy cuando quieras.`
            ).then((ok) => ok && ejecutar(() => pasarWorkflowAReal(workflow.id), "El workflow ya manda a GHL"))
          }
        >
          <Zap className="h-3.5 w-3.5" /> Pasar a real
        </button>
        <button
          type="button"
          className="btn-secundario text-xs"
          disabled={pendiente}
          onClick={() => void confirmar("¿Parar la prueba? El workflow deja de recibir leads. «Qué hacer en GHL» sigue mandando como siempre.").then((ok) => ok && ejecutar(() => pararWorkflow(workflow.id), "Prueba parada"))}
        >
          <Square className="h-3.5 w-3.5" /> Parar la prueba
        </button>
      </div>
      {workflow.diferencias.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold">Ver en qué no coincide ({r.no_coinciden})</summary>
          <ul className="mt-1.5 space-y-1.5 text-xs">
            {workflow.diferencias.map((d, i) => (
              <li key={i} className="break-words">
                <b>{d.quien}:</b> {d.lista.join(" · ")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// Rediseño de Workflows (Cristian, 11 nov 2026): la «×» de cada workflow. Pregunta 2 veces, con la ventana de la app
// (nunca la del navegador); los leads que esperaban se cancelan. Si era el elegido, la página
// enseña el primero de la lista (page.tsx: `?wf=` que ya no existe → el primero).
export function BorrarWorkflow({ id, nombre, esperando }: { id: string; nombre: string; esperando: number }) {
  const { pendiente, error, ejecutar } = useAccion();
  const borrar = async () => {
    if (!(await confirmar(`¿Eliminar «${nombre}»? Dejará de funcionar y se quitará de la lista.`, { boton: "Sí, eliminar" }))) return;
    const espera = esperando ? ` y sus ${esperando} ${esperando === 1 ? "lead en espera no seguirá" : "leads en espera no seguirán"}` : "";
    // La 2.ª también lleva «Eliminar» en la pregunta: así dialogos.tsx la pinta en rojo (peligroso)
    if (!(await confirmar(`¿Eliminar para siempre? No se puede deshacer: «${nombre}» se borra${espera}.`, { boton: "Eliminar para siempre" }))) return;
    ejecutar(() => borrarWorkflow(id), "Workflow eliminado");
  };
  return (
    <span className="flex items-center gap-1">
      <button type="button" className="btn-secundario px-1.5 py-1 text-texto-2 hover:text-mal" aria-label={`Eliminar ${nombre}`} title="Eliminar el workflow" disabled={pendiente} onClick={() => void borrar()}>
        <X className="h-3.5 w-3.5" />
      </button>
      {error && <span className="text-xs text-mal">{error}</span>}
    </span>
  );
}
