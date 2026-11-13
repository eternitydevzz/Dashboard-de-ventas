import "server-only";
import { enMemoria, UN_MINUTO } from "@/lib/memoria";
import { db, todas, equipo, conBajas } from "@/lib/datos";
import { ASISTIDAS, cargarBase } from "@/lib/metricas";
import { CAMPOS_LEAD, compactarLeads, marcasEmbudo, type LeadDeLaBase, type Tarjeta } from "@/lib/leads-vista";
import type { Proyecto } from "@/lib/tipos";
import { after } from "next/server";
import { esDeBiblioteca } from "@/lib/oferta";
import { recalcularOfertas } from "@/lib/biblioteca-datos";

// 1c (Cristian, 26 oct 2026): todos los leads del proyecto para la pestaña «Leads» de KPIs, compactos (lib/leads-vista.ts).
// Solo se pide al abrir la pestaña (no con la precarga del menú) y se guarda 1 minuto compartido entre CEO y directores
// (lib/memoria.ts, como «Por persona»). Medido el 26 oct: leer los 4.688 leads, ~1,5 s; las 822 tarjetas 🔗, ~0,6 s.
// Llamadas, citas y ventas salen de cargarBase, que ya usan «Por persona» y el Funnel (sin consultas nuevas si está en memoria).
export function cargarLeadsKpis(proyecto: Proyecto) {
  return enMemoria(`leads-kpis:${proyecto.id}`, UN_MINUTO, () => cargarDeLaBase(proyecto));
}

async function cargarDeLaBase(proyecto: Proyecto) {
  const pid = proyecto.id;
  const [leads, tarjetas, pipelines, etapas, gente, base] = await Promise.all([
    todas<LeadDeLaBase>((a, b) => db().from("leads").select(CAMPOS_LEAD).eq("proyecto_id", pid).order("id").range(a, b)),
    todas<Tarjeta>((a, b) => db().from("tarjetas_extra").select("lead_id, pipeline_id, etapa_id").eq("proyecto_id", pid).order("id").range(a, b)),
    // Solo los pipelines de origen: «Callers» y «Closers» no son el pipeline de ningún lead
    db().from("pipelines").select("id, nombre").eq("proyecto_id", pid).eq("tipo", "normal").order("orden").then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
    db().from("etapas").select("id, nombre, pipeline_id, color, orden, pipelines!inner(proyecto_id, tipo)").eq("pipelines.proyecto_id", pid).eq("pipelines.tipo", "normal").order("orden").then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return (data ?? []).map((e) => ({ id: e.id as string, nombre: e.nombre as string, pipeline_id: e.pipeline_id as string, color: e.color as string }));
    }),
    equipo(pid),
    cargarBase(proyecto),
  ]);
  // Lo que hacía la tabla de la Biblioteca (quitada el 26 oct): repasar después de responder las ofertas de los
  // leads del formulario por si cambió la regla. Los leads ya guardan su oferta al entrar (leads.ts).
  const delFormulario = leads.filter((l) => esDeBiblioteca(l)).map((l) => ({ id: l.id, etiquetas: l.etiquetas, respuestas: l.respuestas, fuente: l.fuente, oferta: l.oferta }));
  after(async () => {
    try {
      await recalcularOfertas(delFormulario);
    } catch (e) {
      console.error("[leads-kpis] repasar ofertas", e);
    }
  });
  // Quien ya no está sigue saliendo como caller o closer de sus leads, con «(baja)» (como en el resto de la app)
  const personas = await conBajas(gente, leads.flatMap((l) => [l.caller_id, l.closer_id]));
  return compactarLeads({
    leads,
    tarjetas,
    pipelines,
    etapas,
    gente: personas.map((p) => ({ id: p.id, nombre: p.nombre, rol: p.rol, ...("baja" in p && p.baja ? { baja: true } : {}) })),
    marcas: marcasEmbudo(base.actividades, base.citas, base.ventas, ASISTIDAS),
  });
}
