// Plan GHL F3 (Cristian, 8 nov 2026): los errores que antes solo iban a console.error se guardan en `errores_app`
// (mismo sitio y texto = una fila con contador; migración 20261109130100) y salen en los avisos del CEO.
// Sin "server-only" ni supabase-js: resultado.ts también lo cargan componentes de cliente. Solo actúa en el servidor
// (en el navegador no existe la clave secreta). Nunca lanza: si no se puede guardar, solo console.error.
export async function guardarError(sitio: string, texto: string, proyectoId: string | null = null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SECRET_KEY;
  if (typeof window !== "undefined" || !url || !clave) return;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/registrar_error_app`, {
      method: "POST",
      headers: { apikey: clave, authorization: `Bearer ${clave}`, "content-type": "application/json" },
      body: JSON.stringify({ p_proyecto: proyectoId, p_sitio: sitio, p_texto: texto }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) console.error("[errores-app] no se pudo guardar el error:", r.status);
  } catch (e) {
    console.error("[errores-app] no se pudo guardar el error:", e instanceof Error ? e.message : e);
  }
}
