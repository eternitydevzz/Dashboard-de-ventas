import "server-only";
import { db } from "@/lib/datos";
import { descifrar } from "@/lib/cifrado";
import { CAMPOS_CITA, columnaCitasGhl, datosAgendaGhl, guardarLeads, juntarConCitaAbierta, moverAAgendadosOrganico, pipelineCitaGhl, telefonoClave } from "@/lib/leads";
import { avisarCloserAgenda } from "@/lib/aviso-closer";
import { estadoTrasCitaGhl } from "@/lib/estado-cita-ghl";
import { GhlEsperar, cambiarUsuarioCitaGhl, contactoGhl, estadoCitaGhl, estadoDesdeGhl, eventosGhl, nombreCalendarioGhl, nuevoEstado, type ContactoGhl } from "@/lib/ghl";
import { PIPELINE_GENERAL, canalDeOrigen, etiquetaCanal, limpiarUrl } from "@/lib/canal";
import { canalesDe } from "@/lib/canales-datos";
import { mismoNombre } from "@/lib/formato";
import type { Proyecto } from "@/lib/tipos";
import { ABIERTAS } from "@/lib/llamadas";
import { dispararEtiquetas, dispararWorkflows } from "@/lib/workflows-motor";
import type { DisparoCita } from "@/lib/workflows";
import { guardarError } from "@/lib/errores-app";
import { closerDeLaRotacion } from "@/lib/rotacion";

type ProyectoGhl = Proyecto & { ghl_token: string | null; ghl_location_id: string | null };
type ResultadoSync = { nuevas: number; actualizadas: number; canceladas: number; sinUnir: number; invalidas: number; closers: number; errores: string[] };

const DIA = 86_400_000;
// Plan GHL (16 oct): como mucho, cuántas citas que ya no vienen se comprueban una a una en cada lectura
const MAX_COMPROBAR = 25;
// Plan GHL 4.5: citas nuevas creadas por lectura (cada una lee su contacto de GHL y hace ~10 consultas); el resto, en
// la siguiente: siguen dentro de la ventana de fechas (desde/hasta) y, como no están en la app, se vuelven a ver como
// nuevas. Como MAX_NUEVOS del espejo: solo cuentan las creadas (una sin lead no se come el tope en cada lectura).
export const MAX_CITAS_NUEVAS = 20;

// De dónde se leen las citas. Plan GHL (16 oct): por calendario (los elegidos en el proyecto; el closer sale del
// usuario de GHL de cada cita). Sin calendarios elegidos, como antes: el calendario o el usuario de cada closer.
type Fuente = { nombre: string; calendarId: string | null; userId: string | null; closerId: string | null; calendario: string | null };

