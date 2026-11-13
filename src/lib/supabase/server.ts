import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// N4 (Cristian, 13 nov 2026): casilla «Mantener la sesión iniciada». Desmarcada, el login deja esta marca (cookie de
// sesión del navegador) y las cookies de Supabase se guardan sin caducidad: se borran al cerrar el navegador.
export const COOKIE_SESION_CORTA = "eternity_sesion_corta";

// Sin Max-Age ni Expires = cookie de sesión. Un borrado (maxAge 0) se deja tal cual para que siga borrando.
export function opcionesCookie(options: CookieOptions, corta: boolean): CookieOptions {
  if (!corta || options.maxAge === 0) return options;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { maxAge, expires, ...resto } = options;
  return resto;
}

// Cliente con la sesión del usuario (cookies). Solo se usa para Auth:
// saber quién es el usuario, iniciar y cerrar sesión.
// `corta`: solo lo pasa el login (la marca aún no está en la petición); si no, se lee de la marca.
export async function createSessionClient(corta?: boolean) {
  const cookieStore = await cookies();
  const sesionCorta = corta ?? cookieStore.get(COOKIE_SESION_CORTA)?.value === "1";
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(lista) {
          try {
            lista.forEach(({ name, value, options }) => cookieStore.set(name, value, opcionesCookie(options, sesionCorta)));
          } catch {
            // Desde un Server Component no se pueden escribir cookies;
            // el proxy ya refresca la sesión en cada petición.
          }
        },
      },
    }
  );
}
