import "server-only";
import { db } from "@/lib/datos";
import { calcularOferta, normalizarRespuestas } from "@/lib/oferta";
import type { Respuesta } from "@/lib/tipos";

// Bloque A: lo que hace falta de un lead para repasar su oferta. Desde que se quitó la pestaña «Biblioteca»
// (26 oct 2026), el repaso lo lanza la pestaña «Leads» (lib/leads-kpis.ts).
type FilaBiblioteca = { id: string; etiquetas: string[] | null; respuestas: Respuesta[] | null; fuente: string | null; oferta: string | null };

// Pone al día la oferta (y el nombre único de las preguntas) de los que no la tengan bien: así los leads que ya
// estaban antes de existir la oferta, o si la regla cambia, se ordenan solos al abrir KPIs → «Leads»
export async function recalcularOfertas(leads: FilaBiblioteca[]) {
  const cambiar = leads
    .map((l) => ({ l, oferta: calcularOferta(l), respuestas: normalizarRespuestas(l.respuestas ?? []) }))
    .filter(({ l, oferta, respuestas }) => oferta !== l.oferta || JSON.stringify(respuestas) !== JSON.stringify(l.respuestas ?? []));
  for (let i = 0; i < cambiar.length; i += 50) {
    await Promise.all(
      cambiar.slice(i, i + 50).map(async ({ l, oferta, respuestas }) => {
        const { error } = await db().from("leads").update({ oferta, respuestas }).eq("id", l.id);
        if (error) throw new Error(`No se pudo guardar la oferta: ${error.message}`);
        l.oferta = oferta;
        l.respuestas = respuestas;
      })
    );
  }
  return cambiar.length;
}
