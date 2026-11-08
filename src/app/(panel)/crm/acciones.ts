"use server";

import { ESTADOS_CALLER } from "@/lib/estados-caller";
import { exigirSeccion } from "@/lib/permisos";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { olvidarTodo } from "@/lib/memoria";
import { after } from "next/server";
import { exigir, esJefe, puedeAdmin, getSesion } from "@/lib/auth";
import { CLAVES_CLOSER } from "@/lib/llamadas";
import { exigirNivel } from "@/lib/pipelines";
import type { EstadoCaller, TipoPipeline } from "@/lib/tipos";
import { db, registrarActividad, escribir } from "@/lib/datos";
import { guardarLeads, primeraEtapa } from "@/lib/leads";
import { conPais } from "@/lib/pais";
import { filaALead, mapaValido } from "@/lib/csv";
import { borrarSubida, leerSubida, prepararSubida } from "@/lib/subidas";
import { moverTarjeta, tarjetaDe } from "@/lib/tarjetas";

// 25 oct 2026: también borra la memoria compartida (lib/memoria.ts), para que lo guardado se vea al momento
const refrescar = () => {
  olvidarTodo();
  revalidatePath("/", "layout");
};

// ---------- Importar CSV ----------
// Enlace firmado para que el navegador suba el CSV directo a Supabase (sin pasar por Vercel)
export async function prepararSubidaCsv() {
  return seguro(async () => {
    await exigirSeccion("crm"); // H5
    const { proyecto } = await exigir(esJefe);
    return prepararSubida("importaciones", proyecto.id);
  });
}

export async function importarCsv(_prev: unknown, formData: FormData) {
  const ruta = String(formData.get("archivo_ruta") ?? "");
  // Arreglo 30: mismo envoltorio que el resto (lo inesperado no enseña detalles internos)
  return seguro(async () => {
    await exigirSeccion("crm"); // H5
    const { perfil, proyecto } = await exigir(esJefe);
    if (!ruta) return { error: "Elige un archivo CSV." };
    const texto = await (await leerSubida("importaciones", ruta, proyecto.id)).text();
    // Ya está leído: el archivo no se guarda
    await borrarSubida("importaciones", ruta);
    const res = Papa.parse<Record<string, string>>(texto.replace(/^﻿/, ""), { header: true, skipEmptyLines: true });
    if (!res.data.length) return { error: "El CSV no tiene filas." };
    const pipelineId = String(formData.get("pipeline") ?? "") || null;
    if (pipelineId) {
      const { data } = await db().from("pipelines").select("id").eq("id", pipelineId).eq("proyecto_id", proyecto.id).eq("tipo", "normal").maybeSingle();
      if (!data) return { error: "Ese pipeline no es de este proyecto." };
    }
    let mapaBruto: unknown = null;
    try {
      mapaBruto = JSON.parse(String(formData.get("mapa") ?? "null"));
    } catch {
      mapaBruto = null;
    }
    const mapa = mapaValido(mapaBruto, res.meta.fields ?? []);
    const r = await guardarLeads(proyecto, res.data.map((f) => filaALead(f, mapa)), {
      pipelineId,
      origen: "csv",
      perfilId: perfil.id,
      repartir: formData.get("repartir") === "on",
    });
    refrescar();
    return { ok: `Importados ${r.insertados} leads nuevos · ${r.actualizados} actualizados${r.tarjetas ? ` · ${r.tarjetas} ya estaban en otro pipeline (tarjeta nueva aquí)` : ""}${r.cambianOferta ? ` · ${r.cambianOferta} cambian de oferta` : ""} · ${r.repartidos} repartidos a callers${r.invalidos ? ` · ${r.invalidos} filas sin email ni teléfono` : ""}.` };
  });
}