// Trae las citas de GHL y las guarda en la app.
// `opciones.proyecto`: el que ya leyó quien llama (la lectura de cada minuto), para no volver a pedirlo (D43)
export async function sincronizarCalendarios(proyectoId: string, opciones: { fetchImpl?: typeof fetch; ahora?: Date; proyecto?: ProyectoGhl } = {}): Promise<ResultadoSync> {
  const proyecto = opciones.proyecto ?? (await db().from("proyectos").select("*").eq("id", proyectoId).single<ProyectoGhl>()).data;
  if (!proyecto?.ghl_token || !proyecto.ghl_location_id) throw new Error("Falta conectar GHL (token e id de la subcuenta) en Administración → Integraciones.");
  const token = descifrar(proyecto.ghl_token, "el token de GHL");
  const fetchImpl = opciones.fetchImpl;
  const ahora = opciones.ahora ?? new Date();
  const desde = new Date(ahora.getTime() - 30 * DIA);
  const hasta = new Date(ahora.getTime() + 60 * DIA);

  const { data: miembros } = await db()
    .from("miembros_proyecto")
    .select("perfil_id, ghl_calendar_id, ghl_user_id, perfiles!inner(rol, nombre, tambien_closer)")
    .eq("proyecto_id", proyecto.id);
  // Plan GHL E1: closer = rol closer o un caller con «También closer»
  const closers = ((miembros ?? []) as unknown as { perfil_id: string; ghl_calendar_id: string | null; ghl_user_id: string | null; perfiles: { rol: string; nombre: string; tambien_closer: boolean } }[]).filter((m) => (m.perfiles.rol === "closer" || m.perfiles.tambien_closer) && (m.ghl_calendar_id || m.ghl_user_id));
  const closerDeUsuario = new Map(closers.filter((c) => c.ghl_user_id).map((c) => [c.ghl_user_id as string, c.perfil_id]));

  const porCalendario = (proyecto.ghl_calendarios ?? []).filter((x) => x?.trim());
  let fuentes: Fuente[];
  if (porCalendario.length) {
    fuentes = porCalendario.map((id) => ({ nombre: id, calendarId: id, userId: null, closerId: null, calendario: id }));
  } else {
    if (!closers.length) throw new Error("Ningún closer tiene puesto su calendario de GHL (Administración → Integraciones).");
    fuentes = closers.map((c) => ({ nombre: c.perfiles.nombre, calendarId: c.ghl_calendar_id, userId: c.ghl_user_id, closerId: c.perfil_id, calendario: null }));
  }
  const r: ResultadoSync = { nuevas: 0, actualizadas: 0, canceladas: 0, sinUnir: 0, invalidas: 0, closers: fuentes.length, errores: [] };

  const contactos = new Map<string, ContactoGhl | null>();
  const contacto = async (id: string) => {
    if (!contactos.has(id)) {
      try {
        contactos.set(id, await contactoGhl({ token, contactId: id, fetchImpl }));
      } catch (e) {
        if (e instanceof GhlEsperar) throw e; // con null, la cita se quedaría sin canal para siempre
        contactos.set(id, null);
      }
    }
    return contactos.get(id) ?? null;
  };
  // Plan GHL: el canal sale de la última página por la que entró el contacto (la de la agenda, con su UTM).
  // B2b: con los canales del proyecto, leídos una vez por lectura.
  const canales = await canalesDe(proyecto.id);
  const origenDe = async (contactId: string | undefined) => {
    const ct = contactId ? await contacto(contactId) : null;
    const a = ct?.lastAttributionSource?.url || ct?.lastAttributionSource?.utmSource ? ct.lastAttributionSource : ct?.attributionSource;
    return { canal: canalDeOrigen(a?.url, a?.utmSource, canales), origen_url: limpiarUrl(a?.url) };
  };

  // Plan GHL (fase 3, se lee cada 30 s): lo que no siempre hace falta se pide solo cuando hace falta y una vez
  const nombres = new Map<string, string>();
  const nombreCalendario = async (id: string) => {
    if (!nombres.has(id)) nombres.set(id, (await nombreCalendarioGhl({ token, calendarId: id, fetchImpl })) ?? id);
    return nombres.get(id)!;
  };
  let base: { pipe: { id: string } | null; destinoCitas: Awaited<ReturnType<typeof columnaCitasGhl>> } | null = null;
  const datosBase = async () => {
    if (!base) {
      const { data: pipe } = await db().from("pipelines").select("id").eq("proyecto_id", proyecto.id).eq("tipo", "normal").order("orden").limit(1).maybeSingle();
      // Fase 4: un lead que nace con su cita de GHL entra ya en la columna de citas (su pipeline principal)
      base = { pipe, destinoCitas: await columnaCitasGhl(proyecto.id) };
    }
    return base;
  };
  // Cristian, 17 oct: todas las citas a «Agendan» de «0. Agendas General» (el canal va en la etiqueta)
  let agendan: { pipeline_id: string; id: string; nombre: string }[] | null = null;
  const columnasCanal = async () => {
    if (!agendan) {
      const { data } = await db().from("pipelines").select("id, nombre, etapas(id, nombre)").eq("proyecto_id", proyecto.id).eq("tipo", "normal");
      const p = (data ?? []).find((x) => x.nombre.trim().toLowerCase() === PIPELINE_GENERAL.toLowerCase());
      const e = ((p?.etapas ?? []) as { id: string; nombre: string }[]).find((x) => mismoNombre(x.nombre, "Agendan"));
      agendan = p && e ? [{ pipeline_id: p.id, id: e.id, nombre: p.nombre }] : [];
    }
    return agendan;
  };
  const pipelinesCita = new Map<string, string | null>();
  const vienen = new Set<string>();
  const procesadas = new Set<string>();
  let fallo = false;

  // Todos los calendarios a la vez; luego, las citas que ya están en la app, en una sola consulta
  const lecturas = await Promise.all(
    fuentes.map((f) =>
      eventosGhl({ token, locationId: proyecto.ghl_location_id!, calendarId: f.calendarId, userId: f.userId, desde, hasta, fetchImpl }).then(
        (eventos) => ({ f, eventos, error: null as string | null }),
        (e) => ({ f, eventos: [] as Awaited<ReturnType<typeof eventosGhl>>, error: e instanceof Error ? e.message : "error" })
      )
    )
  );
  for (const l of lecturas) for (const ev of l.eventos) if (ev.id) vienen.add(ev.id);
  type CitaApp = { id: string; ghl_cita_id: string; estado: string; fecha: string; closer_id: string | null; canal: string | null; ghl_calendario: string | null; creado_en: string; lead_id: string; agendada_por: string | null };
  const enApp = new Map<string, CitaApp>();
  const ids = [...vienen];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db().from("citas").select(CAMPOS_CITA).eq("proyecto_id", proyecto.id).in("ghl_cita_id", ids.slice(i, i + 200));
    for (const c of (data ?? []) as CitaApp[]) enApp.set(c.ghl_cita_id, c);
  }

  for (const { f, eventos, error } of lecturas) {
    if (error) {
      fallo = true;
      r.errores.push(`${f.nombre}: ${error}`);
      continue;
    }
    for (const ev of eventos) {
      if (!ev.id || !ev.startTime || isNaN(new Date(ev.startTime).getTime())) continue;
      // Una cita que sale en dos calendarios de esta lectura se procesa una sola vez, con su propio calendario
      if (procesadas.has(ev.id)) continue;
      procesadas.add(ev.id);
      const calendarioId = f.calendario ? ev.calendarId || f.calendario : null;
      const fecha = new Date(ev.startTime).toISOString();
      const deGhl = estadoDesdeGhl(ev.appointmentStatus);
      const abierta = !deGhl || deGhl === "confirmada"; // pendiente (sin estado de GHL) o confirmada: solo estas mueven el lead a la columna de citas
      const closerId = f.closerId ?? (ev.assignedUserId ? closerDeUsuario.get(ev.assignedUserId) ?? null : null);

      // ¿Ya está en la app?
      const existe = enApp.get(ev.id);
      if (existe) {
        // Plan GHL: se completa de dónde viene (calendario siempre; canal solo en las de los últimos 15 min, las que
        // acaban de entrar por el workflow: en una vieja, la última página del contacto ya puede ser otra).
        // No cuenta como «actualizada».
        if (calendarioId) {
          const extra: Record<string, string> = {};
          if (!existe.ghl_calendario) extra.ghl_calendario = await nombreCalendario(calendarioId);
          if (!existe.canal && ahora.getTime() - new Date(existe.creado_en).getTime() < 15 * 60_000) {
            const o = await origenDe(ev.contactId);
            if (o.canal) {
              Object.assign(extra, { canal: o.canal }, o.origen_url ? { origen_url: o.origen_url } : {});
              // Fase 3: si llega «callers», la agenda pasa a contar para el caller del lead (sin quitar uno que ya la tenga)
              const quien = (await datosAgendaGhl(existe.lead_id, o.canal)).agendada_por;
              if (quien && !existe.agendada_por) extra.agendada_por = quien;
              await ponerEtiqueta(existe.lead_id, etiquetaCanal(o.canal, canales));
            }
          }
          if (Object.keys(extra).length) await db().from("citas").update(extra).eq("id", existe.id);
        }
        // Una cita ya terminada en la app (cerrada, no show, perdida…) no se toca: ni el estado ni la hora ni el
        // closer (11 oct: una venta adelantada cierra la cita con la hora de ahora y GHL la devolvería a la suya)
        if (!(ABIERTAS as readonly string[]).includes(existe.estado)) continue;
        const estado = nuevoEstado(existe.estado, deGhl);
        const closer = closerId ?? existe.closer_id;
        if (estado !== existe.estado || new Date(existe.fecha).getTime() !== new Date(fecha).getTime() || existe.closer_id !== closer) {
          await db().from("citas").update({ estado, fecha, closer_id: closer }).eq("id", existe.id);
          r.actualizadas++;
          if (estado === "cancelada" && existe.estado !== "cancelada") await disparar(proyecto.id, existe.lead_id, { tipo: "cita", evento: "cancelada", canal: existe.canal, calendario: existe.ghl_calendario, fecha }, r);
        }
        continue;
      }
      const sinUnir = async (estado: "pendiente" | "invalida") => {
        await db().from("citas_sin_lead").upsert(
          { proyecto_id: proyecto.id, ghl_cita_id: ev.id, ghl_contact_id: ev.contactId ?? null, closer_id: closerId, titulo: ev.title ?? null, fecha, estado, datos: ev },
          { onConflict: "proyecto_id,ghl_cita_id", ignoreDuplicates: true }
        );
        if (estado === "invalida") r.invalidas++;
        else r.sinUnir++;
      };
      if (deGhl === "invalida") {
        await sinUnir("invalida");
        continue;
      }
      if (r.nuevas >= MAX_CITAS_NUEVAS) continue;

      // Por calendario: la cita va a General (Cristian, 17 oct). Por closer (como antes, 13 oct): al pipeline donde
      // GHL tiene su oportunidad en «Agendan» (una vez por contacto).
      const calendario = calendarioId ? await nombreCalendario(calendarioId) : null;
      const origen = calendario ? await origenDe(ev.contactId) : null;
      const destinosCanal = calendario ? await columnasCanal() : [];
      if (!calendario && abierta && ev.contactId && !pipelinesCita.has(ev.contactId)) pipelinesCita.set(ev.contactId, await pipelineCitaGhl(proyecto, ev.contactId, fetchImpl));
      const pipelineCita = !calendario && abierta && ev.contactId ? pipelinesCita.get(ev.contactId) ?? null : null;
      const destinoCita = destinosCanal[0] ?? (pipelineCita ? await columnaCitasGhl(proyecto.id, pipelineCita) : (await datosBase()).destinoCitas);

      // Buscar el lead: por el contacto de GHL; si no, con el email o el teléfono del contacto; si no, se crea
      let leadId: string | null = null;
      if (ev.contactId) {
        const { data } = await db().from("leads").select("id").eq("proyecto_id", proyecto.id).eq("ghl_contact_id", ev.contactId).maybeSingle();
        leadId = data?.id ?? null;
      }
      if (!leadId && ev.contactId) {
        const ct = await contacto(ev.contactId);
        const email = (ct?.email ?? "").trim().toLowerCase() || null;
        const telefono = (ct?.phone ?? "").trim() || null;
        if (email || telefonoClave(telefono).length >= 6) {
          const nombreCompleto = (ct?.name ?? "").trim();
          await guardarLeads(
            proyecto,
            [{ ghl_contact_id: ev.contactId, nombre: ct?.firstName ?? nombreCompleto.split(/\s+/)[0] ?? "", apellido: ct?.lastName ?? nombreCompleto.split(/\s+/).slice(1).join(" "), email, telefono, etiquetas: [], respuestas: [], creado_en: null }],
            { ...(abierta && destinoCita ? { pipelineId: destinoCita.pipeline_id, etapaId: destinoCita.id } : { pipelineId: (await datosBase()).pipe?.id ?? null }), origen: "ghl", perfilId: null, repartir: false, notaActividad: "Entró desde el calendario de GHL" }
          );
          const { data } = await db().from("leads").select("id").eq("proyecto_id", proyecto.id).eq("ghl_contact_id", ev.contactId).maybeSingle();
          leadId = data?.id ?? null;
        }
      }
      if (!leadId) {
        await sinUnir("pendiente");
        continue;
      }
      const estado = deGhl ?? "pendiente"; // las inválidas ya salieron antes
      // Cristian (11 nov 2026): una cita nueva y futura va al closer del país del lead (España, Europa y Emiratos → Facu;
      // el resto → la rotación). Si GHL la puso a otro, se cambia también en GHL (usuario y calendario de ese closer);
      // si GHL no lo acepta, se queda como venía y se apunta el error.
      let closerFinal = closerId;
      if (abierta && new Date(fecha).getTime() > ahora.getTime()) {
        const { data: l } = await db().from("leads").select("pais").eq("id", leadId).maybeSingle();
        const correcto = await closerDeLaRotacion(proyecto.id, (l?.pais as string | null) ?? null).catch(() => null);
        const destino = correcto && correcto !== closerId ? closers.find((c) => c.perfil_id === correcto) : undefined;
        if (destino?.ghl_user_id) {
          try {
            await cambiarUsuarioCitaGhl({ token, citaId: ev.id, usuarioId: destino.ghl_user_id, calendarId: destino.ghl_calendar_id, fetchImpl });
            closerFinal = destino.perfil_id;
          } catch (e) {
            r.errores.push(`Cita ${ev.id}: no se pudo pasar a ${destino.perfiles.nombre} en GHL: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
      const datosOrigen = calendario ? { ghl_calendario: calendario, ...origen } : {};
      const agenda = await datosAgendaGhl(leadId, origen?.canal ?? null);
      // Fase 3: si el lead ya tiene una cita abierta, esta se junta con ella (manda la última)
      const junta = abierta ? await juntarConCitaAbierta(proyecto.id, leadId, { fecha, closerId: closerFinal, ghlCitaId: ev.id, origen: "ghl", agendadaPor: agenda.agendada_por, extra: datosOrigen }, { ahora }) : null;
      const { data: creada, error } = junta ?? (await db().from("citas").insert({ proyecto_id: proyecto.id, lead_id: leadId, closer_id: closerFinal, ...agenda, fecha, estado, origen: "ghl", ghl_cita_id: ev.id, nota: ev.title ?? null, ...datosOrigen }).select(CAMPOS_CITA).single());
      if (error) {
        r.errores.push(`Cita ${ev.id}: ${error.message}`);
        continue;
      }
      enApp.set(ev.id, creada as CitaApp); // si sale en otro calendario de esta misma lectura, ya no se crea dos veces
      // La vieja de GHL ya no es de esta cita: si viene después en esta lectura, no debe devolverle su hora
      if (junta?.ghlViejo) {
        enApp.delete(junta.ghlViejo);
        procesadas.add(junta.ghlViejo);
      }
      await db().from("citas_sin_lead").update({ estado: "resuelta" }).eq("proyecto_id", proyecto.id).eq("ghl_cita_id", ev.id);
      if (estado === "pendiente" || estado === "confirmada") {
        // Plan GHL (Cristian, 16 oct): un lead que ya compró sigue «vendido» aunque reserve otra llamada.
        // C11 punto 15 (Callers, 7 nov): si estaba en confirma agenda o descartado, pasa a «reagendado» con su etiqueta.
        const { data: l } = await db().from("leads").select("estado_caller").eq("id", leadId).maybeSingle();
        const tras = estadoTrasCitaGhl(l?.estado_caller);
        if (tras) {
          await db().from("leads").update({ estado_caller: tras.estado, ...(closerFinal ? { closer_id: closerFinal } : {}), llamar_en: null }).eq("id", leadId);
          if (tras.etiqueta) await ponerEtiqueta(leadId, tras.etiqueta);
          if (calendario) for (const d of destinosCanal) await moverAAgendadosOrganico(proyecto.id, leadId, d.nombre);
          else await moverAAgendadosOrganico(proyecto.id, leadId, pipelineCita);
        }
      }
      // Fase 4: el lead lleva la etiqueta de su canal («Canal: YouTube»), para el filtro del CRM
      if (origen?.canal) await ponerEtiqueta(leadId, etiquetaCanal(origen.canal, canales));
      await db().from("actividades").insert({ proyecto_id: proyecto.id, lead_id: leadId, tipo: "cita", resultado: "agendada", nota: `Cita del calendario de GHL${calendario ? ` «${calendario}»` : ` con ${f.nombre}`}` });
      if (junta) r.actualizadas++;
      else r.nuevas++;
      // Solo citas futuras: la lectura mira 30 días atrás y, al añadir un calendario, las viejas dispararían en masa
      if (abierta && new Date(fecha).getTime() >= ahora.getTime()) {
        await disparar(proyecto.id, leadId, { tipo: "cita", evento: "agendada", canal: origen?.canal ?? null, calendario, fecha }, r);
        if (!junta && closerFinal) await avisarCloserAgenda({ proyectoId: proyecto.id, closerId: closerFinal, citaId: (creada as CitaApp).id, motivo: "nueva" });
      }
    }

    // Arreglo 21 (por closer): una cita de GHL de este closer, dentro del rango consultado, que ya no viene es que se
    // borró en GHL → «cancelada». Solo las que siguen abiertas (lo que registró el closer no se toca) y solo
    // si la consulta a GHL fue bien. Según la especificación oficial, GET /calendars/events no pagina.
    if (!f.closerId) continue;
    const vienenAqui = new Set(eventos.map((ev) => ev.id).filter(Boolean));
    const { data: abiertas } = await db()
      .from("citas")
      .select("id, lead_id, ghl_cita_id, canal, ghl_calendario, fecha")
      .eq("proyecto_id", proyecto.id)
      .eq("closer_id", f.closerId)
      .not("ghl_cita_id", "is", null)
      .in("estado", [...ABIERTAS])
      .gte("fecha", desde.toISOString())
      .lt("fecha", hasta.toISOString());
    const borradas = (abiertas ?? []).filter((x) => !vienenAqui.has(x.ghl_cita_id));
    await cancelar(proyecto.id, borradas, r);
  }

  // Plan GHL (por calendario): una cita abierta de GHL que no viene en ningún calendario leído se comprueba una a una
  // en GHL (puede estar en otro calendario o la lista venir incompleta) y solo se cancela si GHL dice que no existe o
  // que está cancelada. Si alguna lectura falló, no se cancela nada.
  if (porCalendario.length && !fallo) {
    const { data: abiertas } = await db()
      .from("citas")
      .select("id, lead_id, ghl_cita_id, canal, ghl_calendario, fecha")
      .eq("proyecto_id", proyecto.id)
      .not("ghl_cita_id", "is", null)
      .in("estado", [...ABIERTAS])
      .gte("fecha", desde.toISOString())
      .lt("fecha", hasta.toISOString());
    const faltan = (abiertas ?? []).filter((x) => !vienen.has(x.ghl_cita_id)).slice(0, MAX_COMPROBAR);
    const borradas: typeof faltan = [];
    for (const x of faltan) if ((await estadoCitaGhl({ token, citaId: x.ghl_cita_id, fetchImpl })) === "borrada") borradas.push(x);
    await cancelar(proyecto.id, borradas, r);
  }

  // F3: los calendarios que no se pudieron leer, aparte (el aviso «calendario» del CEO sale de aquí, avisos-ceo.ts)
  const sinLeer = lecturas.filter((l) => l.error).length;
  const resumen = `${r.nuevas} nuevas · ${r.actualizadas} actualizadas${r.canceladas ? ` · ${r.canceladas} canceladas (borradas en GHL)` : ""} · ${r.sinUnir} sin unir · ${r.invalidas} inválidas${r.errores.length ? ` · ${r.errores.length} con error` : ""}${sinLeer ? ` · ${sinLeer} calendario(s) sin leer` : ""}`;
  await db().from("proyectos").update({ ghl_sincronizado_en: ahora.toISOString(), ghl_ultimo_resultado: resumen }).eq("id", proyecto.id);
  return r;
}

// Añade una etiqueta al lead si no la tiene (sin tocar las demás). También la usa el webhook de citas.
// A3 (plan GHL, Cristian 8 nov 2026): «la tiene» se mira en minúsculas y, si es nueva, arranca los workflows de
// etiqueta. Un fallo de los workflows no rompe a quien llama.
export async function ponerEtiqueta(leadId: string, etiqueta: string) {
  const { data } = await db().from("leads").select("etiquetas, proyecto_id").eq("id", leadId).maybeSingle();
  const actuales = (data?.etiquetas ?? []) as string[];
  if (!data || actuales.some((t) => t.toLowerCase() === etiqueta.toLowerCase())) return;
  const { error } = await db().from("leads").update({ etiquetas: [...actuales, etiqueta] }).eq("id", leadId);
  if (error) return;
  await dispararEtiquetas(data.proyecto_id, leadId, [etiqueta]).catch(async (e) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ghl-sync] workflows de etiqueta:", msg);
    await guardarError("ghl-sync workflows de etiqueta", msg, data.proyecto_id); // F3: a los avisos del CEO
  });
}

async function cancelar(proyectoId: string, borradas: { id: string; lead_id: string; canal: string | null; ghl_calendario: string | null; fecha: string }[], r: ResultadoSync) {
  if (!borradas.length) return;
  await db().from("citas").update({ estado: "cancelada" }).in("id", borradas.map((x) => x.id));
  await db().from("actividades").insert(borradas.map((x) => ({ proyecto_id: proyectoId, lead_id: x.lead_id, tipo: "cita", resultado: "cancelada", nota: "La cita ya no está en el calendario de GHL: marcada como cancelada" })));
  r.canceladas += borradas.length;
  for (const x of borradas) await disparar(proyectoId, x.lead_id, { tipo: "cita", evento: "cancelada", canal: x.canal, calendario: x.ghl_calendario, fecha: x.fecha }, r);
}

// Fase 4d, B2 (plan GHL 2.4, Cristian 8 nov 2026): los workflows de «cita agendada / cancelada». Un fallo aquí NUNCA
// rompe la lectura de citas: se registra y va a los errores de la lectura.
async function disparar(proyectoId: string, leadId: string, disparo: DisparoCita, r: ResultadoSync) {
  try {
    await dispararWorkflows(proyectoId, leadId, disparo);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ghl-sync] workflows de cita:", msg);
    r.errores.push(`Workflows (cita ${disparo.evento}): ${msg.slice(0, 200)}`);
  }
}
