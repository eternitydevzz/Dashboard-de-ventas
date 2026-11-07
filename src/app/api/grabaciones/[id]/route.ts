import { NextResponse, type NextRequest } from "next/server";
import { esJefe, getSesion } from "@/lib/auth";
import { puedeSeccion } from "@/lib/permisos";
import { db } from "@/lib/datos";

// C10 (plan Callers, 7 nov): escuchar o descargar una grabación. El caller, las suyas; los jefes, todas.
// Redirige a un enlace firmado de Supabase que vale 1 hora (el audio no pasa por Vercel).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { perfil, proyecto } = await getSesion();
  if (!(await puedeSeccion(perfil, proyecto.id, "grabaciones"))) return new Response("Sin acceso", { status: 403 });
  const { id } = await params;
  const { data: g } = await db().from("grabaciones_caller").select("archivo_path, perfil_id, creado_en").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle();
  if (!g || (!esJefe(perfil) && g.perfil_id !== perfil.id)) return new Response("Grabación no encontrada", { status: 404 });
  const descargar = req.nextUrl.searchParams.has("descargar");
  const nombre = `grabacion-${g.creado_en.slice(0, 16).replace(/[:T]/g, "-")}.${g.archivo_path.split(".").pop()}`;
  const { data, error } = await db().storage.from("grabaciones").createSignedUrl(g.archivo_path, 3600, descargar ? { download: nombre } : undefined);
  if (error || !data) return new Response("No se pudo abrir la grabación", { status: 502 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
