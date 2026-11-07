import { exigirOk } from "@/lib/resultado-cliente";

export const MAX_SUBIDA = 15 * 1024 * 1024;

// En el navegador: saca el archivo del formulario, lo sube directo a Supabase con el enlace
// firmado que da `preparar` (una acción del servidor) y deja en su lugar `${campo}_ruta`.
// Así la petición a la app nunca lleva el archivo (Vercel corta a partir de 4,5 MB).
export async function subirDelFormulario(
  fd: FormData,
  campo: string,
  tipo: "application/pdf" | "text/csv" | "text/html",
  preparar: () => Promise<{ ruta: string; url: string } | { error: string }>
) {
  const archivo = fd.get(campo);
  fd.delete(campo);
  if (!(archivo instanceof File) || archivo.size === 0) throw new Error(tipo === "application/pdf" ? "Elige un PDF." : tipo === "text/html" ? "Elige un archivo .html." : "Elige un archivo CSV.");
  if (archivo.size > MAX_SUBIDA) throw new Error("El archivo pesa más de 15 MB.");
  const { ruta, url } = await exigirOk(preparar());
  let r: Response;
  try {
    r = await fetch(url, { method: "PUT", headers: { "content-type": tipo, "x-upsert": "false" }, body: archivo });
  } catch {
    throw new Error("No se pudo subir el archivo. Revisa la conexión e inténtalo de nuevo.");
  }
  if (!r.ok) throw new Error(r.status === 413 ? "El archivo pesa más de 15 MB." : "No se pudo subir el archivo. Inténtalo de nuevo.");
  fd.set(`${campo}_ruta`, ruta);
}
