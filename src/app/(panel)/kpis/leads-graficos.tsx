"use client";

import { useMemo, useState } from "react";
import { preguntasDe, repartir, respuestasA, serieLeads } from "@/lib/leads-cifras";
import { GraficoLeads } from "@/components/grafico-leads";
import type { LeadVista } from "@/lib/leads-vista";
import { ETIQUETA_ESTADO_CALLER, SIN_PAIS, nombrePais, pct } from "@/lib/formato";
import { ETIQUETA_OFERTA, preguntaCanonica, type Oferta } from "@/lib/oferta";
import { DE_BIBLIOTECA } from "./leads-acciones";
import type { EscalonOferta, resumenBiblioteca } from "@/lib/biblioteca";
import { PREFIJO_ETIQUETA } from "@/lib/canal";
import { Seccion } from "@/components/ui";
import { Barras } from "@/components/barras";
import { AnilloPartes } from "@/components/anillo-partes";
import { Desplegable } from "@/components/eleccion";

type Nombrado = { id: string; nombre: string };

// 1c · L4 (Cristian, 26 oct 2026): los gráficos de la pestaña «Leads», de lo elegido arriba (fuente, periodo, país…)
export function GraficosLeads({ leads, formulario, ofertas, pipelines, etapas, gente, fuente, zona, desde, hasta, embudo, mapa }: { leads: LeadVista[]; formulario: ReturnType<typeof resumenBiblioteca>; ofertas: EscalonOferta[]; pipelines: Nombrado[]; etapas: Nombrado[]; gente: Nombrado[]; fuente: string | null; zona: string; desde: number | null; hasta: number | null; embudo: React.ReactNode; mapa: React.ReactNode }) {
  const nombre = useMemo(() => {
    const m = new Map([...pipelines, ...etapas, ...gente].map((x) => [x.id, x.nombre]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : null);
  }, [pipelines, etapas, gente]);
  const serie = useMemo(() => serieLeads(leads, zona, desde, hasta, (l) => nombre(l.pipelineId) ?? "Sin pipeline"), [leads, zona, desde, hasta, nombre]);
  const columna = (l: LeadVista) => (!fuente ? null : l.pipelineId === fuente ? nombre(l.etapaId) : nombre(l.tarjetas.find((t) => t.pipelineId === fuente)?.etapaId ?? null));
  const canal = (l: LeadVista) => l.etiquetas.find((e) => e.startsWith(PREFIJO_ETIQUETA))?.slice(PREFIJO_ETIQUETA.length) ?? null;
  const barras = (lista: { t: string; n: number; pct: number }[], max = 10) => lista.slice(0, max);

  // Formularios: las 6 de la Biblioteca van en su bloque (con `formulario`); aquí, el resto, eligiendo la pregunta
  const preguntas = useMemo(() => preguntasDe(leads, preguntaCanonica), [leads]);
  const otras = preguntas.filter((p) => !DE_BIBLIOTECA.has(p.pregunta));
  const [elegida, setElegida] = useState("");
  const pregunta = otras.some((p) => p.pregunta === elegida) ? elegida : otras[0]?.pregunta ?? "";

  return (
    <div className="space-y-5">
      {/* El mapa, a todo el ancho (lleva su ranking al lado), antes del embudo (Cristian, 26 oct) */}
      {mapa}
      {/* Embudo y leads por día lado a lado en una sola tarjeta (Cristian, 26 oct); en móvil, uno debajo del otro */}
      <Seccion>
        <div className="grid gap-5 lg:grid-cols-2 lg:gap-0">
          <div className="min-w-0 lg:pr-6">
            <h2 className="titulo-seccion mb-4">Embudo</h2>
            {embudo}
          </div>
          <div className="min-w-0 border-t border-borde pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <h2 className="titulo-seccion mb-4">{serie.porHoras ? "Leads por hora de alta" : "Leads por día de alta"}</h2>
            <GraficoLeads puntos={serie.puntos} porHoras={serie.porHoras} />
          </div>
        </div>
      </Seccion>

      <Seccion titulo="De dónde vienen">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {!fuente && <AnilloPartes titulo="Por fuente" partes={repartir(leads, (l) => nombre(l.pipelineId), "Sin pipeline")} />}
          <AnilloPartes titulo="Por país" partes={repartir(leads, (l) => nombrePais(l.pais), SIN_PAIS)} />
          <AnilloPartes titulo="Canal de la cita" partes={repartir(leads.filter(canal), canal)} />
        </div>
      </Seccion>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {fuente && (
          <Seccion titulo="Por columna">
            <Barras titulo={`En «${nombre(fuente)}»`} filas={barras(repartir(leads, columna, "—"), 12)} numero />
          </Seccion>
        )}
        <Seccion titulo="Estado de la llamada">
          <Barras titulo="Según el caller" filas={barras(repartir(leads, (l) => ETIQUETA_ESTADO_CALLER[l.estado] ?? l.estado))} numero />
        </Seccion>
        <Seccion titulo="Por caller">
          <Barras titulo="Leads asignados" filas={barras(repartir(leads, (l) => nombre(l.callerId), "Sin caller"), 12)} numero />
        </Seccion>
        <Seccion titulo="Oferta">
          <Barras titulo="Según el formulario de la Biblioteca" filas={barras(repartir(leads, (l) => (l.oferta ? ETIQUETA_OFERTA[l.oferta as Oferta] ?? l.oferta : null), "Sin oferta"))} numero />
        </Seccion>
      </div>

      {/* Lo que tenía la pestaña «Biblioteca» (quitada el 26 oct, Cristian): el formulario con nombres cortos, las
          opciones marcadas y sus notas, y la escalera de ofertas. % sobre quien rellenó el formulario. */}
      {formulario.total > 0 && (
        <Seccion titulo={`Formulario de la Biblioteca (${formulario.total.toLocaleString("es-ES")} lo rellenaron)`}>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-5">
              <h3 className="text-sm font-semibold">¿Quiénes son?</h3>
              <Barras titulo="Situación" filas={formulario.situacion} numero />
              <Barras titulo="Experiencia con AI" filas={formulario.experiencia} numero />
            </div>
            <div className="space-y-5">
              <h3 className="text-sm font-semibold">¿Qué quieren?</h3>
              <Barras titulo="Objetivo a 90 días" filas={formulario.objetivo} marcadas={["Llegar a 5.000 $/mes", "Cerrar su primer cliente en USA"]} numero />
              <p className="-mt-3 text-xs text-texto-3">{pct(formulario.buscaIngresos)} busca ingresos (las dos barras marcadas).</p>
              <Barras titulo="¿Cuándo quieren empezar?" filas={formulario.inicio} numero />
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold">¿Pueden invertir?</h3>
              <Barras titulo="Si encuentran el programa correcto" filas={formulario.inversion} marcadas={["Sí, ahora"]} numero />
              <p className="mt-2 text-xs text-texto-3">El {pct(formulario.sinInversion)} restante no respondió.</p>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold">¿Cuánto tiempo tienen?</h3>
              <Barras titulo="Por semana" filas={formulario.tiempo} numero />
              <p className="mt-2 text-xs text-texto-3">El programa pide mínimo 4 h al día. Solo el {pct(formulario.masDe10h)} dice tener más de 10 h a la semana.</p>
            </div>
          </div>
        </Seccion>
      )}
      {formulario.total > 0 && (
        <Seccion titulo="Escalera de ofertas">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {ofertas.map((o) => {
              const dato = formulario.escalera[o.clave];
              return (
                <div key={o.clave} className="rounded-xl border border-borde p-4">
                  <div className="text-sm font-semibold">{o.nombre}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">{o.precio}</div>
                  <div className="mt-3 text-sm text-texto-2">{o.quien}{o.clave === "dfy" ? `. Primero los ${formulario.escalera.dfy.inviertenYa} que invierten ya` : ""}</div>
                  <div className="mt-1 text-xs text-texto-3">{pct(dato.pct)} · {dato.n.toLocaleString("es-ES")} personas</div>
                </div>
              );
            })}
          </div>
        </Seccion>
      )}

      {otras.length > 0 && (
        <Seccion
          titulo="Otros formularios"
          acciones={
            <Desplegable aria-label="Ver respuestas de" value={pregunta} onChange={(e) => setElegida(e.target.value)} className="campo w-auto max-w-md">
              {otras.map((p) => <option key={p.pregunta} value={p.pregunta}>{`${p.pregunta} (${p.n})`}</option>)}
            </Desplegable>
          }
        >
          {pregunta && (() => {
            const r = respuestasA(leads, pregunta, preguntaCanonica);
            return <Barras titulo={`${pregunta} · ${r.total.toLocaleString("es-ES")} respondieron`} filas={r.filas} numero />;
          })()}
        </Seccion>
      )}
    </div>
  );
}
