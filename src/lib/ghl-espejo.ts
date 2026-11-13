import "server-only";
// Espejo de pipelines de GHL (Cristian, 17 oct 2026). En los pipelines de la lista, la app hace lo mismo que GHL:
// · las columnas: las de GHL, en su orden (las que solo tiene la app, como «Cerrados», van al final; no se borra nada)
// · cada oportunidad: su lead está en ese pipeline, en la columna con el mismo nombre que en GHL
// · si GHL mueve la oportunidad, la app mueve la tarjeta. Solo cuando cambia en GHL (tabla ghl_espejo): lo que el
//   equipo mueva en la app no se deshace.
// Se decidió así porque la etiqueta no basta: los de «Regalo 1» llegaban solo con la etiqueta «regalo 1».
// Solo «2. Webinar 1» (en Biblioteca las columnas de GHL no son las de la app).
import { db } from "@/lib/datos";
import { guardarLeads } from "@/lib/leads";
import { anadirTarjetas, moverTarjeta } from "@/lib/tarjetas";
import { contactoGhl, oportunidadesDePipelineGhl, pipelinesGhl } from "@/lib/ghl";
import { leadDeContactoGhl } from "@/lib/ghl-lead";
import { mismoNombre } from "@/lib/formato";
import type { Proyecto } from "@/lib/tipos";

type Fetch = typeof fetch;
const PIPELINES_ESPEJO = ["2. Webinar 1"];
const MAX_NUEVOS = 20; // leads nuevos (con su contacto leído de GHL) por lectura; el resto, en la siguiente
export type ResultadoEspejo = { nuevos: number; anadidos: number; movidos: number; columnas: number; avisos: string[]; errores: string[] };

type EtapaApp = { id: string; nombre: string; orden: number };

// Columnas de GHL en la app: crea las que faltan y las pone en el orden de GHL. Devuelve id de GHL → id de la app.
async function igualarColumnas(pipelineId: string, stages: { id: string; name: string }[], r: ResultadoEspejo) {
  const { data, error } = await db().from("etapas").select("id, nombre, orden").eq("pipeline_id", pipelineId);
  if (error) throw new Error(error.message);
  let etapas = (data ?? []) as EtapaApp[];
  const faltan = stages.filter((s) => !etapas.some((e) => mismoNombre(e.nombre, s.name)));
  if (faltan.length) {
    const { data: nuevas, error: e2 } = await db()
      .from("etapas")
      .insert(faltan.map((s, i) => ({ pipeline_id: pipelineId, nombre: s.name.trim(), orden: 1000 + i })))
      .select("id, nombre, orden");
    if (e2) throw new Error(e2.message);
    etapas = [...etapas, ...((nuevas ?? []) as EtapaApp[])];
    r.columnas += faltan.length;
  }
  const deGhl = stages.map((s) => etapas.find((e) => mismoNombre(e.nombre, s.name))!).filter(Boolean);
  const soloApp = etapas.filter((e) => !deGhl.includes(e)).sort((a, b) => a.orden - b.orden);
  const orden = [...deGhl, ...soloApp];
  for (const [i, e] of orden.entries()) if (e.orden !== i) await db().from("etapas").update({ orden: i }).eq("id", e.id);
  return new Map(stages.map((s) => [s.id, etapas.find((e) => mismoNombre(e.nombre, s.name))!.id]));
}

