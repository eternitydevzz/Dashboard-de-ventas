"use server";

import { seguro } from "@/lib/resultado";
import { fichasDeLeads, guardarFichaDe, leerFichaDe } from "@/lib/ficha-cualificacion-datos";

// C6 (plan Callers, 7 nov): la ficha se pide solo para el lead elegido, al abrir su guion (no viaja con la cola)
export async function leerFicha(leadId: string) {
  return seguro(() => leerFichaDe(leadId));
}

// Sin refrescar la página: la ficha no sale en la cola y así escribir no vuelve a pedir toda la app
export async function guardarFicha(leadId: string, campos: unknown) {
  return seguro(() => guardarFichaDe(leadId, campos));
}

export async function fichasParaExportar(ids: string[]) {
  return seguro(() => fichasDeLeads(ids.filter((x) => typeof x === "string").slice(0, 5000)));
}