// ---------- Pipelines y columnas ----------
// Crear pipelines: el CEO y el director con Administración. Columnas, renombrar y borrar: quien tenga «Editar»
// en ese pipeline (Paso 0, como GHL; el CEO y el director con Administración, siempre).
export async function crearPipeline(nombre: string) {
  return seguro(async () => {
    await exigirSeccion("crm"); // H5
    const { proyecto } = await exigir(puedeAdmin);
    const n = nombre.trim();
    if (!n) throw new ErrorUsuario("Pon un nombre.");
    // Antes de «Callers» y «Closers», que van al final
    const { count } = await db().from("pipelines").select("id", { count: "exact", head: true }).eq("proyecto_id", proyecto.id).eq("tipo", "normal");
    const { data, error } = await db().from("pipelines").insert({ proyecto_id: proyecto.id, nombre: n, orden: count ?? 0 }).select().single();
    if (error) throw new ErrorUsuario(error.message);
    // Columnas de un pipeline de origen (como antes del H7: los botones mueven por el nombre de la columna)
    await escribir(db().from("etapas").insert([
      { pipeline_id: data.id, nombre: "Nuevos", orden: 0, color: "#64748b" },
      { pipeline_id: data.id, nombre: "Agendados", orden: 1, color: "#2f55d4" },
      // Unida a «Vendido»: soltar ahí abre «Registrar venta» (cerrar soltando, como en los demás; arreglado el 13 oct)
      { pipeline_id: data.id, nombre: "Cerrados", orden: 2, color: "#16a34a", estado_caller: "vendido" },
      { pipeline_id: data.id, nombre: "Descartados", orden: 3, color: "#dc2626" },
    ]), "etapas");
    refrescar();
    return data.id as string;
  });
}

export async function renombrarPipeline(pipelineId: string, nombre: string) {
  return seguro(async () => {
    await exigirSeccion("crm"); // H5
    const { perfil, proyecto } = await getSesion();
    await exigirNivel(perfil, proyecto.id, pipelineId, "editar");
    if (!nombre.trim()) throw new ErrorUsuario("Pon un nombre.");
    await escribir(db().from("pipelines").update({ nombre: nombre.trim() }).eq("id", pipelineId), "pipelines");
    refrescar();
  });
}

export async function borrarPipeline(pipelineId: string) {
  return seguro(async () => {
    await exigirSeccion("crm"); // H5
    const { perfil, proyecto } = await getSesion();
    const { pipeline } = await exigirNivel(perfil, proyecto.id, pipelineId, "editar");
    if (pipeline.tipo !== "normal") throw new ErrorUsuario(`«${pipeline.nombre}» es el pipeline del equipo: se puede renombrar, pero no borrar.`);
    await escribir(db().from("leads").update({ pipeline_id: null, etapa_id: null }).eq("pipeline_id", pipelineId), "leads");
    await escribir(db().from("pipelines").delete().eq("id", pipelineId), "pipelines");
    refrescar();
  });
}

// Pipeline de origen de este proyecto (los leads entran en estos, no en «Callers» ni «Closers»)
async function pipelineDelProyecto(pipelineId: string, proyectoId: string) {
  const { data } = await db().from("pipelines").select("id").eq("id", pipelineId).eq("proyecto_id", proyectoId).eq("tipo", "normal").maybeSingle();
  if (!data) throw new ErrorUsuario("Pipeline no encontrado.");
}

async function etapaDelProyecto(etapaId: string, proyectoId: string) {
  const { data } = await db().from("etapas").select("id, pipeline_id, nombre, estado_caller, columna_cita, pipelines!inner(proyecto_id, tipo)").eq("id", etapaId).eq("pipelines.proyecto_id", proyectoId).maybeSingle();
  if (!data) throw new ErrorUsuario("Columna no encontrada.");
  return data as unknown as { id: string; pipeline_id: string; nombre: string; estado_caller: EstadoCaller | null; columna_cita: string | null; pipelines: { tipo: TipoPipeline } };
}

