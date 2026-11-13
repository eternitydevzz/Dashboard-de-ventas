"use server";

import { exigirSeccion } from "@/lib/permisos";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { olvidarTodo } from "@/lib/memoria";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { db, escribir } from "@/lib/datos";
import { getSesion, esJefe } from "@/lib/auth";
import { AGENTES, type ConfigAgentes } from "@/lib/ia-agentes";
import { hayClaveIa, encolarAnalisis, pedirJson, peticion, procesarPendientes, type LlamarClaude } from "@/lib/ia";
import { datosEstudio } from "@/lib/cualificacion-datos";
import { cambiarEstadoCita } from "@/app/(panel)/closer/acciones";
import type { EstadoCita } from "@/lib/tipos";

const refrescar = () => revalidatePath("/", "layout");
async function jefe() {
  const s = await getSesion();
  if (!esJefe(s.perfil)) throw new ErrorUsuario("Solo el director o el CEO.");
  return s;
}
async function analisisPermitido(id: string) {
  const s = await getSesion();
  const { data: a } = await db().from("analisis_llamadas").select("*").eq("id", id).eq("proyecto_id", s.proyecto.id).maybeSingle();
  if (!a || (!esJefe(s.perfil) && a.closer_id !== s.perfil.id)) throw new ErrorUsuario("Ese análisis no es tuyo.");
  return { ...s, a };
}

// ---------- Configurar IA (4 pasos: alcance, contexto, agentes, revisión) ----------
export async function guardarConfigIa(productoId: string | null, contexto: string, agentes: ConfigAgentes) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { proyecto } = await jefe();
    if (productoId) {
      const { data: p } = await db().from("productos").select("id").eq("id", productoId).eq("proyecto_id", proyecto.id).maybeSingle();
      if (!p) throw new ErrorUsuario("Ese programa no es de este proyecto.");
    }
    if (contexto.length > 20_000) throw new ErrorUsuario("El contexto es demasiado largo (máximo 20.000 caracteres).");
    const limpio: ConfigAgentes = {};
    for (const a of AGENTES) {
      const x = agentes[a.v];
      if (!x) continue;
      const ins = (x.instrucciones ?? "").trim().slice(0, 4000);
      limpio[a.v] = { activo: x.activo !== false, instrucciones: ins || null };
    }
    let q = db().from("config_ia").select("id").eq("proyecto_id", proyecto.id);
    q = productoId ? q.eq("producto_id", productoId) : q.is("producto_id", null);
    const { data: ya } = await q.maybeSingle();
    const fila = { proyecto_id: proyecto.id, producto_id: productoId, contexto: contexto.trim() || null, agentes: limpio, actualizado_en: new Date().toISOString() };
    const { error } = ya ? await db().from("config_ia").update(fila).eq("id", ya.id) : await db().from("config_ia").insert(fila);
    if (error) throw new ErrorUsuario(error.message);
    refrescar();
  });
}

export async function borrarConfigIa(productoId: string) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { proyecto } = await jefe();
    await escribir(db().from("config_ia").delete().eq("proyecto_id", proyecto.id).eq("producto_id", productoId), "config_ia");
    refrescar();
  });
}

// ---------- Analizar ----------
export async function reanalizar(id: string) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { proyecto, a } = await analisisPermitido(id);
    if (!hayClaveIa()) throw new ErrorUsuario("Falta la clave de Claude en el servidor (ANTHROPIC_API_KEY).");
    await encolarAnalisis(proyecto.id, a.grabacion_id);
    after(() => procesarPendientes(proyecto.id).then(() => undefined));
    refrescar();
  });
}

export async function analizarPendientesAhora() {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { proyecto } = await jefe();
    if (!hayClaveIa()) throw new ErrorUsuario("Falta la clave de Claude en el servidor (ANTHROPIC_API_KEY).");
    // Grabaciones conciliadas que aún no tienen análisis
    const { data: gs } = await db().from("grabaciones").select("id, analisis_llamadas(id)").eq("proyecto_id", proyecto.id).not("cita_id", "is", null);
    let nuevas = 0;
    for (const g of gs ?? []) if (!((g.analisis_llamadas as unknown as unknown[]) ?? []).length) {
      await encolarAnalisis(proyecto.id, g.id);
      nuevas++;
    }
    after(() => procesarPendientes(proyecto.id, { max: 4 }).then(() => undefined));
    refrescar();
    return { nuevas };
  });
}

