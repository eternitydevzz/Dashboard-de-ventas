import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ErrorUsuario } from "@/lib/resultado";
import type { Sesion } from "@/lib/sesion";
import type { Perfil, Proyecto } from "@/lib/tipos";

// MCP, Fase 2 (11 nov 2026): claves personales (tabla claves_mcp). En la base solo está la huella, nunca la clave.
export function huellaClave(clave: string) {
  return createHash("sha256").update(clave).digest("hex");
}

// El perfil de una clave sin anular (null si no existe o está anulada)
export async function perfilDeClave(clave: string): Promise<string | null> {
  if (!clave) return null;
  const db = createAdminClient();
  const { data, error } = await db.from("claves_mcp").select("id, perfil_id").eq("huella", huellaClave(clave)).is("anulada_en", null).maybeSingle();
  if (error) throw new Error(`No se pudo leer claves_mcp: ${error.message}`);
  if (!data) return null;
  after(async () => {
    await db.from("claves_mcp").update({ ultimo_uso: new Date().toISOString() }).eq("id", data.id);
  });
  return data.perfil_id as string;
}

// Como sesionDe (lib/sesion.ts), pero sin cookies ni redirect(): el proyecto se dice en cada herramienta.
// Con un solo proyecto, ese; con varios, hay que decir cuál (nunca se elige uno a ciegas).
export async function sesionMcpDe(perfilId: string, proyecto?: string): Promise<Sesion> {
  const db = createAdminClient();
  const { data: perfil, error } = await db.from("perfiles").select("*").eq("id", perfilId).maybeSingle<Perfil>();
  if (error) throw new Error(`No se pudo leer el perfil: ${error.message}`);
  if (!perfil || !perfil.activo) throw new ErrorUsuario("Tu usuario está desactivado.");
  const lectura =
    perfil.rol === "ceo"
      ? await db.from("proyectos").select("*").order("creado_en")
      : await db.from("miembros_proyecto").select("proyectos(*)").eq("perfil_id", perfilId);
  if (lectura.error) throw new Error(`No se pudieron leer los proyectos: ${lectura.error.message}`);
  const proyectos: Proyecto[] =
    perfil.rol === "ceo" ? ((lectura.data ?? []) as Proyecto[]) : ((lectura.data ?? []) as unknown as { proyectos: Proyecto }[]).map((m) => m.proyectos);
  if (!proyectos.length) throw new ErrorUsuario("No tienes ningún proyecto.");
  const buscado = proyecto?.trim().toLowerCase();
  const elegido = buscado ? proyectos.find((p) => p.id === proyecto?.trim() || p.nombre.toLowerCase() === buscado) : proyectos.length === 1 ? proyectos[0] : undefined;
  if (buscado && !elegido) throw new ErrorUsuario(`No tienes ese proyecto. Los tuyos: ${proyectos.map((p) => p.nombre).join(", ")}.`);
  if (!elegido) throw new ErrorUsuario(`Di el proyecto: ${proyectos.map((p) => p.nombre).join(" o ")}.`);
  return { perfil, proyectos, proyecto: elegido };
}
