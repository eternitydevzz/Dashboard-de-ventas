import { getSesion } from "@/lib/auth";
import { puedeSeccion } from "@/lib/permisos";
import { db } from "@/lib/datos";
import { CSP_VISOR, htmlParaVisor } from "@/lib/manuales";

// C9 (plan Callers, 7 nov): el .html de un manual, aislado (ver CSP_VISOR en lib/manuales.ts). La página
// /manuales lo enseña en un <iframe sandbox>; «Pantalla completa» lo abre aquí en otra pestaña, igual de aislado.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { perfil, proyecto } = await getSesion();
  if (!(await puedeSeccion(perfil, proyecto.id, "manuales"))) return new Response("Sin acceso", { status: 403 });
  const { id } = await params;
  const { data: m } = await db().from("manuales").select("archivo_path").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle();
  if (!m) return new Response("Manual no encontrado", { status: 404 });
  const { data: archivo, error } = await db().storage.from("manuales").download(m.archivo_path);
  if (error || !archivo) return new Response("No se pudo leer el manual", { status: 502 });
  return new Response(htmlParaVisor(await archivo.text()), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CSP_VISOR,
      "X-Frame-Options": "SAMEORIGIN",
      "Cache-Control": "private, max-age=300",
    },
  });
}
