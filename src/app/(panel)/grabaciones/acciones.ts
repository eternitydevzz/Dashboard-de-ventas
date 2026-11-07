"use server";

import { revalidatePath } from "next/cache";
import { esJefe } from "@/lib/auth";
import { exigirSeccion } from "@/lib/permisos";
import { db, escribir } from "@/lib/datos";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { prepararSubida, rutaDeSubidaValida } from "@/lib/subidas";
import { tipoGrabacion, transcripcionValida } from "@/lib/grabaciones";

// C10 (plan Callers, 7 nov): el navegador sube el audio directo a Supabase con un enlace firmado (no pasa por Vercel)
export async function prepararSubidaGrabacion(ext: string) {
  return seguro(async () => {
    const { proyecto } = await exigirSeccion("grabaciones");
    return prepararSubida("grabaciones", proyecto.id, ext);
  });
}

// La grabación queda unida al lead con el que empezó (aunque luego se cambie de lead en la cola)
export async function guardarGrabacion(leadId: string, ruta: string, duracionSeg: number) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("grabaciones");
    if (!rutaDeSubidaValida("grabaciones", ruta, proyecto.id)) throw new ErrorUsuario("Archivo de audio no válido.");
    const { data: lead } = await db().from("leads").select("id, caller_id, closer_id").eq("id", leadId).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!lead) throw new ErrorUsuario("Lead no encontrado.");
    if (!esJefe(perfil) && lead.caller_id !== perfil.id && lead.closer_id !== perfil.id) throw new ErrorUsuario("Este lead no está asignado a ti.");
    // Solo comprueba que el audio está subido (sin descargarlo: puede pesar hasta 50 MB)
    const [carpeta, archivo] = ruta.split("/");
    const { data: hay } = await db().storage.from("grabaciones").list(carpeta, { search: archivo, limit: 1 });
    if (!hay?.some((x) => x.name === archivo)) throw new ErrorUsuario("No se encontró el audio subido. Vuelve a grabar.");
    const { data, error } = await db()
      .from("grabaciones_caller")
      .insert({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, archivo_path: ruta, tipo: tipoGrabacion(ruta), duracion_seg: Math.max(0, Math.round(Number(duracionSeg) || 0)) })
      .select("id")
      .single();
    if (error || !data) throw new Error(`No se pudo guardar la grabación: ${error?.message}`);
    revalidatePath("/grabaciones");
    return { id: data.id as string };
  });
}

// La transcripción la hacen Cristian y Claude en local y la suben aquí (decidido): solo CEO y directores
export async function guardarTranscripcion(id: string, texto: string) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("grabaciones");
    if (!esJefe(perfil)) throw new ErrorUsuario("Solo el CEO y los directores suben transcripciones.");
    const t = transcripcionValida(texto);
    await escribir(db().from("grabaciones_caller").update({ transcripcion: t, transcrita_en: new Date().toISOString() }).eq("id", id).eq("proyecto_id", proyecto.id), "grabaciones");
    revalidatePath("/grabaciones");
  });
}
