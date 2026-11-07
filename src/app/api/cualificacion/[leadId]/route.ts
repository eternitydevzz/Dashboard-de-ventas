import { guardarFichaDe } from "@/lib/ficha-cualificacion-datos";
import { ErrorUsuario } from "@/lib/resultado";

// C6 (7c.2): guardado al cerrar la pestaña o salir de la página. navigator.sendBeacon (o fetch keepalive) no puede
// llamar a una acción del servidor: manda aquí la ficha en JSON con las cookies de la sesión. Misma regla: idempotente.
export async function POST(req: Request, { params }: { params: Promise<{ leadId: string }> }) {
  // Solo desde la propia app (las acciones del servidor ya lo comprueban solas; esta ruta, a mano)
  const origen = req.headers.get("origin");
  if (origen && new URL(origen).host !== new URL(req.url).host) return new Response("Origen no válido", { status: 403 });
  const { leadId } = await params;
  let cuerpo: unknown;
  try {
    const texto = await req.text();
    if (texto.length > 40_000) return new Response("Demasiado grande", { status: 413 });
    cuerpo = JSON.parse(texto);
  } catch {
    return new Response("JSON no válido", { status: 400 });
  }
  try {
    const r = await guardarFichaDe(leadId, cuerpo);
    return Response.json(r);
  } catch (e) {
    if (e instanceof ErrorUsuario) return new Response(e.message, { status: 403 });
    console.error("[ficha] no se pudo guardar al salir:", e);
    return new Response("No se pudo guardar", { status: 500 });
  }
}
