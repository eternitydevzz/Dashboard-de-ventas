import "server-only";
// Encargo de Callers (plan Callers C11 punto 13; con el OK de Cristian, 7 nov 2026): cuando se agenda en la app, la cita
// se crea también en el calendario de GHL del closer y su id se guarda en citas.ghl_cita_id (así la lectura de cada
// minuto la reconoce y no la duplica). Decidido por Cristian: un calendario de GHL por closer (Integraciones GHL →
// «Calendario de GHL de cada closer»); los avisos del calendario (email y SMS) se mandan como si el lead reservara solo;
// si no se puede, la cita de la app se queda y se avisa. NUNCA lanza: devuelve { ok } o { ok: false, motivo }.
import { db } from "@/lib/datos";
import { descifrar } from "@/lib/cifrado";
import { crearCitaGhl, crearOActualizarContactoGhl } from "@/lib/ghl";

type Resultado = { ok: true; id: string } | { ok: false; motivo: string };

export async function crearCitaEnGhl(o: { proyectoId: string; citaId: string; leadId: string; closerId: string; fecha: string; fetchImpl?: typeof fetch }): Promise<Resultado> {
  try {
    const { data: p } = await db().from("proyectos").select("ghl_token, ghl_location_id, calendario").eq("id", o.proyectoId).single();
    if (!p?.ghl_token || !p.ghl_location_id) return { ok: false, motivo: "el proyecto no tiene GHL conectado" };
    const { data: m } = await db().from("miembros_proyecto").select("ghl_calendar_id, ghl_user_id, perfiles!inner(nombre)").eq("proyecto_id", o.proyectoId).eq("perfil_id", o.closerId).maybeSingle();
    const nombreCloser = (m as unknown as { perfiles?: { nombre?: string } } | null)?.perfiles?.nombre ?? "El closer";
    if (!m?.ghl_calendar_id) return { ok: false, motivo: `${nombreCloser} no tiene calendario de GHL (ponlo en Administración → Integraciones GHL)` };
    const token = descifrar(p.ghl_token, "el token de GHL");

    const { data: l } = await db().from("leads").select("nombre, apellido, email, telefono, ghl_contact_id").eq("id", o.leadId).single();
    if (!l) return { ok: false, motivo: "no se encontró el lead" };
    let contactId = l.ghl_contact_id as string | null;
    if (!contactId) {
      if (!l.email && !l.telefono) return { ok: false, motivo: "el lead no tiene email ni teléfono para GHL" };
      const c = await crearOActualizarContactoGhl({ token, locationId: p.ghl_location_id, contacto: { firstName: l.nombre ?? undefined, lastName: l.apellido ?? undefined, email: l.email ?? undefined, phone: l.telefono ?? undefined }, customFields: [], fetchImpl: o.fetchImpl });
      contactId = c.id;
      // Si ese contacto ya es de otro lead del proyecto (GHL une por teléfono), este no lo guarda (sería repetido)
      const { data: otro } = await db().from("leads").select("id").eq("proyecto_id", o.proyectoId).eq("ghl_contact_id", c.id).neq("id", o.leadId).limit(1).maybeSingle();
      if (!otro) await db().from("leads").update({ ghl_contact_id: c.id }).eq("id", o.leadId);
    }

    const minutos = Number((p.calendario as { duracion?: number } | null)?.duracion) || 30;
    const titulo = `Llamada con ${[l.nombre, l.apellido].filter(Boolean).join(" ") || l.email || "lead"}`;
    const id = await crearCitaGhl({ token, locationId: p.ghl_location_id, calendarId: m.ghl_calendar_id, contactId, inicio: new Date(o.fecha), minutos, titulo, usuarioId: m.ghl_user_id, fetchImpl: o.fetchImpl });
    const { error } = await db().from("citas").update({ ghl_cita_id: id }).eq("id", o.citaId);
    if (error) return { ok: false, motivo: `la cita se creó en GHL (${id}) pero no se pudo guardar su id: ${error.message}` };
    return { ok: true, id };
  } catch (e) {
    return { ok: false, motivo: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}