// ---------- Revisión IA: autocompletado del cierre ----------
// La IA propone; el closer (o un jefe) confirma. «Cerrada» necesita registrar la venta: se manda a la ficha.
export async function aceptarAutocompletado(id: string) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { a } = await analisisPermitido(id);
    const auto = a.autocompletado as { estado: EstadoCita; estrellas: number; nota: string } | null;
    if (!auto || a.autocompletado_estado !== "pendiente") throw new ErrorUsuario("No hay nada que confirmar.");
    if (!a.cita_id) throw new ErrorUsuario("La grabación ya no está unida a una cita.");
    if (auto.estado === "cerrada") {
      // La venta se registra en la ficha (al guardarla, la cita pasa sola a «cerrada»)
      await escribir(db().from("analisis_llamadas").update({ autocompletado_estado: "aceptado" }).eq("id", id), "analisis_llamadas");
      refrescar();
      return { irAVenta: a.lead_id as string };
    }
    const r = await cambiarEstadoCita(a.cita_id, auto.estado, `IA: ${auto.nota}`, auto.estrellas);
    if (r && typeof r === "object" && "error" in r) throw new ErrorUsuario(String(r.error));
    await escribir(db().from("analisis_llamadas").update({ autocompletado_estado: "aceptado" }).eq("id", id), "analisis_llamadas");
    refrescar();
    return { irAVenta: null };
  });
}

export async function rechazarAutocompletado(id: string) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    await analisisPermitido(id);
    await escribir(db().from("analisis_llamadas").update({ autocompletado_estado: "rechazado" }).eq("id", id), "analisis_llamadas");
    refrescar();
  });
}

// ---------- Análisis › Manual: evaluación a mano ----------
export async function evaluarManual(id: string, nota: number, texto: string) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { perfil, proyecto } = await jefe();
    if (!Number.isInteger(nota) || nota < 1 || nota > 10) throw new ErrorUsuario("Elige una nota de 1 a 10.");
    const { data } = await db().from("analisis_llamadas").update({ evaluacion_manual: nota, evaluacion_nota: texto.trim().slice(0, 4000) || null, evaluado_por: perfil.id, evaluado_en: new Date().toISOString() }).eq("id", id).eq("proyecto_id", proyecto.id).select("id");
    if (!data?.length) throw new ErrorUsuario("Ese análisis no existe.");
    refrescar();
  });
}

// ---------- Cualificación › Scoring IA ----------
// A Claude solo le llega la tabla del estudio (respuestas y números), nunca nombres, emails ni teléfonos.
export async function calcularScoringIa(llamar?: LlamarClaude) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { proyecto } = await jefe();
    const fs = await datosEstudio(proyecto.id);
    if (fs.filter((f) => f.llamadas > 0).length < 2) throw new ErrorUsuario("Aún hay muy pocas llamadas con respuestas del formulario para sacar conclusiones.");
    const tabla = fs.slice(0, 400).map((f) => `${f.pregunta} | ${f.respuesta} | leads ${f.leads} | llamadas ${f.llamadas} | cerradas ${f.cerradas} | cierre ${f.cierre}% | cash por llamada ${f.cashPorLlamada}`).join("\n");
    const esquema = {
      type: "object",
      properties: {
        pesos: { type: "array", items: { type: "object", properties: { pregunta: { type: "string" }, respuesta: { type: "string" }, puntos: { type: "integer", description: "De -10 (muy mala señal) a 10 (muy buena señal)" } }, required: ["pregunta", "respuesta", "puntos"], additionalProperties: false } },
        explicacion: { type: "string", description: "Qué respuestas predicen más el cierre y el cash, en 3-6 viñetas, y cuánto fiarse según el número de llamadas." },
      },
      required: ["pesos", "explicacion"],
      additionalProperties: false,
    };
    const { json, modelo } = await pedirJson(
      peticion({
        sistema: "Eres analista de ventas. Con la tabla de un estudio de cualificación (respuestas del formulario frente a cierre y cash por llamada), asigna puntos a cada respuesta para puntuar leads nuevos. Ten en cuenta el tamaño de la muestra: con pocas llamadas, puntos cercanos a 0. Escribe en español de España.",
        usuario: `Tabla (pregunta | respuesta | números):\n${tabla}`,
        esquema,
        maxTokens: 8000,
      }),
      llamar
    );
    const o = json as { pesos?: { pregunta: string; respuesta: string; puntos: number }[]; explicacion?: string };
    const pesos: Record<string, Record<string, number>> = {};
    const validas = new Set(fs.map((f) => `${f.pregunta}\u0000${f.respuesta}`));
    for (const p of o.pesos ?? []) {
      if (!validas.has(`${p.pregunta}\u0000${p.respuesta}`)) continue; // solo respuestas que existen
      (pesos[p.pregunta] ??= {})[p.respuesta] = Math.max(-10, Math.min(10, Math.round(Number(p.puntos) || 0)));
    }
    await escribir(db().from("scoring_ia").upsert({ proyecto_id: proyecto.id, pesos, explicacion: (o.explicacion ?? "").slice(0, 6000), modelo, creado_en: new Date().toISOString() }), "scoring_ia");
    olvidarTodo(); // Callers guarda el scoring 1 minuto (lib/memoria.ts)
    refrescar();
    return { respuestas: Object.values(pesos).reduce((s, x) => s + Object.keys(x).length, 0) };
  });
}
