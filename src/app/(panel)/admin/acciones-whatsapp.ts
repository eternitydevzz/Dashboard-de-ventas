"use server";

import { exigir, puedeAdmin } from "@/lib/auth";
import { db, escribir } from "@/lib/datos";
import { olvidarTodo } from "@/lib/memoria";
import { refrescarPantalla } from "@/lib/refrescar";
import { seguro } from "@/lib/resultado";
import { grupoValido, validarConfigWhatsapp } from "@/lib/whatsapp-config";
import type { EventoWhatsapp } from "@/lib/tipos";

// Fase D (Jose, 17 nov 2026): la pestaña «WhatsApp» de Administración. Como las demás de Administración:
// solo el CEO o un director con Administración. Todo se valida aquí (validarConfigWhatsapp y grupoValido).

// Un aviso (cita agendada o venta cerrada) del proyecto actual: si está encendido y a quién se manda
export async function guardarConfigWhatsapp(evento: EventoWhatsapp, entrada: unknown) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const c = validarConfigWhatsapp(entrada, evento);
    await escribir(
      db()
        .from("whatsapp_config")
        .upsert(
          { proyecto_id: proyecto.id, evento: c.evento, activo: c.activo, a_closer: c.a_closer, a_caller: c.a_caller, a_grupo: c.a_grupo, actualizado_en: new Date().toISOString() },
          { onConflict: "proyecto_id,evento" }
        ),
      "whatsapp_config"
    );
    refrescarPantalla();
  });
}

// El id del grupo de WhatsApp de los CEO del proyecto actual (vacío = sin grupo)
export async function guardarGrupoWhatsapp(grupo: unknown) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const whatsapp_grupo = grupoValido(grupo);
    await escribir(db().from("proyectos").update({ whatsapp_grupo }).eq("id", proyecto.id), "proyectos");
    olvidarTodo(); // el proyecto de la sesión está en la memoria de 1 minuto (lib/sesion.ts): que se vea al momento
    refrescarPantalla();
  });
}