// Columna de un pipeline donde quien pregunta puede «Editar»
async function etapaEditable(etapaId: string) {
  const { perfil, proyecto } = await getSesion();
  const e = await etapaDelProyecto(etapaId, proyecto.id);
  await exigirNivel(perfil, proyecto.id, e.pipeline_id, "editar");
  return e;
}

export async function crearEtapa(pipelineId: string, nombre: string, color: string) {
  return seguro(async () => {
    await exigirSeccion("crm"); // H5
    const { perfil, proyecto } = await getSesion();
    await exigirNivel(perfil, proyecto.id, pipelineId, "editar");
    const { count } = await db().from("etapas").select("id", { count: "exact", head: true }).eq("pipeline_id", pipelineId);
    await escribir(db().from("etapas").insert({ pipeline_id: pipelineId, nombre: nombre.trim() || "Nueva columna", orden: count ?? 0, color }), "etapas");
    refrescar();
  });
}

export async function editarEtapa(etapaId: string, nombre: string, color: string) {
  return seguro(async () => {
    await exigirSeccion("crm"); // H5
    await etapaEditable(etapaId);
    await escribir(db().from("etapas").update({ nombre: nombre.trim(), color }).eq("id", etapaId), "etapas");
    refrescar();
  });
}

export async function moverEtapa(etapaId: string, direccion: -1 | 1) {
  return seguro(async () => {
    await exigirSeccion("crm"); // H5
    const e = await etapaEditable(etapaId);
    const { data: etapas } = await db().from("etapas").select("id, orden").eq("pipeline_id", e.pipeline_id).order("orden");
    const lista = etapas ?? [];
    const i = lista.findIndex((x) => x.id === etapaId);
    const j = i + direccion;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    await Promise.all(lista.map((x, k) => db().from("etapas").update({ orden: k }).eq("id", x.id)));
    refrescar();
  });
}

// Orden nuevo de las columnas al soltar una arrastrándola (Fase 4): llegan todas, en su orden
export async function ordenarEtapas(pipelineId: string, ids: string[]) {
  return seguro(async () => {
    await exigirSeccion("crm");
    const { perfil, proyecto } = await getSesion();
    await exigirNivel(perfil, proyecto.id, pipelineId, "editar");
    const { data } = await db().from("etapas").select("id").eq("pipeline_id", pipelineId);
    const actuales = new Set((data ?? []).map((x) => x.id));
    if (ids.length !== actuales.size || new Set(ids).size !== ids.length || !ids.every((id) => actuales.has(id)))
      throw new ErrorUsuario("Las columnas han cambiado. Recarga la página.");
    await Promise.all(ids.map((id, k) => escribir(db().from("etapas").update({ orden: k }).eq("id", id), "etapas")));
    refrescar();
  });
}

// Orden nuevo de los pipelines al soltar uno arrastrándolo (Fase 4): solo quien crea pipelines
export async function ordenarPipelines(ids: string[]) {
  return seguro(async () => {
    await exigirSeccion("crm");
    const { proyecto } = await exigir(puedeAdmin);
    const { data } = await db().from("pipelines").select("id").eq("proyecto_id", proyecto.id);
    const actuales = new Set((data ?? []).map((x) => x.id));
    if (ids.length !== actuales.size || new Set(ids).size !== ids.length || !ids.every((id) => actuales.has(id)))
      throw new ErrorUsuario("Los pipelines han cambiado. Recarga la página.");
    await Promise.all(ids.map((id, k) => escribir(db().from("pipelines").update({ orden: k }).eq("id", id), "pipelines")));
    refrescar();
  });
}

