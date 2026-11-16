"use client";

import { useState } from "react";
import { Download, Tag, Trash2, X } from "lucide-react";
import { asignarLeads, borrarLeads, cambiarEtiquetas, moverLeads } from "./acciones";
import { Desplegable } from "@/components/eleccion";
import { confirmar } from "@/components/dialogos";
import { exigirOk } from "@/lib/resultado-cliente";
import { csvExcel } from "@/lib/csv-excel";
import { ETIQUETA_ESTADO_CALLER, nombrePais } from "@/lib/formato";
import { CAMPOS_FICHA } from "@/lib/ficha-cualificacion";
import { fichasParaExportar } from "@/app/(panel)/caller/ficha-acciones";
import type { LeadTarjeta } from "./tablero";

type Persona = { id: string; nombre: string };
export type DestinoMasivo = { pipeline: string; etapas: { id: string; nombre: string }[] };

// Acciones masivas del CRM (Fase 4, como GHL): con leads marcados, asignar caller o closer, mover de columna o de
// pipeline, etiquetas y exportar a CSV (CEO y directores); borrar, solo el CEO.
export function BarraMasiva({
  seleccion,
  leads,
  callers,
  closers,
  destinos,
  nombrePorId,
  etapaNombre,
  ejecutar,
  limpiar,
  ceo,
  zona = "UTC",
}: {
  seleccion: Set<string>;
  leads: LeadTarjeta[];
  callers: Persona[];
  closers: Persona[];
  destinos: DestinoMasivo[];
  nombrePorId: Record<string, string>;
  etapaNombre: Record<string, string>;
  ejecutar: (fn: () => Promise<unknown>, mensaje?: string, deshacer?: () => unknown) => void;
  limpiar: () => void;
  ceo: boolean; // borrar en masa, solo el CEO (Cristian, 12 oct)
  zona?: string; // S1-21: zona del proyecto para «Entró»
}) {
  const [caller, setCaller] = useState("");
  const [closer, setCloser] = useState("");
  const [destino, setDestino] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const ids = [...seleccion];
  const n = ids.length;
  const de = (x: string) => (x === "__ninguno" ? null : x);
  // F1b (Deshacer, botón y Ctrl+Z): lo de antes sale de los leads marcados que hay en pantalla, agrupado por valor
  const marcados = leads.filter((l) => seleccion.has(l.id));
  const agrupar = (valores: (l: LeadTarjeta) => string[]) => {
    const g = new Map<string, string[]>();
    for (const l of marcados) for (const v of valores(l)) g.set(v, [...(g.get(v) ?? []), l.id]);
    return g;
  };
  const igual = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  function asignar() {
    const callerAntes = caller ? agrupar((l) => [l.caller_id ?? ""]) : null;
    const closerAntes = closer ? agrupar((l) => [l.closer_id ?? ""]) : null;
    ejecutar(
      async () => {
        await exigirOk(asignarLeads(ids, caller ? de(caller) : undefined, closer ? de(closer) : undefined));
        setCaller("");
        setCloser("");
      },
      `${n} leads asignados`,
      () => ejecutar(async () => {
        for (const [c, grupo] of callerAntes ?? []) await exigirOk(asignarLeads(grupo, c || null, undefined));
        for (const [c, grupo] of closerAntes ?? []) await exigirOk(asignarLeads(grupo, undefined, c || null));
      }, `${n} leads con su caller/closer de antes`)
    );
  }

  // Añadir: deshacer la quita a los que no la tenían. Quitar: se la vuelve a poner (como estaba escrita) a quien la tenía.
  function etiquetar(anadir: boolean) {
    const t = etiqueta.trim();
    const antes = anadir ? agrupar((l) => (l.etiquetas.some((e) => igual(e, t)) ? [] : [t])) : agrupar((l) => [...new Set(l.etiquetas.filter((e) => igual(e, t)))]);
    ejecutar(
      async () => {
        await exigirOk(cambiarEtiquetas(ids, anadir ? [etiqueta] : [], anadir ? [] : [etiqueta]));
        setEtiqueta("");
      },
      `Etiqueta «${t}» ${anadir ? "añadida" : "quitada"}`,
      antes.size ? () => ejecutar(async () => { for (const [e, grupo] of antes) await exigirOk(cambiarEtiquetas(grupo, anadir ? [] : [e], anadir ? [e] : [])); }, "Etiquetas como estaban") : undefined
    );
  }

  async function exportar() {
    // C6: con la ficha de cualificación del caller (columnas «Cualificación · …»)
    let fichas: Awaited<ReturnType<typeof fichasParaExportar>> = {};
    try {
      fichas = await exigirOk(fichasParaExportar(marcados.map((l) => l.id)));
    } catch {
      fichas = {}; // sin fichas, se exporta lo de siempre
    }
    const filas = marcados.map((l) => ({
      Nombre: l.nombre,
      Apellido: l.apellido,
      Email: l.email ?? "",
      Teléfono: l.telefono ?? "",
      País: nombrePais(l.pais),
      Columna: l.etapa_id ? etapaNombre[l.etapa_id] ?? "" : "",
      Caller: l.caller_id ? nombrePorId[l.caller_id] ?? "" : "",
      Closer: l.closer_id ? nombrePorId[l.closer_id] ?? "" : "",
      Estado: ETIQUETA_ESTADO_CALLER[l.estado_caller as keyof typeof ETIQUETA_ESTADO_CALLER] ?? l.estado_caller,
      Etiquetas: l.etiquetas.join(", "),
      Entró: new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date(l.creado_en)), // S1-21: día en la zona del proyecto
      ...Object.fromEntries(CAMPOS_FICHA.map((c) => [`Cualificación · ${c.t}`, (fichas as Record<string, Record<string, string>>)[l.id]?.[c.k] ?? ""])),
    }));
    const csv = csvExcel(Object.keys(filas[0] ?? {}), filas.map(Object.values)); // S1-4: neutraliza fórmulas (nombres de formularios públicos)
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="tarjeta flex flex-wrap items-center gap-1.5 border-primario/40 p-2 text-sm">
      <span className="font-semibold">{n} seleccionados</span>
      <button className="rounded-md p-1 text-texto-3 hover:bg-panel-2 hover:text-texto" onClick={limpiar} title="Quitar la selección" aria-label="Quitar la selección">
        <X className="h-4 w-4" />
      </button>
      <Desplegable value={caller} onChange={(e) => setCaller(e.target.value)} className="campo w-auto py-1.5 text-xs" aria-label="Caller">
        <option value="">Caller…</option>
        <option value="__ninguno">Quitar caller</option>
        {callers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </Desplegable>
      <Desplegable value={closer} onChange={(e) => setCloser(e.target.value)} className="campo w-auto py-1.5 text-xs" aria-label="Closer">
        <option value="">Closer…</option>
        <option value="__ninguno">Quitar closer</option>
        {closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </Desplegable>
      <button
        className="btn-secundario px-2.5 py-1.5 text-xs"
        disabled={!caller && !closer}
        onClick={asignar}
      >
        Asignar
      </button>
      <Desplegable value={destino} onChange={(e) => setDestino(e.target.value)} className="campo w-auto py-1.5 text-xs" aria-label="Mover a">
        <option value="">Mover a…</option>
        {destinos.flatMap((d) => d.etapas.map((e) => <option key={e.id} value={e.id}>{`${d.pipeline} → ${e.nombre}`}</option>))}
      </Desplegable>
      <button
        className="btn-secundario px-2.5 py-1.5 text-xs"
        disabled={!destino}
        onClick={() => {
          // A3b-02: Deshacer = cada lead vuelve a su columna de antes con la misma acción (los sin columna se quedan)
          const antes = new Map<string, string[]>();
          for (const l of leads) if (seleccion.has(l.id) && l.etapa_id) antes.set(l.etapa_id, [...(antes.get(l.etapa_id) ?? []), l.id]);
          ejecutar(
            async () => {
              await exigirOk(moverLeads(ids, destino));
              setDestino("");
              limpiar();
            },
            `${n} leads movidos`,
            antes.size ? () => ejecutar(async () => { for (const [etapa, grupo] of antes) await exigirOk(moverLeads(grupo, etapa)); }, `${n} leads vueltos a su columna`) : undefined
          );
        }}
      >
        Mover
      </button>
      <div className="relative">
        <Tag className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-texto-3" />
        <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Etiqueta" className="campo w-28 py-1.5 pl-8 text-xs" aria-label="Etiqueta" />
      </div>
      <button className="btn-secundario px-2.5 py-1.5 text-xs" disabled={!etiqueta.trim()} onClick={() => etiquetar(true)}>
        Añadir
      </button>
      <button className="btn-secundario px-2.5 py-1.5 text-xs" disabled={!etiqueta.trim()} onClick={() => etiquetar(false)}>
        Quitar
      </button>
      <button className="btn-secundario px-2.5 py-1.5 text-xs" onClick={() => void exportar()}>
        <Download className="h-4 w-4" /> Exportar
      </button>
      {ceo && <button
        className="btn-secundario px-2.5 py-1.5 text-xs text-mal hover:border-mal"
        onClick={() => {
          void confirmar(`¿Borrar ${n} leads? Los que tengan citas o ventas no se borran (se borran uno a uno desde su ficha). No se puede deshacer.`).then((ok) => {
            if (!ok) return;
            ejecutar(async () => {
              const r = (await exigirOk(borrarLeads(ids))) as { borrados: number; saltados: number };
              limpiar();
              if (r.saltados) throw new Error(`Borrados ${r.borrados}. ${r.saltados} no se han borrado porque tienen citas o ventas.`);
            }, `${n} leads borrados`);
          });
        }}
      >
        <Trash2 className="h-4 w-4" /> Borrar
      </button>}
    </div>
  );
}
