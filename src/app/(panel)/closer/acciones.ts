"use server";

import { closerLibreA } from "@/lib/agenda-libre";
import { TEXTO_MOTIVO } from "@/lib/disponibilidad";
import { exigirSeccion } from "@/lib/permisos";
import { ErrorUsuario, notaValida, seguro } from "@/lib/resultado";
import { revalidatePath } from "next/cache";
import { getSesion, esJefe, exigir } from "@/lib/auth";
import { descifrar } from "@/lib/cifrado";
import { borrarCitaGhl, cambiarUsuarioCitaGhl } from "@/lib/ghl";
import { db, registrarActividad, todas, escribir } from "@/lib/datos";
import { localAIso, ETIQUETA_ESTADO_CITA } from "@/lib/formato";
import { estrellasEntre } from "@/lib/estrellas";
import type { Cita, EstadoCita } from "@/lib/tipos";
import { datosAgendaGhl, telefonoClave } from "@/lib/leads";

// Arreglo 31: «cerrada» no se puede poner a mano: una cita se cierra registrando su venta
const PERMITIDOS: EstadoCita[] = ["pendiente", "confirmacion_pendiente", "confirmada", "no_califica", "seguimiento", "no_show", "cancelada", "perdida"];
// El arreglo 32 se quitó (Cristian, 10 oct 2026, Paso H6): cualquier cita se reagenda desde el tablero de
// Post-call. Solo la cerrada no, porque tiene su venta (para eso se arrastra la venta, que la borra).
const NO_REAGENDABLES: EstadoCita[] = ["cerrada"];
// Después de la llamada el closer dice qué tal prospecto era (1 a 5); «No califica» = 1.
const PIDEN_ESTRELLAS: EstadoCita[] = ["seguimiento", "perdida"];

async function citaPermitida(citaId: string) {
  const { perfil, proyecto } = await getSesion();
  const { data: cita } = await db().from("citas").select("*").eq("id", citaId).eq("proyecto_id", proyecto.id).maybeSingle<Cita>();
  if (!cita) throw new ErrorUsuario("Cita no encontrada.");
  if (!esJefe(perfil) && cita.closer_id !== perfil.id) throw new ErrorUsuario("Esta cita no es tuya.");
  return { cita, perfil, proyecto };
}

export async function cambiarEstadoCita(citaId: string, estado: EstadoCita, nota: string, estrellas?: number) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    nota = notaValida(nota);
    if (!PERMITIDOS.includes(estado)) throw new ErrorUsuario("Estado no válido.");
    const { cita, perfil, proyecto } = await citaPermitida(citaId);
    const n = estado === "no_califica" ? 1 : PIDEN_ESTRELLAS.includes(estado) ? estrellasEntre(estrellas, 1, 5) : null;
    await escribir(db().from("citas").update({ estado, nota: nota || cita.nota, ...(n ? { estrellas_closer: n } : {}) }).eq("id", citaId), "citas");
    await registrarActividad({
      proyecto_id: proyecto.id,
      lead_id: cita.lead_id,
      perfil_id: perfil.id,
      tipo: "cita",
      resultado: estado,
      nota: `Cita → ${ETIQUETA_ESTADO_CITA[estado]}${n ? ` · ${n}★` : ""}${nota ? ` · ${nota}` : ""}`,
    });
    // Mover el lead en el CRM según el resultado
    const columna: Partial<Record<EstadoCita, string[]>> = {
      seguimiento: ["en seguimiento", "seguimiento"],
      perdida: ["descartados", "descartado"],
      no_califica: ["descartados", "descartado"],
    };
    const nombres = columna[estado];
    if (nombres) {
      const { data: lead } = await db().from("leads").select("id, pipeline_id").eq("id", cita.lead_id).single();
      if (lead?.pipeline_id) {
        const { data: etapas } = await db().from("etapas").select("id, nombre").eq("pipeline_id", lead.pipeline_id);
        const destino = (etapas ?? []).find((e) => nombres.includes(e.nombre.toLowerCase()));
        if (destino) await db().from("leads").update({ etapa_id: destino.id }).eq("id", lead.id);
      }
    }
    revalidatePath("/", "layout");
  });
}

