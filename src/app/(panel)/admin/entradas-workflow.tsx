"use client";

import { FlaskConical, RefreshCw, Square } from "lucide-react";
import { useAccion } from "@/components/acciones-lead";
import { confirmar } from "@/components/dialogos";
import type { ResumenWorkflow } from "@/lib/workflows-motor";
import { crearWorkflowDePrueba, pararWorkflow, reintentarEjecuciones } from "./acciones";

// Workflows, 4a-1 (docs/plan-workflows.md, Cristian 7 nov 2026): en la tarjeta de cada Entrada, el botón
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
  const terminados = r.coinciden + r.no_coinciden;
  const bien = terminados > 0 && r.no_coinciden === 0;
  return (
    <div className={`mt-3 rounded-xl px-3 py-2 text-sm ${r.no_coinciden || r.errores ? "bg-mal-suave text-mal" : "bg-primario-suave text-texto"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1">
          <FlaskConical className="mr-1 inline h-4 w-4" />
          <b>Workflow en prueba:</b>{" "}
          {terminados ? <>{r.coinciden} de {terminados} {terminados === 1 ? "lead coincide" : "leads coinciden"}{bien ? " ✓" : ""}</> : "esperando el primer lead"}
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
