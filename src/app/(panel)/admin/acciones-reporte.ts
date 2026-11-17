"use server";

import { exigir, puedeAdmin } from "@/lib/auth";
import { db, escribir } from "@/lib/datos";
import { refrescarPantalla } from "@/lib/refrescar";
import { seguro } from "@/lib/resultado";
import { validarConfig } from "@/lib/reporte-config";
import type { MercadoReporte } from "@/lib/tipos";

// Fase C (reporte diario): guarda el reporte de un mercado (España = «es», USA = «latam») del proyecto actual.
// Como las demás de Administración: solo el CEO o un director con Administración. Todo se valida aquí (validarConfig).
export async function guardarConfigReporte(mercado: MercadoReporte, entrada: unknown) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const c = validarConfig(entrada, mercado);
    await escribir(
      db()
        .from("reporte_config")
        .upsert(
          { proyecto_id: proyecto.id, mercado: c.mercado, activo: c.activo, hora: c.hora, emails: c.emails, whatsapps: c.whatsapps, partes: c.partes, actualizado_en: new Date().toISOString() },
          { onConflict: "proyecto_id,mercado" }
        ),
      "reporte_config"
    );
    refrescarPantalla();
  });
}
