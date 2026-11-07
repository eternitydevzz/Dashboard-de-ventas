import "server-only";
import { db } from "@/lib/datos";
import { ErrorUsuario } from "@/lib/resultado";
import { MAX_SUBIDA } from "@/lib/subir-cliente";

// Vercel no acepta peticiones de más de 4,5 MB: los archivos no pasan por el servidor de la app.
// El servidor da un enlace firmado (solo vale para esa ruta), el navegador sube directo a Supabase
// y la acción recibe solo la ruta. Cada bucket limita tamaño y tipo (migración 20261011090000).
const BUCKETS = {
  recursos: "pdf",
  importaciones: "csv",
  manuales: "html", // C9 (plan Callers, 7 nov)
  grabaciones: "webm|ogg|mp4|mp3", // C10: cada navegador graba en su formato
} as const;
export type BucketSubida = keyof typeof BUCKETS;

// Archivos subidos que nunca se guardaron (se cerró la pestaña justo antes, o falló la acción):
// se borran los de más de 1 día que no usa ningún recurso. Los CSV se borran al importarlos,
// así que en «importaciones» cualquiera de más de 1 día sobra. Se hace al preparar otra subida.
const UN_DIA = 86_400_000;
export async function limpiarSubidasHuerfanas(bucket: BucketSubida, proyectoId: string, ahora = Date.now()) {
  const { data: archivos, error } = await db().storage.from(bucket).list(proyectoId, { limit: 1000 });
  if (error || !archivos?.length) return 0;
  const viejos = archivos.filter((a) => a.created_at && ahora - new Date(a.created_at).getTime() > UN_DIA).map((a) => `${proyectoId}/${a.name}`);
  if (!viejos.length) return 0;
  let sobran = viejos;
  // Los PDF de recursos y los .html de manuales se quedan mientras los use alguno (C9: si no, se borraría el manual)
  if (bucket === "grabaciones") return 0; // C10: las grabaciones se guardan siempre (decidido); nunca se limpian
  if (bucket === "recursos" || bucket === "manuales") {
    const { data: usados } = await db().from(bucket).select("archivo_path").eq("proyecto_id", proyectoId).not("archivo_path", "is", null);
    const enUso = new Set((usados ?? []).map((u) => u.archivo_path));
    sobran = viejos.filter((r) => !enUso.has(r));
  }
  if (sobran.length) await db().storage.from(bucket).remove(sobran);
  return sobran.length;
}

export async function prepararSubida(bucket: BucketSubida, proyectoId: string, ext: string = BUCKETS[bucket].split("|")[0]) {
  if (!BUCKETS[bucket].split("|").includes(ext)) throw new ErrorUsuario("Tipo de archivo no válido.");
  try {
    await limpiarSubidasHuerfanas(bucket, proyectoId);
  } catch (e) {
    console.error("[subidas] no se pudo limpiar:", e); // no impide subir
  }
  const ruta = `${proyectoId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await db().storage.from(bucket).createSignedUploadUrl(ruta);
  if (error || !data) throw new Error(`No se pudo preparar la subida: ${error?.message}`);
  return { ruta, url: data.signedUrl };
}

// Solo rutas que haya podido crear prepararSubida para este proyecto
export function rutaDeSubidaValida(bucket: BucketSubida, ruta: string, proyectoId: string) {
  return new RegExp(`^${proyectoId}/[0-9a-f-]{36}\\.(${BUCKETS[bucket]})$`).test(ruta);
}

export async function leerSubida(bucket: BucketSubida, ruta: string, proyectoId: string): Promise<Blob> {
  if (!rutaDeSubidaValida(bucket, ruta, proyectoId)) throw new ErrorUsuario("Archivo no válido. Vuelve a elegirlo.");
  const { data, error } = await db().storage.from(bucket).download(ruta);
  if (error || !data) throw new ErrorUsuario("No se encontró el archivo subido. Vuelve a elegirlo.");
  if (data.size > MAX_SUBIDA) {
    await borrarSubida(bucket, ruta);
    throw new ErrorUsuario("El archivo pesa más de 15 MB.");
  }
  return data;
}

export async function borrarSubida(bucket: BucketSubida, ruta: string) {
  await db().storage.from(bucket).remove([ruta]);
}