// Columna donde van los leads con cita de GHL (Fase 4; antes «Orgánico → Agendados» por su nombre). null = ninguna.
export async function marcarColumnaCitasGhl(etapaId: string | null) {
  return seguro(async () => {
    await exigirSeccion("crm");
    const { proyecto } = await exigir(puedeAdmin);
    if (etapaId) {
      const e = await etapaDelProyecto(etapaId, proyecto.id);
      if (e.pipelines.tipo !== "normal") throw new ErrorUsuario("Solo puede ser una columna de un pipeline de origen.");
    }
    const { error } = await db().from("proyectos").update({ etapa_citas_ghl: etapaId }).eq("id", proyecto.id);
    if (error) throw new ErrorUsuario(/etapa_citas_ghl/.test(error.message) ? "Falta aplicar la migración de la base (columna de citas de GHL)." : error.message);
    refrescar();
  });
}

export async function borrarEtapa(etapaId: string) {
  return seguro(async () => {
    await exigirSeccion("crm"); // H5
    const e = await etapaEditable(etapaId);
    if (e.pipelines.tipo === "normal") {
      const destino = await primeraEtapa(e.pipeline_id);
      const otra = destino === etapaId
        ? (await db().from("etapas").select("id").eq("pipeline_id", e.pipeline_id).neq("id", etapaId).order("orden").limit(1).maybeSingle()).data?.id ?? null
        : destino;
      await escribir(db().from("leads").update({ etapa_id: otra }).eq("etapa_id", etapaId), "leads");
    }
    // En «Callers» y «Closers», las tarjetas de una columna borrada vuelven a la columna de su estado (o salen aparte)
    if (e.pipelines.tipo === "callers") await escribir(db().from("leads").update({ etapa_callers_id: null }).eq("etapa_callers_id", etapaId), "leads");
    await escribir(db().from("etapas").delete().eq("id", etapaId), "etapas");
    refrescar();
  });
}

// Unir una columna a un estado (o quitar la unión con null). «Callers»: un estado del lead. «Closers»: una
// columna de Pre-call o de Post-call. Un estado, una sola columna. Los pipelines de origen no tienen uniones.
export async function unirEstado(etapaId: string, estado: string | null) {
  return seguro(async () => {
    await exigirSeccion("crm"); // H5
    const e = await etapaEditable(etapaId);
    const tipo = e.pipelines.tipo;
    // Fase 7: en un pipeline de origen, una columna se puede unir a «Vendido» (soltar ahí abre «Registrar venta»)
    if (tipo === "normal" && estado !== null && estado !== "vendido") throw new ErrorUsuario("En un pipeline de origen, una columna solo se une a «Vendido»; las demás uniones, en «Callers» y «Closers».");
    const validos: string[] = tipo === "callers" ? ESTADOS : tipo === "normal" ? ["vendido"] : CLAVES_CLOSER.map((c) => c.v);
    if (estado !== null && !validos.includes(estado)) throw new ErrorUsuario("Estado no válido.");
    const campo = tipo === "callers" ? "estado_caller" : "columna_cita";
    if (estado) {
      const { data: otra } = await db().from("etapas").select("nombre").eq("pipeline_id", e.pipeline_id).eq(campo, estado).neq("id", etapaId).maybeSingle();
      if (otra) throw new ErrorUsuario(`La columna «${otra.nombre}» ya está unida a ese estado: quítasela antes.`);
    }
    await escribir(db().from("etapas").update({ [campo]: estado }).eq("id", etapaId), "etapas");
    if (tipo === "callers" && estado) {
      // Los leads con ese estado pasan a esta columna
      const { data: p } = await db().from("pipelines").select("proyecto_id").eq("id", e.pipeline_id).single();
      await escribir(db().from("leads").update({ etapa_callers_id: etapaId }).eq("proyecto_id", p!.proyecto_id).eq("estado_caller", estado), "leads");
    }
    refrescar();
  });
}
const ESTADOS: EstadoCaller[] = ESTADOS_CALLER.map((e) => e.v); // C11: los 12