export async function reagendarCita(citaId: string, fechaLocal: string) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { cita, perfil, proyecto } = await citaPermitida(citaId);
    if (NO_REAGENDABLES.includes(cita.estado)) throw new ErrorUsuario(`Esta cita ya está «${ETIQUETA_ESTADO_CITA[cita.estado]}»: no se puede reagendar. Crea una llamada nueva desde el lead.`);
    // 4.4 (Cristian, 11 oct): también las citas de GHL se reagendan aquí (la app es el CRM; GHL solo trae datos).
    // La nueva cita no lleva el id de GHL, así la sincronización no le cambia la hora.
    if (!fechaLocal) throw new ErrorUsuario("Elige la nueva fecha.");
    const fecha = localAIso(fechaLocal, proyecto.zona_horaria);
    // Bloque 3 (Cristian, 11 oct 2026): se queda el mismo closer; si no está libre a la nueva hora, se elige otra.
    // Si el closer aún no tiene horario puesto no se puede comprobar su horario, pero sí que no choque con otra cita.
    if (cita.closer_id) {
      const libre = await closerLibreA(proyecto, cita.closer_id, new Date(fecha), { sinCita: citaId, sinHorarioLibre: true });
      if (!libre.libre) {
        throw new ErrorUsuario(`No está libre a esa hora: ${TEXTO_MOTIVO[libre.motivo].toLowerCase()}. Elige otra hora.`);
      }
    }
    await escribir(db().from("citas").update({ estado: "reagendada" }).eq("id", citaId), "citas");
    await escribir(db().from("citas").insert({
      proyecto_id: proyecto.id,
      lead_id: cita.lead_id,
      closer_id: cita.closer_id,
      agendada_por: cita.agendada_por ?? perfil.id, // la agenda sigue siendo mérito de quien la consiguió
      fecha,
      nota: cita.nota,
    }), "citas");
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: cita.lead_id, perfil_id: perfil.id, tipo: "cita", resultado: "reagendada", nota: "Cita reagendada" });
    revalidatePath("/", "layout");
  });
}

// Cristian (10 nov 2026): el CEO cambia el closer de una cita o la borra. Si la cita está en GHL, primero se escribe
// allí (si GHL falla, la app no cambia): si no, la lectura de cada minuto la devolvería al closer anterior o la traería otra vez.
async function citaDelCeo(citaId: string) {
  await exigirSeccion("agendas");
  const { proyecto, perfil } = await exigir((p) => p.rol === "ceo");
  const { data: cita } = await db().from("citas").select("*").eq("id", citaId).eq("proyecto_id", proyecto.id).maybeSingle<Cita & { ghl_cita_id: string | null }>();
  if (!cita) throw new ErrorUsuario("Cita no encontrada.");
  const { data: p } = await db().from("proyectos").select("ghl_token").eq("id", proyecto.id).single();
  const token = () => {
    if (!p?.ghl_token) throw new ErrorUsuario("Esta cita está en GHL y el proyecto no tiene GHL conectado.");
    return descifrar(p.ghl_token, "el token de GHL");
  };
  return { cita, proyecto, perfil, token };
}

const errorGhl = (e: unknown) => new ErrorUsuario(`GHL no lo aceptó, no se ha cambiado nada: ${e instanceof Error ? e.message : String(e)}`);

export async function cambiarCloserCita(citaId: string, closerId: string) {
  return seguro(async () => {
    const { cita, proyecto, perfil, token } = await citaDelCeo(citaId);
    if (cita.closer_id === closerId) throw new ErrorUsuario("Ya es su closer.");
    const { data: m } = await db().from("miembros_proyecto").select("ghl_user_id, perfiles!inner(nombre, rol)").eq("proyecto_id", proyecto.id).eq("perfil_id", closerId).maybeSingle();
    const nuevo = m as unknown as { ghl_user_id: string | null; perfiles: { nombre: string; rol: string } } | null;
    if (!nuevo || nuevo.perfiles.rol !== "closer") throw new ErrorUsuario("Elige un closer de este proyecto.");
    if (cita.ghl_cita_id) {
      if (!nuevo.ghl_user_id) throw new ErrorUsuario(`${nuevo.perfiles.nombre} no tiene usuario de GHL: ponlo en su ficha antes de pasarle citas de GHL.`);
      try { await cambiarUsuarioCitaGhl({ token: token(), citaId: cita.ghl_cita_id, usuarioId: nuevo.ghl_user_id }); } catch (e) { throw errorGhl(e); }
    }
    await escribir(db().from("citas").update({ closer_id: closerId }).eq("id", citaId), "citas");
    await escribir(db().from("leads").update({ closer_id: closerId }).eq("id", cita.lead_id), "leads");
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: cita.lead_id, perfil_id: perfil.id, tipo: "cita", resultado: "closer", nota: `Cita pasada a ${nuevo.perfiles.nombre}` });
    revalidatePath("/", "layout");
  });
}

