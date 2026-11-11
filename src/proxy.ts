import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { CSP_VISOR, politicaCsp } from "@/lib/csp";

// Refresca la sesión de Supabase en cada petición y manda al login
// a quien no ha iniciado sesión. Los permisos reales se comprueban
// en el servidor (src/lib/auth.ts), no aquí.
export async function proxy(request: NextRequest) {
  // Plan GHL, fase 3: el programador de Supabase llama cada 30 s sin sesión; la ruta comprueba la clave del proyecto.
  // Se deja pasar sin preguntar la sesión a Supabase (una llamada menos cada 30 s).
  // F2: el email diario del CEO lo llama el programador igual (06:00 y 07:00 UTC)
  // MCP, Fase 2 (11 nov 2026): Claude Code llama sin sesión del navegador; la ruta comprueba la clave personal.
  const ruta0 = request.nextUrl.pathname;
  if (ruta0.startsWith("/api/ghl/leer/") || ruta0.startsWith("/api/avisos/diario/") || ruta0 === "/api/mcp") return NextResponse.next();
  // Arreglo 36: un nonce nuevo en cada petición; Next lo lee de la cabecera CSP de la petición
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = politicaCsp(nonce);
  const cabeceras = () => {
    const h = new Headers(request.headers);
    h.set("x-nonce", nonce);
    h.set("Content-Security-Policy", csp);
    return h;
  };
  let response = NextResponse.next({ request: { headers: cabeceras() } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista) {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: cabeceras() } });
          lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Velocidad (17 oct 2026): getClaims verifica la sesión aquí mismo con la clave pública de Supabase (ES256),
  // sin preguntar a Supabase en cada petición (medido: ~0,3 s por página con getUser). Si está a punto de
  // caducar, la renueva igual. Un usuario desactivado se corta igual: getSesion mira perfil.activo en la base.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub;

  const ruta = request.nextUrl.pathname;
  const publica = ruta.startsWith("/login") || ruta.startsWith("/api/webhooks") || ruta === "/auth/confirm"; // bloque 6: enlace mágico
  if (!user && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // C9: un manual (/api/manuales/<id>) va con su propia política, aislado de la app (lib/csp.ts)
  response.headers.set("Content-Security-Policy", ruta.startsWith("/api/manuales/") ? CSP_VISOR : csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|marca/).*)"],
};
