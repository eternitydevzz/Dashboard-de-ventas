import { getSesion } from "@/lib/auth";
import { db } from "@/lib/datos";
import { rutaFotoValida } from "../../../foto-zona";

// N3 (13 nov 2026): la foto de perfil, para quien ha entrado. El espacio «fotos» es privado y la CSP de la app
// solo deja imágenes de 'self', así que se sirve desde aquí. Cada foto nueva tiene otra ruta: se guarda sin caducar.
export async function GET(_req: Request, { params }: { params: Promise<{ perfil: string; archivo: string }> }) {
  await getSesion(); // corta a quien no ha entrado o está desactivado
  const { perfil, archivo } = await params;
  const ruta = `${perfil}/${archivo}`;
  if (!rutaFotoValida(ruta)) return new Response("Foto no válida", { status: 404 });
  const { data, error } = await db().storage.from("fotos").download(ruta);
  if (error || !data) return new Response("Foto no encontrada", { status: 404 });
  return new Response(data, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" } });
}
