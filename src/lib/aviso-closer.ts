import "server-only";
import { db } from "@/lib/datos";
import { enviarEmail, urlApp } from "@/lib/email";
import { plantillaEmail } from "@/lib/plantilla-email";
import { fechaHora } from "@/lib/formato";
import { zonaPersona } from "@/lib/zona-persona";

// Fase 3 (Cristian, 13 nov): al closer le llega cada agenda nueva o cambiada (popup de la bienvenida vía
// avisos_persona y email). NUNCA lanza: un aviso que falla no puede romper guardar la cita.
export async function avisarCloserAgenda(o: { proyectoId: string; closerId: string; citaId: string; motivo: "nueva" | "cambio" }) {
  try {
    const [cita, closer, proyecto] = await Promise.all([
      db().from("citas").select("fecha, leads(nombre, apellido)").eq("id", o.citaId).single(),
      db().from("perfiles").select("nombre, email, rol, zona_horaria").eq("id", o.closerId).single(),
      db().from("proyectos").select("zona_horaria").eq("id", o.proyectoId).single(),
    ]);
    const error = cita.error ?? closer.error ?? proyecto.error;
    if (error || !cita.data || !closer.data || !proyecto.data) throw new Error(error?.message ?? "faltan datos");
    const l = cita.data.leads as unknown as { nombre: string | null; apellido: string | null } | null;
    const lead = [l?.nombre, l?.apellido].filter(Boolean).join(" ") || "un lead";
    const hora = fechaHora(cita.data.fecha, { zona_horaria: zonaPersona(closer.data, proyecto.data) });
    const titulo = `${o.motivo === "nueva" ? "Nueva agenda" : "Agenda cambiada"}: ${lead}`;
    const texto = `Llamada con ${lead} el ${hora}.`;
    const enlace = "/closer/llamadas";

    const { error: errAviso } = await db().from("avisos_persona").insert({ proyecto_id: o.proyectoId, perfil_id: o.closerId, tipo: "agenda", titulo, texto, enlace });
    if (errAviso) console.error("[aviso-closer] no se pudo guardar el aviso:", errAviso.message);

    if (!closer.data.email) return;
    const url = `${urlApp()}${enlace}`;
    const r = await enviarEmail({
      para: [closer.data.email],
      asunto: titulo,
      texto: `${texto}\n${url}`,
      html: plantillaEmail({ titulo, intro: texto, filas: [["Lead", lead], ["Hora", hora]], boton: { texto: "Ver mis agendas", url }, urlBase: urlApp() }),
    });
    if (!r.enviado) console.error("[aviso-closer] no se pudo mandar el email:", r.motivo);
  } catch (e) {
    console.error("[aviso-closer]", e instanceof Error ? e.message : e);
  }
}
