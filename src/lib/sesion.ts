import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enMemoria, UN_MINUTO } from "@/lib/memoria";
import { sesionMcp } from "@/lib/mcp/sesion-mcp";
import type { Perfil, Proyecto } from "@/lib/tipos";

// Sesión del usuario: separada de los permisos para poder simularla en los tests.
export const COOKIE_PROYECTO = "eternity_proyecto";

export type Sesion = {
  perfil: Perfil;
  proyectos: Proyecto[];
  proyecto: Proyecto;
};

// Lee el usuario, su perfil y sus proyectos. Una sola vez por petición.
// MCP, Fase 2 (11 nov 2026): dentro de una petición del MCP, la sesión es la de la clave (lib/mcp/sesion-mcp.ts).
// Va fuera de cache() para que nunca se mezcle con la del navegador.
export const getSesion = async (): Promise<Sesion> => sesionMcp() ?? getSesionNavegador();

const getSesionNavegador = cache(async (): Promise<Sesion> => {
  const supabase = await createSessionClient();
  // Velocidad (17 oct 2026): verificación local de la sesión (ver src/proxy.ts), sin preguntar a Supabase
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return sesionDe(userId);
});

// El perfil y los proyectos de una persona (también lo usa el login, para ir directo a su sección; 17 oct 2026)
export async function sesionDe(userId: string): Promise<Sesion> {
  const db = createAdminClient();
  // Velocidad (17 oct 2026): las 3 consultas a la vez (antes, perfil y después sus proyectos; medido 41–100 ms en
  // todas las páginas). Se piden los dos tipos de proyectos y se usa el que toca según el rol: mismo resultado y orden.
  // 25 oct 2026: los proyectos se guardan 1 minuto en memoria (lib/memoria.ts); el perfil se lee siempre al momento
  // (así desactivar a alguien o terminar el onboarding se aplican enseguida)
  // 25 oct 2026 (Cristian): con la base caída salía «Tu usuario está desactivado» (o «sin proyecto»). Si la base no
  // responde, se dice eso; «desactivado» solo cuando la base contesta y el perfil no existe (PGRST116 = ninguna fila)
  // o está apagado. Un fallo de los proyectos no se guarda en la memoria (lanza error).
  const sinFallo = <T,>({ data, error }: { data: T; error: { message: string } | null }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  let leido;
  try {
    leido = await Promise.all([
      db.from("perfiles").select("*").eq("id", userId).single<Perfil>(),
      enMemoria("proyectos", UN_MINUTO, async () => sinFallo(await db.from("proyectos").select("*").order("creado_en"))),
      enMemoria(`proyectos-de:${userId}`, UN_MINUTO, async () => sinFallo(await db.from("miembros_proyecto").select("proyectos(*)").eq("perfil_id", userId))),
    ]);
  } catch (e) {
    console.error("[sesión] no se pudieron leer los proyectos:", e instanceof Error ? e.message : e);
    redirect("/login?error=sin-conexion");
  }
  const [{ data: perfil, error }, todos, suyos] = leido;
  if (error && error.code !== "PGRST116") {
    console.error("[sesión] no se pudo leer el perfil:", error.message);
    redirect("/login?error=sin-conexion");
  }
  if (!perfil || !perfil.activo) redirect("/login?error=sin-acceso");

  const proyectos: Proyecto[] =
    perfil.rol === "ceo"
      ? ((todos ?? []) as Proyecto[])
      : ((suyos ?? []) as unknown as { proyectos: Proyecto }[]).map((m) => m.proyectos);
  if (proyectos.length === 0) redirect("/login?error=sin-proyecto");

  const elegido = (await cookies()).get(COOKIE_PROYECTO)?.value;
  const proyecto = proyectos.find((p) => p.id === elegido) ?? proyectos[0];
  return { perfil, proyectos, proyecto };
}