// Permisos de un pipeline (como GHL): por rol o por persona; null = lo de siempre. Solo CEO y director con Administración.
export async function guardarPermisoPipeline(pipelineId: string, quien: { rol: string } | { perfilId: string }, nivel: string | null) {
  return seguro(async () => {
    await exigirSeccion("crm"); // H5
    const { proyecto } = await exigir(puedeAdmin);
    const { data: pipe } = await db().from("pipelines").select("id").eq("id", pipelineId).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!pipe) throw new ErrorUsuario("Pipeline no encontrado.");
    if (nivel !== null && !["editar", "ver", "sin_acceso"].includes(nivel)) throw new ErrorUsuario("Nivel no válido.");
    let filtro: { rol: string; perfil_id: null } | { rol: null; perfil_id: string };
    if ("rol" in quien) {
      if (!["director", "closer", "caller"].includes(quien.rol)) throw new ErrorUsuario("Rol no válido.");
      filtro = { rol: quien.rol, perfil_id: null };
    } else {
      const { data: m } = await db().from("miembros_proyecto").select("perfil_id, perfiles!inner(rol)").eq("proyecto_id", proyecto.id).eq("perfil_id", quien.perfilId).maybeSingle();
      if (!m) throw new ErrorUsuario("Esa persona no es de este proyecto.");
      if ((m as unknown as { perfiles: { rol: string } }).perfiles.rol === "ceo") throw new ErrorUsuario("El CEO lo tiene todo siempre.");
      filtro = { rol: null, perfil_id: quien.perfilId };
    }
    const borrar = db().from("permisos_pipeline").delete().eq("pipeline_id", pipelineId);
    await escribir(filtro.rol ? borrar.eq("rol", filtro.rol) : borrar.eq("perfil_id", filtro.perfil_id!), "permisos_pipeline");
    if (nivel) await escribir(db().from("permisos_pipeline").insert({ pipeline_id: pipelineId, ...filtro, nivel }), "permisos_pipeline");
    refrescar();
  });
}

// ---------- Mover y asignar leads ----------
export async function moverLead(leadId: string, etapaId: string) {
  return seguro(async () => {
    // Paso H7: cada uno mueve sus leads (el caller los suyos, el closer los suyos; los jefes, todos)
    const { perfil, proyecto } = await exigirSeccion("crm"); // H5
    // Velocidad (13 oct 2026): las comprobaciones van a la vez y el historial se apunta después de contestar
    const [e, { data: lead }] = await Promise.all([
      etapaDelProyecto(etapaId, proyecto.id),
      db().from("leads").select("id, pipeline_id, etapa_id, etapa_callers_id, estado_caller, caller_id, closer_id").eq("id", leadId).eq("proyecto_id", proyecto.id).maybeSingle(),
    ]);
    if (e.pipelines.tipo === "closers") throw new ErrorUsuario("En «Closers» se mueven citas, no leads.");
    if (!lead) throw new ErrorUsuario("Lead no encontrado.");
    if (!esJefe(perfil) && lead.caller_id !== perfil.id && lead.closer_id !== perfil.id) throw new ErrorUsuario("Este lead no está asignado a ti.");
    const callers = e.pipelines.tipo === "callers";
    const otroPipeline = !callers && !!lead.pipeline_id && lead.pipeline_id !== e.pipeline_id;
    const [, tarjeta] = await Promise.all([
      exigirNivel(perfil, proyecto.id, e.pipeline_id, "ver"), // Paso 0
      otroPipeline ? tarjetaDe(leadId, e.pipeline_id) : Promise.resolve(null),
    ]);
    const historial = (nota: string) => after(() => registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "cambio_etapa", nota }));
    // Fase 4: la tarjeta de este lead en un pipeline que no es el suyo principal
    if (tarjeta) {
      if (tarjeta.etapa_id === etapaId) return;
      await moverTarjeta(leadId, e.pipeline_id, etapaId);
      historial(`Su tarjeta de otro pipeline, movida a «${e.nombre}»`);
      refrescar();
      return;
    }
    if ((callers ? lead.etapa_callers_id : lead.etapa_id) === etapaId) return;
    // Una columna unida a un estado solo se alcanza cambiando el estado (su botón o su ventana), para no desincronizar
    if (e.estado_caller && e.estado_caller !== lead.estado_caller) throw new ErrorUsuario(`«${e.nombre}» está unida a un estado: usa su botón para mover el lead ahí.`);
    await escribir(db().from("leads").update(callers ? { etapa_callers_id: etapaId } : { etapa_id: etapaId, pipeline_id: e.pipeline_id }).eq("id", leadId), "leads");
    historial(`Movido a «${e.nombre}»${callers ? " (Callers)" : ""}`);
    refrescar();
  });
}