export async function borrarCita(citaId: string) {
  return seguro(async () => {
    const { cita, proyecto, perfil, token } = await citaDelCeo(citaId);
    if (cita.estado === "cerrada") throw new ErrorUsuario("Esta cita tiene su venta: no se puede borrar.");
    if (cita.ghl_cita_id) {
      try { await borrarCitaGhl({ token: token(), citaId: cita.ghl_cita_id }); } catch (e) { throw errorGhl(e); }
    }
    await escribir(db().from("citas").delete().eq("id", citaId), "citas");
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: cita.lead_id, perfil_id: perfil.id, tipo: "cita", resultado: "borrada", nota: "Cita borrada" });
    revalidatePath("/", "layout");
  });
}

// ---------- Llamadas (V2-2) ----------
// Buscar un lead para «Crear llamada»: los jefes buscan en todo el proyecto; el closer, en los suyos.
export async function buscarLeadsParaLlamada(q: string) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { perfil, proyecto } = await getSesion();
    if (!esJefe(perfil) && perfil.rol !== "closer") throw new ErrorUsuario("Sin permiso.");
    const t = q.trim().replace(/[%,()]/g, " ").slice(0, 60);
    if (t.length < 2) return [];
    let consulta = db()
      .from("leads")
      .select("id, nombre, apellido, telefono, email")
      .eq("proyecto_id", proyecto.id)
      .or(`nombre.ilike.%${t}%,apellido.ilike.%${t}%,email.ilike.%${t}%,telefono.ilike.%${t}%`)
      .limit(10);
    if (!esJefe(perfil)) consulta = consulta.eq("closer_id", perfil.id);
    const { data } = await consulta;
    return data ?? [];
  });
}

// Importar citas desde un CSV: columnas email o telefono, fecha («2026-10-20 17:00», hora del proyecto),
// closer_email y nota (opcional). Solo director y CEO.
export async function importarCitas(texto: string) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { perfil, proyecto } = await getSesion();
    if (!esJefe(perfil)) throw new ErrorUsuario("Solo el director o el CEO importan citas.");
    const { default: Papa } = await import("papaparse");
    const res = Papa.parse<Record<string, string>>(texto.replace(/^﻿/, ""), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
    if (!res.data.length) throw new ErrorUsuario("El CSV está vacío.");
    if (res.data.length > 2000) throw new ErrorUsuario("Como mucho 2.000 citas por archivo.");
    const { data: closers } = await db().from("miembros_proyecto").select("perfiles!inner(id, email, rol)").eq("proyecto_id", proyecto.id).eq("perfiles.rol", "closer");
    const porEmail = new Map(((closers ?? []) as unknown as { perfiles: { id: string; email: string } }[]).map((c) => [c.perfiles.email.toLowerCase(), c.perfiles.id]));
    // Los leads del proyecto se cargan una vez (por email y por teléfono, solo dígitos)
    const leads = await todas<{ id: string; email: string | null; telefono: string | null }>((x, y) => db().from("leads").select("id, email, telefono").eq("proyecto_id", proyecto.id).order("id").range(x, y));
    const porMail = new Map(leads.filter((l) => l.email).map((l) => [l.email!.toLowerCase(), l.id]));
    // Arreglo 25: teléfono por sus últimas 9 cifras (como el resto de la app) y sin duplicar citas ya existentes
    const porTel = new Map(leads.filter((l) => telefonoClave(l.telefono).length >= 6).map((l) => [telefonoClave(l.telefono), l.id]));
    const citasYa = await todas<{ lead_id: string; closer_id: string | null; fecha: string }>((x, y) => db().from("citas").select("lead_id, closer_id, fecha").eq("proyecto_id", proyecto.id).neq("estado", "reagendada").order("id").range(x, y));
    const claveCita = (leadId: string, closerId: string | null, fecha: string) => `${leadId}|${closerId}|${new Date(fecha).getTime()}`;
    const yaHay = new Set(citasYa.map((c) => claveCita(c.lead_id, c.closer_id, c.fecha)));
    let creadas = 0;
    const fallos: string[] = [];
    for (const [i, fila] of res.data.entries()) {
      const n = i + 2; // fila del archivo (la 1 es la cabecera)
      const email = (fila.email ?? "").trim().toLowerCase();
      const tel = telefonoClave(fila.telefono ?? fila["teléfono"] ?? "");
      const closerId = porEmail.get((fila.closer_email ?? "").trim().toLowerCase());
      const f = (fila.fecha ?? "").trim().replace(" ", "T");
      if (!closerId) { fallos.push(`Fila ${n}: closer no encontrado`); continue; }
      let fecha: string;
      try { fecha = localAIso(f, proyecto.zona_horaria); } catch { fallos.push(`Fila ${n}: fecha no válida («${fila.fecha ?? ""}»)`); continue; }
      const leadId = (email && porMail.get(email)) || (tel.length >= 6 ? porTel.get(tel) : undefined);
      if (!leadId) { fallos.push(`Fila ${n}: no hay ningún lead con ese ${email ? "email" : "teléfono"}`); continue; }
      if (yaHay.has(claveCita(leadId, closerId, fecha))) { fallos.push(`Fila ${n}: esa cita ya existe (mismo lead, closer y hora); no se duplica`); continue; }
      yaHay.add(claveCita(leadId, closerId, fecha));
      await escribir(db().from("citas").insert({ proyecto_id: proyecto.id, lead_id: leadId, closer_id: closerId, agendada_por: perfil.id, fecha, nota: (fila.nota ?? "").trim() || null }), "citas");
      await escribir(db().from("leads").update({ estado_caller: "agendado", closer_id: closerId }).eq("id", leadId), "leads");
      creadas++;
    }
    revalidatePath("/", "layout");
    return { creadas, fallos };
  });
}

