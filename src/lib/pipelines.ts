import "server-only";
import { db } from "@/lib/datos";
import { esJefe, puedeAdmin } from "@/lib/auth";
import { ErrorUsuario } from "@/lib/resultado";
import { esCloser, type Perfil, type Pipeline, type TipoPipeline } from "@/lib/tipos";

// Paso 0 (Cristian, 10 oct 2026): permisos de cada pipeline, como GHL.
// Editar = también sus columnas · Ver = mueve sus tarjetas · Sin acceso = ni lo ve. Manda la persona, luego su rol.
// El CEO y el director con Administración, siempre Editar.
export type Nivel = "editar" | "ver" | "sin_acceso";
export const NIVELES: { v: Nivel; t: string }[] = [
  { v: "editar", t: "Editar" },
  { v: "ver", t: "Ver" },
  { v: "sin_acceso", t: "Sin acceso" },
];
export type FilaPermisoPipeline = { pipeline_id: string; rol: string | null; perfil_id: string | null; nivel: Nivel };

// Lo de siempre: los de origen, Ver para todos; «Callers», para callers y directores; «Closers», para closers y directores
// A2 (Cristian, 17 nov): el caller con «También closer» (Facu) ve «Closers» como un closer
export function nivelDefecto(tipo: TipoPipeline, rol: Perfil["rol"], tambienCloser = false): Nivel {
  if (rol === "ceo") return "editar";
  if (tipo === "callers") return rol === "closer" ? "sin_acceso" : "ver";
  if (tipo === "closers") return rol === "caller" && !tambienCloser ? "sin_acceso" : "ver";
  return "ver";
}

export function calcularNivel(perfil: Perfil, pipeline: Pick<Pipeline, "id" | "tipo" | "solo_jefes">, filas: FilaPermisoPipeline[]): Nivel {
  if (puedeAdmin(perfil)) return "editar";
  if (pipeline.solo_jefes && !esJefe(perfil)) return "sin_acceso"; // Cristian, 15 nov: «Todos los leads», solo CEO y directores
  const deEste = filas.filter((f) => f.pipeline_id === pipeline.id);
  // A2: en «Closers», a quien es closer (también el caller con «También closer») le vale la fila del rol «closer»
  const rol = pipeline.tipo === "closers" && esCloser(perfil) ? "closer" : perfil.rol;
  return deEste.find((f) => f.perfil_id === perfil.id)?.nivel ?? deEste.find((f) => f.rol === rol)?.nivel ?? nivelDefecto(pipeline.tipo, perfil.rol, !!perfil.tambien_closer);
}

// Cristian, 14 nov (F7-B1, «Sí, solo los suyos»): en el CRM, un caller ve también los pipelines de origen donde su ROL
// tiene «Sin acceso», solo para mirar (el CRM le filtra sus leads). Mover sigue pasando por calcularNivel (exigirNivel).
export function nivelEnCrm(perfil: Perfil, pipeline: Pick<Pipeline, "id" | "tipo" | "solo_jefes">, filas: FilaPermisoPipeline[]): Nivel {
  const nivel = calcularNivel(perfil, pipeline, filas);
  const porPersona = filas.some((f) => f.pipeline_id === pipeline.id && f.perfil_id === perfil.id);
  return nivel === "sin_acceso" && perfil.rol === "caller" && pipeline.tipo === "normal" && !pipeline.solo_jefes && !porPersona ? "ver" : nivel;
}

export async function filasPermisoPipeline(pipelineIds: string[]) {
  if (!pipelineIds.length) return [] as FilaPermisoPipeline[];
  const { data, error } = await db().from("permisos_pipeline").select("pipeline_id, rol, perfil_id, nivel").in("pipeline_id", pipelineIds);
  // S3-4 (17 nov): sin filas se aplicaría el nivel por defecto y un «Sin acceso» se abriría durante el fallo
  if (error) throw new Error(`No se pudieron leer los permisos de pipeline: ${error.message}`);
  return (data ?? []) as FilaPermisoPipeline[];
}

// El pipeline (de este proyecto) y el nivel de quien pregunta; falla si no llega al nivel pedido
export async function exigirNivel(perfil: Perfil, proyectoId: string, pipelineId: string, minimo: "ver" | "editar") {
  const { data } = await db().from("pipelines").select("*").eq("id", pipelineId).eq("proyecto_id", proyectoId).maybeSingle<Pipeline>();
  if (!data) throw new ErrorUsuario("Pipeline no encontrado.");
  const nivel = calcularNivel(perfil, data, await filasPermisoPipeline([data.id]));
  if (nivel === "sin_acceso" || (minimo === "editar" && nivel !== "editar"))
    throw new ErrorUsuario(minimo === "editar" ? `No tienes permiso para cambiar las columnas de «${data.nombre}».` : `No tienes acceso al pipeline «${data.nombre}».`);
  return { pipeline: data, nivel };
}