// «Closers» (Paso 0): una cita a una columna libre (o de vuelta a la de su estado con null)
export async function moverCitaColumna(citaId: string, etapaId: string | null) {
  return seguro(async () => {
    await exigirSeccion("crm", "agendas"); // H5
    const { perfil, proyecto } = await getSesion();
    const { data: cita } = await db().from("citas").select("id, closer_id, lead_id").eq("id", citaId).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!cita) throw new ErrorUsuario("Cita no encontrada.");
    if (!esJefe(perfil) && cita.closer_id !== perfil.id) throw new ErrorUsuario("Esta cita no es tuya.");
    let nombre = "su columna";
    if (etapaId) {
      const e = await etapaDelProyecto(etapaId, proyecto.id);
      if (e.pipelines.tipo !== "closers") throw new ErrorUsuario("Esa columna no es de «Closers».");
      if (e.columna_cita) throw new ErrorUsuario(`«${e.nombre}» está unida a un estado: usa su botón para mover la cita ahí.`);
      await exigirNivel(perfil, proyecto.id, e.pipeline_id, "ver");
      nombre = `«${e.nombre}»`;
    }
    await escribir(db().from("citas").update({ etapa_closers_id: etapaId }).eq("id", citaId), "citas");
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: cita.lead_id, perfil_id: perfil.id, tipo: "cambio_etapa", nota: `Cita movida a ${nombre} (Closers)` });
    refrescar();
  });
}

export async function asignarLeads(leadIds: string[], callerId: string | null | undefined, closerId?: string | null) {
  return seguro(async () => {
    await exigirSeccion("crm"); // H5
    const { perfil, proyecto } = await exigir(esJefe);
    if (!leadIds.length) return;
    // Arreglo 29: solo se asigna a callers/closers de este proyecto
    for (const [id, rol] of [[callerId, "caller"], [closerId, "closer"]] as const) {
      if (!id) continue;
      const { data } = await db().from("miembros_proyecto").select("perfil_id, perfiles!inner(rol)").eq("proyecto_id", proyecto.id).eq("perfil_id", id).eq("perfiles.rol", rol).maybeSingle();
      if (!data) throw new ErrorUsuario(`Esa persona no es ${rol} de este proyecto.`);
    }
    const cambios: Record<string, string | null> = {};
    if (callerId !== undefined) cambios.caller_id = callerId || null;
    if (closerId !== undefined) cambios.closer_id = closerId || null;
    await escribir(db().from("leads").update(cambios).in("id", leadIds).eq("proyecto_id", proyecto.id), "leads");
    const { data: personas } = await db().from("perfiles").select("id, nombre").in("id", [callerId, closerId].filter(Boolean) as string[]);
    const nombre = (id?: string | null) => personas?.find((p) => p.id === id)?.nombre ?? "nadie";
    await db().from("actividades").insert(
      leadIds.map((id) => ({
        proyecto_id: proyecto.id,
        lead_id: id,
        perfil_id: perfil.id,
        tipo: "asignacion",
        nota: [callerId !== undefined && `Caller: ${nombre(callerId)}`, closerId !== undefined && `Closer: ${nombre(closerId)}`].filter(Boolean).join(" · "),
      }))
    );
    refrescar();
  });
}

