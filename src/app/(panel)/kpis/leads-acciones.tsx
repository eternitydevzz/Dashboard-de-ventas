"use client";

import Papa from "papaparse";
import { Download } from "lucide-react";
import { MARCA, type LeadVista } from "@/lib/leads-vista";
import { ETIQUETA_ESTADO_CALLER, nombrePais } from "@/lib/formato";
import { ETIQUETA_OFERTA, PREGUNTAS_BIBLIOTECA, preguntaCanonica, respuestasBiblioteca, type Oferta } from "@/lib/oferta";
import { PREFIJO_ETIQUETA } from "@/lib/canal";
import { RepartirLeads } from "@/components/repartir-leads";

type Nombrado = { id: string; nombre: string };
// Títulos cortos de las 6 preguntas de la Biblioteca (los usa también la tabla de leads.tsx)
export const CORTO: Record<string, string> = { situacion: "Situación", experiencia: "Experiencia con AI", objetivo: "Objetivo 90 días", tiempo: "Tiempo / semana", inversion: "Puede invertir", inicio: "Cuándo empezar" };
const DE_BIBLIOTECA = new Set(PREGUNTAS_BIBLIOTECA.map((p) => p.texto));
const si = (l: LeadVista, m: number) => ((l.marcas & m) === m ? "Sí" : "No");

// 1c · L6 (Cristian, 26 oct 2026): sobre lo que se ve en la pestaña «Leads» (fuente, periodo, país, sin caller y búsqueda):
// «Repartir lo que ves» reparte exactamente esos leads (también los de las 🔗; el reparto por pipeline del CRM no los
// coge) y «Exportar CSV» los descarga con todas sus columnas.
export function AccionesLeads({ leads, pipelines, etapas, gente, fuente, callers, repartir = "Repartir lo que ves" }: { leads: LeadVista[]; pipelines: Nombrado[]; etapas: Nombrado[]; gente: Nombrado[]; fuente: string | null; callers: Nombrado[]; repartir?: string }) {
  const nombre = new Map([...pipelines, ...etapas, ...gente].map((x) => [x.id, x.nombre]));
  const n = (id: string | null) => (id ? nombre.get(id) ?? "" : "");

  function exportar() {
    const filas = leads.map((l) => {
      const r = respuestasBiblioteca(l.respuestas);
      const enFuente = fuente && l.pipelineId !== fuente ? l.tarjetas.find((t) => t.pipelineId === fuente) : null;
      return {
        Nombre: l.nombre,
        Teléfono: l.telefono ?? "",
        País: nombrePais(l.pais),
        Email: l.email ?? "",
        Pipeline: n(l.pipelineId),
        Columna: n(l.etapaId),
        ...(fuente ? { [`Columna en «${n(fuente)}»`]: enFuente ? n(enFuente.etapaId) : n(l.etapaId) } : {}),
        "También en (🔗)": l.tarjetas.map((t) => n(t.pipelineId)).join(", "),
        Caller: n(l.callerId),
        Closer: n(l.closerId),
        Estado: ETIQUETA_ESTADO_CALLER[l.estado] ?? l.estado,
        Estrellas: l.estrellas ?? "",
        Oferta: l.oferta ? ETIQUETA_OFERTA[l.oferta as Oferta] ?? l.oferta : "",
        Canal: l.etiquetas.find((e) => e.startsWith(PREFIJO_ETIQUETA))?.slice(PREFIJO_ETIQUETA.length) ?? "",
        Origen: l.fuente ?? "",
        Alta: new Date(l.alta).toISOString().slice(0, 10),
        Contactado: si(l, MARCA.contactado),
        Contesta: si(l, MARCA.contesta),
        Agendó: si(l, MARCA.agendado),
        Asistió: si(l, MARCA.asistio),
        Compró: si(l, MARCA.compro),
        ...Object.fromEntries(PREGUNTAS_BIBLIOTECA.map((p) => [CORTO[p.clave], r[p.clave]])),
        "Otras respuestas": l.respuestas.filter((x) => x.respuesta && !DE_BIBLIOTECA.has(preguntaCanonica(x.pregunta))).map((x) => `${x.pregunta}: ${x.respuesta}`).join(" | "),
        Etiquetas: l.etiquetas.join(", "),
      };
    });
    // Con BOM para que Excel lea bien las tildes (como «Exportar» del CRM)
    const csv = "﻿" + Papa.unparse(filas);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-secundario" onClick={exportar} disabled={!leads.length} title="Descarga los leads que ves, con todas sus columnas">
        <Download className="h-4 w-4" /> Exportar CSV ({leads.length.toLocaleString("es-ES")})
      </button>
      {leads.length > 0 && <RepartirLeads callers={callers} fijo={{ leadIds: leads.map((l) => l.id) }} etiqueta={repartir} />}
    </div>
  );
}