export async function espejoGhl(
  proyecto: Proyecto & { ghl_location_id: string | null },
  token: string,
  campos: Map<string, string>,
  opciones: { fetchImpl?: Fetch } = {}
): Promise<ResultadoEspejo> {
  const { fetchImpl } = opciones;
  const r: ResultadoEspejo = { nuevos: 0, anadidos: 0, movidos: 0, columnas: 0, avisos: [], errores: [] };
  const locationId = proyecto.ghl_location_id;
  if (!locationId) return r;
  // Sin la migración 20261017180000 la tabla no existe: no se hace nada
  const prueba = await db().from("ghl_espejo").select("opp_id").limit(1);
  if (prueba.error) return r;

  const pipesGhl = await pipelinesGhl({ token, locationId, fetchImpl });
  const { data: pipesApp } = await db().from("pipelines").select("id, nombre").eq("proyecto_id", proyecto.id).eq("tipo", "normal");
  for (const nombre of PIPELINES_ESPEJO) {
    const pGhl = pipesGhl.find((p) => mismoNombre(p.name, nombre));
    const pApp = (pipesApp ?? []).find((p) => mismoNombre(p.nombre, nombre));
    if (!pGhl || !pApp) {
      r.avisos.push(`Espejo: el pipeline «${nombre}» no está ${pGhl ? "en la app" : "en GHL"}`);
      continue;
    }
    const columna = await igualarColumnas(pApp.id, pGhl.stages ?? [], r);
    const nombreColumna = new Map((pGhl.stages ?? []).map((s) => [s.id, s.name.trim()]));

    const ops = await oportunidadesDePipelineGhl({ token, locationId, pipelineId: pGhl.id, fetchImpl });
    const vistas = new Map<string, string>();
    for (let i = 0; i < ops.length; i += 200) {
      const { data } = await db().from("ghl_espejo").select("opp_id, etapa_ghl").eq("proyecto_id", proyecto.id).in("opp_id", ops.slice(i, i + 200).map((o) => o.id));
      for (const v of data ?? []) vistas.set(v.opp_id, v.etapa_ghl);
    }
    const cambiadas = ops.filter((o) => o.contactId && o.pipelineStageId && columna.has(o.pipelineStageId) && vistas.get(o.id) !== o.pipelineStageId);
    if (!cambiadas.length) continue;

    // Dónde está cada lead hoy (pipeline principal o tarjeta 🔗 en este pipeline)
    const contactos = [...new Set(cambiadas.map((o) => o.contactId as string))];
    const leads = new Map<string, { id: string; pipeline_id: string | null; etapa_id: string | null }>();
    for (let i = 0; i < contactos.length; i += 200) {
      const { data } = await db().from("leads").select("id, ghl_contact_id, pipeline_id, etapa_id").eq("proyecto_id", proyecto.id).in("ghl_contact_id", contactos.slice(i, i + 200));
      for (const l of data ?? []) leads.set(l.ghl_contact_id as string, l);
    }
    const tarjetas = new Map<string, string | null>();
    const ids = [...leads.values()].map((l) => l.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db().from("tarjetas_extra").select("lead_id, etapa_id").eq("pipeline_id", pApp.id).in("lead_id", ids.slice(i, i + 200));
      for (const t of data ?? []) tarjetas.set(t.lead_id, t.etapa_id);
    }

    const notas: { proyecto_id: string; lead_id: string; perfil_id: null; tipo: string; nota: string }[] = [];
    for (const o of cambiadas) {
      const etapa = columna.get(o.pipelineStageId!)!;
      const nota = `GHL (API): ${pApp.nombre} → ${nombreColumna.get(o.pipelineStageId!)}`;
      try {
        const lead = leads.get(o.contactId!);
        if (!lead) {
          // Aún no está en la app: se trae su contacto y entra en esa columna (con reparto, como los demás nuevos)
          if (r.nuevos >= MAX_NUEVOS) continue;
          const c = await contactoGhl({ token, contactId: o.contactId!, fetchImpl });
          if (!c) continue;
          const { lead: nuevo } = leadDeContactoGhl(o.contactId!, c, campos, { fuente: c.source ?? null, creadoEn: o.createdAt ?? null });
          const g = await guardarLeads(proyecto, [nuevo], { pipelineId: pApp.id, etapaId: etapa, origen: "ghl", perfilId: null, repartir: true, notaActividad: `Entró desde GHL (API) · ${pApp.nombre}` });
          r.nuevos += g.insertados;
        } else if (lead.pipeline_id === pApp.id || !lead.pipeline_id) {
          if (lead.etapa_id !== etapa || !lead.pipeline_id) {
            await db().from("leads").update({ pipeline_id: pApp.id, etapa_id: etapa }).eq("id", lead.id);
            notas.push({ proyecto_id: proyecto.id, lead_id: lead.id, perfil_id: null, tipo: "webhook", nota });
            r.movidos++;
          }
        } else if (!tarjetas.has(lead.id)) {
          await anadirTarjetas(proyecto.id, [{ lead_id: lead.id, pipeline_id: pApp.id, etapa_id: etapa }]);
          notas.push({ proyecto_id: proyecto.id, lead_id: lead.id, perfil_id: null, tipo: "webhook", nota });
          r.anadidos++;
        } else if (tarjetas.get(lead.id) !== etapa) {
          await moverTarjeta(lead.id, pApp.id, etapa);
          notas.push({ proyecto_id: proyecto.id, lead_id: lead.id, perfil_id: null, tipo: "webhook", nota });
          r.movidos++;
        }
        await db()
          .from("ghl_espejo")
          .upsert({ proyecto_id: proyecto.id, opp_id: o.id, contact_id: o.contactId ?? null, pipeline_ghl: pGhl.id, etapa_ghl: o.pipelineStageId!, actualizado_en: new Date().toISOString() });
      } catch (e) {
        r.errores.push(`Espejo ${o.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (notas.length) {
      const { error } = await db().from("actividades").insert(notas);
      if (error) console.error("[actividad] espejo:", error.message);
    }
  }
  return r;
}
