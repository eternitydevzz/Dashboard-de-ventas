"use server";

import { revalidatePath } from "next/cache";
import { esJefe } from "@/lib/auth";
import { exigirSeccion } from "@/lib/permisos";
import { db, escribir } from "@/lib/datos";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { borrarSubida, leerSubida, prepararSubida, rutaDeSubidaValida } from "@/lib/subidas";
import { mercadosValidos, ordenCompleto, tituloManual } from "@/lib/manuales";

// C9 (plan Callers, 7 nov): los manuales los ve todo el mundo; los suben o cambian el CEO y los directores.
async function exigirEditor() {
  const sesion = await exigirSeccion("manuales");
  if (!esJefe(sesion.perfil)) throw new ErrorUsuario("Solo el CEO y los directores cambian los manuales.");
  return sesion;
}

// Enlace firmado: el navegador sube el .html directo a Supabase (sin pasar por Vercel)
export async function prepararSubidaManual() {
  return seguro(async () => {
    const { proyecto } = await exigirEditor();
    return prepararSubida("manuales", proyecto.id);
  });
}

// Sin `id`, un manual nuevo; con `id`, el .html nuevo sustituye al anterior (que se borra)
export async function guardarManual(formData: FormData) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirEditor();
    const id = String(formData.get("id") ?? "");
    const titulo = tituloManual(formData.get("titulo"));
    const ruta = String(formData.get("archivo_ruta") ?? "");
    if (!rutaDeSubidaValida("manuales", ruta, proyecto.id)) throw new ErrorUsuario("Archivo no válido. Vuelve a elegirlo.");
    await leerSubida("manuales", ruta, proyecto.id); // comprueba que se subió y que no pasa de 15 MB
    const ahora = new Date().toISOString();
    if (id) {
      const { data: viejo } = await db().from("manuales").select("archivo_path").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle();
      if (!viejo) throw new ErrorUsuario("Manual no encontrado.");
      await escribir(db().from("manuales").update({ titulo, archivo_path: ruta, actualizado_por: perfil.id, actualizado_en: ahora }).eq("id", id), "manuales");
      if (viejo.archivo_path !== ruta) await borrarSubida("manuales", viejo.archivo_path);
    } else {
      const { count } = await db().from("manuales").select("id", { count: "exact", head: true }).eq("proyecto_id", proyecto.id);
      const mercado = formData.get("mercado") === "es" ? "es" : "latam"; // 13 nov: subido mirando España, es de España
      await escribir(db().from("manuales").insert({ proyecto_id: proyecto.id, titulo, archivo_path: ruta, orden: count ?? 0, actualizado_por: perfil.id, actualizado_en: ahora, mercado, mercados: [mercado] }), "manuales");
    }
    revalidatePath("/manuales");
  });
}

// Cristian, 14 nov: orden nuevo al soltar un manual arrastrándolo (o «Mover antes/después»). Llegan los que se ven,
// en su orden; solo cambia `orden` y solo en manuales del proyecto abierto.
export async function ordenarManuales(ids: unknown) {
  return seguro(async () => {
    const { proyecto } = await exigirEditor();
    const { data } = await escribir(db().from("manuales").select("id").eq("proyecto_id", proyecto.id).order("orden"), "manuales");
    const orden = ordenCompleto((data ?? []).map((m) => m.id), Array.isArray(ids) ? ids.map(String) : []);
    await Promise.all(orden.map((id, k) => escribir(db().from("manuales").update({ orden: k }).eq("id", id).eq("proyecto_id", proyecto.id), "manuales")));
    revalidatePath("/manuales");
  });
}

// Cristian, 14 nov: el ajuste ⚙ de cada manual, qué mercados lo ven (al menos uno)
export async function guardarMercadosManual(id: string, mercados: unknown) {
  return seguro(async () => {
    const { proyecto } = await exigirEditor();
    const { data } = await escribir(db().from("manuales").update({ mercados: mercadosValidos(mercados) }).eq("id", id).eq("proyecto_id", proyecto.id).select("id"), "manuales");
    if (!data?.length) throw new ErrorUsuario("Manual no encontrado.");
    revalidatePath("/manuales");
  });
}
