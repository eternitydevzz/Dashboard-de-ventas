import "server-only";
import { db, todas } from "@/lib/datos";
import { descifrar } from "@/lib/cifrado";
import { conciliarGrabacion, reunionesFathom, type CitaC } from "@/lib/fathom";
import { encolarAnalisis } from "@/lib/ia";

type Cuenta = { id: string; proyecto_id: string; perfil_id: string; nombre: string; api_key: string; formato_titulo: string | null; sincronizado_en: string | null };

// Trae las grabaciones nuevas de cada cuenta (desde la última vez − 1 día; la primera vez, 60 días)
// y concilia las pendientes. Lo ya conciliado o descartado no se toca.
export async function sincronizarFathom(proyectoId: string, o: { perfilIds?: string[]; fetchImpl?: typeof fetch; ahora?: Date } = {}) {
  const ahora = o.ahora ?? new Date();
  let q = db().from("cuentas_fathom").select("*").eq("proyecto_id", proyectoId);
  if (o.perfilIds) q = q.in("perfil_id", o.perfilIds.length ? o.perfilIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: cuentas } = await q;
  const res: { cuenta: string; nuevas: number; conciliadas: number; error?: string }[] = [];
  for (const c of (cuentas ?? []) as Cuenta[]) {
    try {
      const desde = new Date(c.sincronizado_en ? new Date(c.sincronizado_en).getTime() - 86_400_000 : ahora.getTime() - 60 * 86_400_000);
      const reuniones = await reunionesFathom({ apiKey: descifrar(c.api_key, "la API key de Fathom"), desde, fetchImpl: o.fetchImpl });
      const { data: ya } = await db().from("grabaciones").select("recording_id").eq("proyecto_id", proyectoId).in("recording_id", reuniones.length ? reuniones.map((r) => r.recording_id) : [-1]);
      const existentes = new Set((ya ?? []).map((x) => Number(x.recording_id)));
      if (reuniones.length) {
        // Solo los datos de Fathom: la conciliación (cita_id, conciliacion) no se pisa
        await db().from("grabaciones").upsert(
          reuniones.map((r) => ({
            proyecto_id: proyectoId,
            cuenta_id: c.id,
            closer_id: c.perfil_id,
            recording_id: r.recording_id,
            titulo: r.title ?? r.meeting_title ?? null,
            // Solo enlaces https (vienen de fuera y se ponen en la página)
            url: r.url && /^https:\/\//i.test(r.url) ? r.url : null,
            share_url: r.share_url && /^https:\/\//i.test(r.share_url) ? r.share_url : null,
            inicio: r.scheduled_start_time ?? r.recording_start_time ?? null,
            fin: r.scheduled_end_time ?? r.recording_end_time ?? null,
            invitados: (r.calendar_invitees ?? []).map((i) => ({ name: i.name ?? null, email: i.email ?? null, is_external: i.is_external ?? true })),
            resumen: r.default_summary?.markdown_formatted ?? null,
            transcripcion: r.transcript ?? null,
          })),
          { onConflict: "proyecto_id,recording_id" }
        );
      }
      const conciliadas = await conciliarPendientes(proyectoId, c.perfil_id, c.formato_titulo);
      const resultado = `${reuniones.length - existentes.size} nuevas · ${conciliadas} conciliadas solas`;
      await db().from("cuentas_fathom").update({ sincronizado_en: ahora.toISOString(), ultimo_resultado: resultado }).eq("id", c.id);
      res.push({ cuenta: c.nombre, nuevas: reuniones.length - existentes.size, conciliadas });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      await db().from("cuentas_fathom").update({ ultimo_resultado: `Error: ${msg}` }).eq("id", c.id);
      res.push({ cuenta: c.nombre, nuevas: 0, conciliadas: 0, error: msg });
    }
  }
  return res;
}

async function conciliarPendientes(proyectoId: string, closerId: string, formato: string | null) {
  const { data: pend } = await db().from("grabaciones").select("id, inicio, titulo, invitados").eq("proyecto_id", proyectoId).eq("closer_id", closerId).eq("conciliacion", "pendiente");
  if (!pend?.length) return 0;
  const citas = await todas<{ id: string; fecha: string; closer_id: string | null; leads: { nombre: string; apellido: string; email: string | null } | null }>((a, b) =>
    db().from("citas").select("*, leads(nombre, apellido, email)").eq("proyecto_id", proyectoId).eq("closer_id", closerId).order("id").range(a, b)
  );
  // Una cita ya unida a otra grabación no se vuelve a usar
  const { data: usadas } = await db().from("grabaciones").select("cita_id").eq("proyecto_id", proyectoId).not("cita_id", "is", null);
  const ocupadas = new Set((usadas ?? []).map((x) => x.cita_id));
  const libres: CitaC[] = citas.filter((c) => !ocupadas.has(c.id)).map((c) => ({ id: c.id, fecha: c.fecha, closer_id: c.closer_id, lead: c.leads ? { nombre: `${c.leads.nombre} ${c.leads.apellido ?? ""}`.trim(), email: c.leads.email } : null }));
  let n = 0;
  for (const g of pend) {
    const r = conciliarGrabacion({ inicio: g.inicio, titulo: g.titulo, invitados: (g.invitados ?? []) as { email?: string; is_external?: boolean }[] }, libres.filter((c) => !ocupadas.has(c.id)), formato);
    if (r.cita_id) {
      ocupadas.add(r.cita_id);
      n++;
      await db().from("grabaciones").update({ cita_id: r.cita_id, conciliacion: "auto", motivo: r.motivo }).eq("id", g.id);
      await encolarAnalisis(proyectoId, g.id); // decisión de Cristian: se analiza sola al conciliar
    } else await db().from("grabaciones").update({ motivo: r.motivo }).eq("id", g.id);
  }
  return n;
}