// ---------- Calendario de GHL (V2-3) ----------
export async function sincronizarGhl(soloSiHaceMas?: number) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { perfil, proyecto } = await getSesion();
    if (!esJefe(perfil) && perfil.rol !== "closer") throw new ErrorUsuario("Sin permiso.");
    const { data: p } = await db().from("proyectos").select("ghl_token, ghl_location_id, ghl_sincronizado_en").eq("id", proyecto.id).single();
    if (!p?.ghl_token || !p.ghl_location_id) throw new ErrorUsuario("GHL todavía no está conectado (Administración → Integraciones).");
    // Sincronización automática al abrir: solo si ha pasado bastante desde la última
    if (soloSiHaceMas && p.ghl_sincronizado_en && Date.now() - new Date(p.ghl_sincronizado_en).getTime() < soloSiHaceMas) return { saltada: true };
    const { sincronizarCalendarios } = await import("@/lib/ghl-sync");
    try {
      const r = await sincronizarCalendarios(proyecto.id);
      revalidatePath("/", "layout");
      return r;
    } catch (e) {
      throw new ErrorUsuario(e instanceof Error ? e.message : "No se pudo sincronizar con GHL.");
    }
  });
}

// Citas de GHL sin unir: unirlas a un lead (se crea la cita) o descartarlas
export async function unirCitaSinLead(id: string, leadId: string) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { perfil, proyecto } = await getSesion();
    if (!esJefe(perfil)) throw new ErrorUsuario("Solo el director o el CEO revisan las citas sin unir.");
    const { data: s } = await db().from("citas_sin_lead").select("*").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!s) throw new ErrorUsuario("No encontrada.");
    const { data: lead } = await db().from("leads").select("id").eq("id", leadId).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!lead) throw new ErrorUsuario("Elige un lead de este proyecto.");
    const { data: ya } = await db().from("citas").select("id").eq("proyecto_id", proyecto.id).eq("ghl_cita_id", s.ghl_cita_id).maybeSingle();
    if (!ya) await db().from("citas").insert({ proyecto_id: proyecto.id, lead_id: leadId, closer_id: s.closer_id, ...(await datosAgendaGhl(leadId)), fecha: s.fecha, origen: "ghl", ghl_cita_id: s.ghl_cita_id, nota: s.titulo });
    if (s.ghl_contact_id) await db().from("leads").update({ ghl_contact_id: s.ghl_contact_id }).eq("id", leadId).is("ghl_contact_id", null);
    await escribir(db().from("citas_sin_lead").update({ estado: "resuelta" }).eq("id", id), "citas_sin_lead");
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "cita", resultado: "agendada", nota: "Cita de GHL unida a mano" });
    revalidatePath("/", "layout");
  });
}

export async function descartarCitaSinLead(id: string) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { perfil, proyecto } = await getSesion();
    if (!esJefe(perfil)) throw new ErrorUsuario("Solo el director o el CEO revisan las citas sin unir.");
    await escribir(db().from("citas_sin_lead").update({ estado: "descartada" }).eq("id", id).eq("proyecto_id", proyecto.id), "citas_sin_lead");
    revalidatePath("/", "layout");
  });
}