export async function crearLeadManual(formData: FormData) {
  return seguro(async () => {
    await exigirSeccion("crm"); // H5
    const { perfil, proyecto } = await exigir(esJefe);
    const nombre = String(formData.get("nombre") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
    const telefono = String(formData.get("telefono") ?? "").trim() || null;
    const pipelineId = String(formData.get("pipeline") ?? "") || null;
    if (!nombre || (!email && !telefono)) throw new ErrorUsuario("Pon nombre y email o teléfono.");
    if (pipelineId) await pipelineDelProyecto(pipelineId, proyecto.id); // arreglo 29
    const [n, ...resto] = nombre.split(" ");
    const etapaId = pipelineId ? await primeraEtapa(pipelineId) : null;
    const { data, error } = await db()
      .from("leads")
      .insert({ proyecto_id: proyecto.id, nombre: n, apellido: resto.join(" "), email, telefono, ...conPais(telefono), origen: "manual", pipeline_id: pipelineId, etapa_id: etapaId })
      .select("id")
      .single();
    if (error) throw new ErrorUsuario(error.code === "23505" ? "Ya existe un lead con ese email." : error.message);
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: data.id, perfil_id: perfil.id, tipo: "nota", nota: "Lead creado a mano" });
    refrescar();
  });
}

// ---------- Acciones masivas (Fase 4, como GHL): CEO y directores; borrar, solo el CEO ----------
const MAX_MASIVO = 2000;
function idsValidos(ids: string[]) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) throw new ErrorUsuario("No hay leads seleccionados.");
  if (unicos.length > MAX_MASIVO) throw new ErrorUsuario(`Máximo ${MAX_MASIVO} leads a la vez.`);
  return unicos;
}

// Mueve los leads seleccionados a una columna (de este pipeline o de otro de origen). En «Callers», solo a columnas
// libres: las unidas a un estado se alcanzan con su botón (para no desincronizar el estado).
export async function moverLeads(leadIds: string[], etapaId: string) {
  return seguro(async () => {
    await exigirSeccion("crm");
    const { perfil, proyecto } = await exigir(esJefe);
    const ids = idsValidos(leadIds);
    const e = await etapaDelProyecto(etapaId, proyecto.id);
    if (e.pipelines.tipo === "closers") throw new ErrorUsuario("En «Closers» se mueven citas, no leads.");
    if (e.estado_caller) throw new ErrorUsuario(`«${e.nombre}» está unida a un estado: usa su botón en cada lead.`);
    const callers = e.pipelines.tipo === "callers";
    // Fase 4: los que ya tienen tarjeta en ese pipeline (sin ser el suyo principal) mueven esa tarjeta;
    // el resto cambia su pipeline y columna principales
    const { data: extra } = callers ? { data: [] } : await db().from("tarjetas_extra").select("lead_id").in("lead_id", ids).eq("pipeline_id", e.pipeline_id);
    const conTarjeta = new Set((extra ?? []).map((x) => x.lead_id as string));
    const principales = ids.filter((id) => !conTarjeta.has(id));
    if (conTarjeta.size) await escribir(db().from("tarjetas_extra").update({ etapa_id: etapaId }).in("lead_id", [...conTarjeta]).eq("pipeline_id", e.pipeline_id), "tarjetas_extra");
    if (principales.length)
      await escribir(
        db().from("leads").update(callers ? { etapa_callers_id: etapaId } : { etapa_id: etapaId, pipeline_id: e.pipeline_id }).in("id", principales).eq("proyecto_id", proyecto.id),
        "leads"
      );
    await db().from("actividades").insert(ids.map((id) => ({ proyecto_id: proyecto.id, lead_id: id, perfil_id: perfil.id, tipo: "cambio_etapa", nota: `Movido a «${e.nombre}» (en masa)` })));
    refrescar();
    return ids.length;
  });
}

// Añade y quita etiquetas a los leads seleccionados
export async function cambiarEtiquetas(leadIds: string[], anadir: string[], quitar: string[]) {
  return seguro(async () => {
    await exigirSeccion("crm");
    const { proyecto } = await exigir(esJefe);
    const ids = idsValidos(leadIds);
    const limpia = (l: string[]) => [...new Set(l.map((x) => x.trim()).filter(Boolean))].slice(0, 20);
    const mas = limpia(anadir);
    const menos = new Set(limpia(quitar).map((x) => x.toLowerCase()));
    if (!mas.length && !menos.size) throw new ErrorUsuario("Escribe alguna etiqueta.");
    if (mas.some((x) => x.length > 60)) throw new ErrorUsuario("Etiqueta demasiado larga (máx. 60).");
    const { data } = await db().from("leads").select("id, etiquetas").in("id", ids).eq("proyecto_id", proyecto.id);
    await Promise.all(
      (data ?? []).map((l) => {
        const actuales = ((l.etiquetas ?? []) as string[]).filter((x) => !menos.has(x.toLowerCase()));
        const nuevas = [...actuales, ...mas.filter((x) => !actuales.some((a) => a.toLowerCase() === x.toLowerCase()))];
        return escribir(db().from("leads").update({ etiquetas: nuevas }).eq("id", l.id), "leads");
      })
    );
    refrescar();
    return data?.length ?? 0;
  });
}

// Borra los leads seleccionados. Criterio de Claude (Fase 4): se salta los que tienen citas o ventas, porque al
// borrar un lead se borran en cascada sus citas, ventas, cobros y comisiones. Esos se borran uno a uno, a propósito.
export async function borrarLeads(leadIds: string[]) {
  return seguro(async () => {
    await exigirSeccion("crm");
    const { proyecto } = await exigir((p) => p.rol === "ceo"); // borrar en masa, solo el CEO (Cristian, 12 oct)
    const ids = idsValidos(leadIds);
    const [{ data: conCita }, { data: conVenta }] = await Promise.all([
      db().from("citas").select("lead_id").in("lead_id", ids),
      db().from("ventas").select("lead_id").in("lead_id", ids),
    ]);
    const protegidos = new Set([...(conCita ?? []), ...(conVenta ?? [])].map((x) => x.lead_id as string));
    const borrar = ids.filter((id) => !protegidos.has(id));
    if (borrar.length) await escribir(db().from("leads").delete().in("id", borrar).eq("proyecto_id", proyecto.id), "leads");
    refrescar();
    return { borrados: borrar.length, saltados: protegidos.size };
  });
}

// D2 · Unir dos leads duplicados (solo jefes). Se queda el más antiguo; el otro se borra y todo lo suyo pasa al
// antiguo (función `unir_leads`, D1: todo o nada). Devuelve el contacto de GHL que sobra, para unirlo o borrarlo en GHL.
export async function unirLeads(queda: string, sobra: string) {
  return seguro(async () => {
    await exigirSeccion("crm");
    const { proyecto } = await exigir(esJefe);
    // Los dos, de este proyecto (la función también lo comprueba, pero así el mensaje es claro)
    const { data } = await db().from("leads").select("id, creado_en").eq("proyecto_id", proyecto.id).in("id", [queda, sobra]);
    if (queda === sobra || data?.length !== 2) throw new ErrorUsuario("Esos leads no son de este proyecto.");
    if (data.find((l) => l.id === queda)!.creado_en > data.find((l) => l.id === sobra)!.creado_en) throw new ErrorUsuario("Se queda el más antiguo.");
    const { data: ghl, error } = await db().rpc("unir_leads", { p_proyecto: proyecto.id, p_queda: queda, p_sobra: sobra });
    if (error) throw new Error(`No se pudo unir: ${error.message}`);
    refrescar();
    return { ok: true as const, ghlSobra: (ghl as string | null) ?? null };
  });
}
