"use server";

import { zonaPersona } from "@/lib/zona-persona";
import { crearCitaEnGhl } from "@/lib/cita-en-ghl";
import { exigirSeccion } from "@/lib/permisos";
import { ErrorUsuario, notaValida, seguro } from "@/lib/resultado";
import { refrescarPantalla } from "@/lib/refrescar";
import { marcarViejo } from "@/lib/memoria";
import { getSesion, esJefe } from "@/lib/auth";
import { db, registrarActividad, escribir } from "@/lib/datos";
import { fechaHora, localAIso } from "@/lib/formato";
import { estrellasEntre } from "@/lib/estrellas";
import { planDePagos } from "@/lib/finanzas";
import type { EstadoCaller, Lead, Perfil, Proyecto } from "@/lib/tipos";
import { leerNumero } from "@/lib/numero";
import { ABIERTAS } from "@/lib/llamadas";
import { CON_ESTRELLAS, ESTADOS_CALLER, etiquetaEstado } from "@/lib/estados-caller";
import { closerDeLaRotacion, sumarRotacion } from "@/lib/rotacion";
import { closerLibreA } from "@/lib/agenda-libre";
import { miMercado } from "@/lib/mercado-datos";
import { juntarConCitaAbierta } from "@/lib/leads";
import { avisarCloserAgenda } from "@/lib/aviso-closer";

// Cristian (13 nov): al guardar, solo se recarga la pantalla actual (antes, unas 4 enteras por guardado).
// Lo demás (CRM, Mi Funnel) puede ir hasta 5 min por detrás para ese lead.
// Cristian, 15 nov: y KPIs → Leads se renueva en la siguiente visita (sin hacer esperar: lib/memoria.ts, marcarViejo)
const refrescar = () => {
  refrescarPantalla();
  marcarViejo("leads-kpis:");
};

// Quién puede tocar un lead: jefes, o el caller/closer asignado.
async function leadPermitido(leadId: string): Promise<{ lead: Lead; perfil: Perfil; proyecto: Proyecto }> {
  const { perfil, proyecto } = await getSesion();
  const { data: lead } = await db().from("leads").select("*").eq("id", leadId).eq("proyecto_id", proyecto.id).maybeSingle<Lead>();
  if (!lead) throw new ErrorUsuario("Lead no encontrado.");
  const ok = esJefe(perfil) || lead.caller_id === perfil.id || lead.closer_id === perfil.id;
  if (!ok) throw new ErrorUsuario("Este lead no está asignado a ti.");
  return { lead, perfil, proyecto };
}

// Mueve la tarjeta del lead en su pipeline de origen según su nuevo estado: 1) `primero` (p. ej. la columna del
// producto en Orgánico), 2) por nombre (`nombres`), como antes del H7. En «Callers» lo mueve la base (Paso 0).
async function moverAColumna(lead: Lead, estado: EstadoCaller, nombres: string[], primero: string[] = []) {
  if (!lead.pipeline_id) return;
  const { data } = await db().from("etapas").select("id, nombre").eq("pipeline_id", lead.pipeline_id);
  const etapas = data ?? [];
  const destino = etapas.find((e) => primero.includes(e.nombre.toLowerCase())) ?? etapas.find((e) => nombres.includes(e.nombre.toLowerCase()));
  // F3 (plan Callers, 7 nov): si falla, error (antes se perdía en silencio)
  if (destino && destino.id !== lead.etapa_id) await escribir(db().from("leads").update({ etapa_id: destino.id }).eq("id", lead.id), "leads");
}

const aIso = localAIso;

// ---------- Caller: resultado (C11, plan Callers, 7 nov) ----------
// Un clic = el lead pasa a esa columna de «Callers» (el trigger de la base lo mueve). Los que piden estrellas
// (Llamar luego, No interesa, Seguimiento) las guardan, como hoy; los demás no tocan las que hubiera (F2: antes
// «No contesta» ponía 1★ encima). Historial (Cristian, 10 nov): «Link de agenda» = llamada; «Wsp enviado» = llamada y
// WhatsApp (suma en los dos KPIs); las dos cuentan como contacto. El resto, cambio de columna con el estado nuevo
// (contacto = los que avanzan, punto 16). «Llamado» ya no existe.
// N1 (Cristian, 16 nov): fuera «No responde» (sus leads vuelven a «Leads» con la migración 20261119100000)
export type ResultadoSimple = "nuevo" | "link_enviado" | "wsp_enviado" | "no_interesa" | "seguimiento" | "llamar_luego" | "descartado" | "reagendado";
const SIMPLES: ResultadoSimple[] = ["nuevo", "link_enviado", "wsp_enviado", "no_interesa", "seguimiento", "llamar_luego", "descartado", "reagendado"];
const DESCARTE = ["no_interesa", "descartado"];
const CON_CITA = ["agendado", "confirma_agenda", "reagendado"]; // deshacer a estos solo si el lead tiene una cita abierta

// A3b-01: lo que hace falta para deshacer un clic (cómo estaba el lead y las actividades que creó ese clic)
type Antes = { estado_caller: string; etapa_id: string | null; estrellas_caller: number | null; llamar_en: string | null };
export type PasoResultado = { leadId: string; despues: string; antes: Antes; actividades: string[]; cita?: { id: string; estado: string } };
const antesDe = (l: Lead): Antes => ({ estado_caller: l.estado_caller, etapa_id: l.etapa_id ?? null, estrellas_caller: l.estrellas_caller ?? null, llamar_en: l.llamar_en ?? null });
// registrarActividad no devuelve el id: se leen las últimas de este clic (mismo lead, persona y resultado)
async function actividadesDelClic(leadId: string, perfilId: string, resultado: string, n: number, desde: string) {
  // revisor: solo las creadas por este clic (si registrarActividad falló, no se coge una vieja)
  const { data } = await db().from("actividades").select("id").eq("lead_id", leadId).eq("perfil_id", perfilId).eq("resultado", resultado).gte("creado_en", desde).order("creado_en", { ascending: false }).limit(n);
  return ((data ?? []) as { id: string }[]).map((a) => a.id);
}

// «Llamar luego» vuelve a guardar cuándo (Cristian, 10 nov 2026; opcional y solo se muestra): `llamarEn` = «AAAA-MM-DDTHH:MM»
export async function registrarLlamada(leadId: string, resultado: ResultadoSimple, nota: string, estrellas?: number, llamarEn?: string) {
  return seguro(async (): Promise<{ deshacer: PasoResultado }> => {
    const inicio = new Date(Date.now() - 1000).toISOString(); // margen por relojes
    await exigirSeccion("cola", "crm", "agendas", "clientes"); // H5
    if (!SIMPLES.includes(resultado)) throw new ErrorUsuario("Resultado no válido.");
    nota = notaValida(nota);
    const { lead, perfil, proyecto } = await leadPermitido(leadId);
    if (lead.estado_caller === "vendido" && perfil.rol === "caller") throw new ErrorUsuario("Este lead ya compró: lo lleva el closer.");
    const n = CON_ESTRELLAS.has(resultado) ? estrellasEntre(estrellas, 2, 5) : null;
    const llamar = resultado === "llamar_luego" && llamarEn ? aIso(llamarEn, zonaPersona(perfil, proyecto)) : null; // 13 nov: en la zona de quien lo pone // aIso valida el formato
    // A3b-01: al descartar se apunta su columna de antes (en datos: sin columnas nuevas) para poder volver a ella
    const descarta = DESCARTE.includes(resultado) && !DESCARTE.includes(lead.estado_caller) && lead.etapa_id;
    const datos = descarta ? { datos: { ...((lead.datos as Record<string, unknown> | null) ?? {}), etapa_antes_descarte: lead.etapa_id } } : {};
    // F3 (plan Callers, 7 nov): si falla, error (antes salía «Guardado» aunque el estado no cambiara)
    await escribir(db().from("leads").update({ estado_caller: resultado, llamar_en: llamar, ...(n ? { estrellas_caller: n } : {}), ...datos }).eq("id", leadId), "leads");
    const tipo = resultado === "link_enviado" || resultado === "wsp_enviado" ? "llamada" : "cambio_etapa";
    const texto = [`→ ${etiquetaEstado(resultado)}`, n ? `${n}★` : "", llamar ? `Llamar el ${fechaHora(llamar, proyecto)}` : "", nota].filter(Boolean).join(" · ");
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo, resultado, nota: texto });
    if (resultado === "wsp_enviado") await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "whatsapp", resultado, nota: texto });
    if (DESCARTE.includes(resultado)) await moverAColumna(lead, resultado, ["descartados", "descartado", "no interesa"]);
    else if (!(DESCARTE.includes(lead.estado_caller) && (await volverDeDescarte(lead))) && resultado === "nuevo") await moverAColumna(lead, "nuevo", ["nuevos", "nuevo"]);
    const actividades = await actividadesDelClic(leadId, perfil.id, resultado, resultado === "wsp_enviado" ? 2 : 1, inicio);
    refrescar();
    return { deshacer: { leadId, despues: resultado, antes: antesDe(lead), actividades } };
  });
}

// A3b-01: sale de «Descartados»/«No interesa» → vuelve a la columna apuntada al descartar (si sigue en su pipeline)
async function volverDeDescarte(lead: Lead) {
  const etapa = (lead.datos as Record<string, unknown> | null)?.etapa_antes_descarte;
  if (typeof etapa !== "string" || !lead.pipeline_id) return false;
  const { data } = await db().from("etapas").select("id, nombre").eq("pipeline_id", lead.pipeline_id);
  if (!(data ?? []).some((e) => e.id === etapa)) return false;
  if (etapa !== lead.etapa_id) await escribir(db().from("leads").update({ etapa_id: etapa }).eq("id", lead.id), "leads");
  return true;
}

// A3b-01 (botón «Deshacer» y Ctrl+Z): el lead vuelve exactamente a como estaba y se borran las actividades de ese clic
// (para no inflar «Llamadas hoy»). Mismas comprobaciones que registrarLlamada; lo que llega del navegador se valida.
export async function deshacerResultado(paso: PasoResultado) {
  return seguro(async () => {
    await exigirSeccion("cola", "crm", "agendas", "clientes");
    const { lead, perfil, proyecto } = await leadPermitido(paso.leadId);
    if (lead.estado_caller !== paso.despues) throw new ErrorUsuario("Este lead cambió después: ya no se puede deshacer.");
    const a = paso.antes;
    if (!ESTADOS_CALLER.some((e) => e.v === a.estado_caller) || a.estado_caller === "vendido") throw new ErrorUsuario("No se puede deshacer: estado no válido.");
    if (a.estrellas_caller !== null && !(Number.isInteger(a.estrellas_caller) && a.estrellas_caller >= 1 && a.estrellas_caller <= 5)) throw new ErrorUsuario("No se puede deshacer: estrellas no válidas.");
    if (a.llamar_en !== null && Number.isNaN(Date.parse(a.llamar_en))) throw new ErrorUsuario("No se puede deshacer: fecha no válida.");
    if (a.etapa_id !== lead.etapa_id) {
      const { data } = a.etapa_id && lead.pipeline_id ? await db().from("etapas").select("id, nombre").eq("pipeline_id", lead.pipeline_id) : { data: [] };
      if (!(data ?? []).some((e) => e.id === a.etapa_id)) throw new ErrorUsuario("No se puede deshacer: esa columna ya no está en su pipeline.");
    }
    if (paso.cita && !(ABIERTAS as readonly string[]).includes(paso.cita.estado)) throw new ErrorUsuario("No se puede deshacer: estado de cita no válido.");
    if (CON_CITA.includes(a.estado_caller)) {
      const { data: abierta } = await db().from("citas").select("id").eq("lead_id", lead.id).eq("proyecto_id", proyecto.id).in("estado", [...ABIERTAS]).limit(1).maybeSingle();
      if (!abierta) throw new ErrorUsuario("No se puede deshacer: el lead ya no tiene cita.");
    }
    await escribir(db().from("leads").update({ estado_caller: a.estado_caller, ...(a.etapa_id !== lead.etapa_id ? { etapa_id: a.etapa_id } : {}), estrellas_caller: a.estrellas_caller, llamar_en: a.llamar_en }).eq("id", lead.id), "leads");
    if (paso.cita) await escribir(db().from("citas").update({ estado: paso.cita.estado }).eq("id", paso.cita.id).eq("lead_id", lead.id).eq("proyecto_id", proyecto.id).eq("estado", "confirmada"), "citas"); // revisor: no reabre citas cerradas
    const ids = paso.actividades.filter((x) => typeof x === "string").slice(0, 5);
    // revisor: solo las de un clic reciente (resultado y tipos que crea un botón, últimos 15 min)
    const desde = new Date(Date.now() - 15 * 60_000).toISOString();
    if (ids.length) await escribir(db().from("actividades").delete().in("id", ids).eq("lead_id", lead.id).eq("perfil_id", perfil.id).eq("proyecto_id", proyecto.id).eq("resultado", paso.despues).in("tipo", ["llamada", "whatsapp", "cambio_etapa"]).gte("creado_en", desde), "actividades");
    refrescar();
  });
}

// «Confirma Agenda» (punto 14): un clic confirma también la cita abierta del lead (columna «Confirmado» de «Closers»)
export async function confirmarAgenda(leadId: string) {
  return seguro(async () => {
    const inicio = new Date(Date.now() - 1000).toISOString();
    await exigirSeccion("cola", "crm", "agendas", "clientes");
    const { lead, perfil, proyecto } = await leadPermitido(leadId);
    const { data: cita } = await db().from("citas").select("id, estado").eq("lead_id", leadId).eq("proyecto_id", proyecto.id).in("estado", [...ABIERTAS]).order("fecha", { ascending: false }).limit(1).maybeSingle();
    if (!cita) throw new ErrorUsuario("Este lead no tiene ninguna cita abierta que confirmar. Márcalo primero como «Agendado».");
    await escribir(db().from("citas").update({ estado: "confirmada" }).eq("id", cita.id), "citas");
    await escribir(db().from("leads").update({ estado_caller: "confirma_agenda", llamar_en: null }).eq("id", leadId), "leads");
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "cambio_etapa", resultado: "confirma_agenda", nota: "→ Confirma Agenda · cita confirmada" });
    const actividades = await actividadesDelClic(leadId, perfil.id, "confirma_agenda", 1, inicio);
    refrescar();
    return { deshacer: { leadId, despues: "confirma_agenda", antes: antesDe(lead), actividades, cita: { id: cita.id as string, estado: cita.estado as string } } satisfies PasoResultado };
  });
}

export async function anadirNota(leadId: string, nota: string) {
  return seguro(async () => {
    await exigirSeccion("cola", "crm", "agendas", "clientes"); // H5
    nota = notaValida(nota);
    if (!nota.trim()) return;
    const { perfil, proyecto } = await leadPermitido(leadId);
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "nota", nota: nota.trim() });
    refrescar();
  });
}

// ---------- Agendar cita con un closer ----------
// D43 (misma regla que reagendarCita): la persona escribe la hora en su zona; CamposCita la pasa a hora del proyecto con esto
export async function zonasDeAgendar() {
  const { perfil, proyecto } = await getSesion();
  return { proyecto: proyecto.zona_horaria as string, persona: zonaPersona(perfil, proyecto) as string };
}

// C11 (Cristian, 7 nov, punto 13): el caller vuelve a agendar a mano (fecha y hora); su closer lo pone la rotación
// (lib/rotacion.ts), aunque se intente otro. Directores, CEO y closers eligen el closer, como siempre.
// La cita en GHL la crea la sesión de GHL (pendiente, plan Callers): hasta entonces, solo en la app.
export async function agendarCita(leadId: string, closerId: string, fechaLocal: string, nota: string, estrellas?: number) {
  return seguro(async () => {
    await exigirSeccion("cola", "crm", "agendas", "clientes"); // H5
    nota = notaValida(nota);
    const { lead, perfil, proyecto } = await leadPermitido(leadId);
    if (!fechaLocal) throw new ErrorUsuario("Elige fecha y hora.");
    const esCaller = perfil.rol === "caller";
    if (esCaller) closerId = await closerDeLaRotacion(proyecto.id, lead.pais, await miMercado(proyecto.id, perfil.id)); // 13 nov: España → closers de España
    // El caller elige una hora libre del calendario; se vuelve a mirar al guardar (otro caller pudo cogerla antes)
    if (esCaller) {
      const libre = await closerLibreA(proyecto, closerId, new Date(aIso(fechaLocal, proyecto.zona_horaria)));
      if (!libre.libre) throw new ErrorUsuario("Esa hora ya no está libre. Elige otra en el calendario.");
    }
    // Las estrellas de la llamada (2 a 5): obligatorias para el caller (como hoy), opcionales para jefe o closer
    const n = esCaller || estrellas !== undefined ? estrellasEntre(estrellas, 2, 5) : null;
    const fecha = aIso(fechaLocal, proyecto.zona_horaria); // en hora del proyecto: CamposCita ya convirtió la de la persona
    const { data: closer } = await db()
      .from("miembros_proyecto")
      .select("perfil_id, perfiles!inner(rol, nombre)")
      .eq("proyecto_id", proyecto.id)
      .eq("perfil_id", closerId)
      .or("rol.eq.closer,tambien_closer.eq.true", { referencedTable: "perfiles" }) // E1: también closer (Facu)
      .eq("perfiles.activo", true) // C9: a un closer desactivado no se le agenda
      .maybeSingle();
    if (!closer) throw new ErrorUsuario("Elige un closer del proyecto.");
    // Paso H6: un doble clic creaba dos citas iguales; la base ya no deja repetir lead, closer y hora
    // Fase 3: si el lead ya tiene una cita abierta, se junta con ella (manda esta); su evento de GHL se borra y abajo
    // se crea el de la hora nueva, así en GHL queda uno solo
    const junta = await juntarConCitaAbierta(proyecto.id, leadId, { fecha, closerId, ghlCitaId: null, origen: "manual", agendadaPor: perfil.id, extra: { ...(nota ? { nota } : {}), ...(n !== null ? { estrellas_caller: n } : {}) } }, { perfilId: perfil.id, noRepetir: true });
    const { data: citaNueva, error: errCita } = junta ?? (await db().from("citas").insert({ proyecto_id: proyecto.id, lead_id: leadId, closer_id: closerId, agendada_por: perfil.id, fecha, nota: nota || null, estrellas_caller: n }).select("id").single());
    if (errCita?.code === "23505") throw new ErrorUsuario(errCita.message.includes("citas_closer_hora_unica") ? "Ese hueco acaba de ocuparse, elige otro." : "Ese lead ya tiene una cita con ese closer a esa hora.");
    if (errCita) throw new Error(`No se pudo guardar en «citas»: ${errCita.message}`);
    if (!junta && citaNueva && new Date(fecha).getTime() > Date.now()) await avisarCloserAgenda({ proyectoId: proyecto.id, closerId, citaId: citaNueva.id, motivo: "nueva" });
    if (esCaller) await sumarRotacion(proyecto.id, closerId);
    // Arreglo 9: si agenda un jefe o un closer sin estrellas, no se borran las que puso el caller
    await escribir(db().from("leads").update({ estado_caller: "agendado", closer_id: closerId, llamar_en: null, ...(n !== null ? { estrellas_caller: n } : {}) }).eq("id", leadId), "leads");
    const nombreCloser = (closer as unknown as { perfiles: { nombre: string } }).perfiles.nombre;
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "cita", resultado: "agendada", nota: `Cita con ${nombreCloser}${n ? ` · ${n}★` : ""}${nota ? ` · ${nota}` : ""}` });
    await moverAColumna(lead, "agendado", ["agendados", "agendado", "agendan"]); // «Agendan»: como GHL (13 oct)
    // Encargo de Callers C11 punto 13 (Cristian, 7 nov): la cita también en el calendario de GHL del closer. Si no se
    // puede, la cita de la app se queda, se apunta en el historial del lead y se avisa a quien agenda.
    let aviso: string | null = null;
    if (citaNueva) {
      const g = await crearCitaEnGhl({ proyectoId: proyecto.id, citaId: citaNueva.id, leadId, closerId, fecha });
      if (!g.ok) {
        aviso = `Agendado en la app, pero no en el calendario de GHL: ${g.motivo}`;
        await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "cita", resultado: "agendada", nota: `No se pudo crear la cita en el calendario de GHL: ${g.motivo}` });
      }
    }
    refrescar();
    return aviso ? { aviso } : { ok: true as const };
  });
}

// ---------- Registrar venta ----------
export async function registrarVenta(leadId: string, formData: FormData) {
  return seguro(async () => {
    await exigirSeccion("cola", "crm", "agendas", "clientes"); // H5
    const { lead, perfil, proyecto } = await leadPermitido(leadId);
    const productoId = String(formData.get("producto") ?? "");
    const { data: producto } = await db().from("productos").select("*").eq("id", productoId).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!producto) throw new ErrorUsuario("Elige un producto.");
  
    const num = (k: string) => {
      const v = leerNumero(formData.get(k));
      return Number.isFinite(v) ? v : NaN;
    };
    const facturacion = num("facturacion");
    const cash = num("cash");
    if (!(facturacion > 0)) throw new ErrorUsuario("La facturación tiene que ser mayor que 0.");
    if (!(cash >= 0) || cash > facturacion) throw new ErrorUsuario("El cash collected tiene que estar entre 0 y la facturación.");
    // Arreglo 29: lo que antes solo comprobaba la base (y el usuario veía su mensaje técnico)
    const tipo = String(formData.get("tipo_pago") ?? "completo") as "completo" | "reserva" | "cuotas" | "mensual";
    if (!["completo", "reserva", "cuotas", "mensual"].includes(tipo)) throw new ErrorUsuario("Elige cómo paga (completo, reserva, cuotas o cada mes).");
    const cuotas = tipo === "cuotas" ? Math.max(2, Math.round(num("num_cuotas")) || 2) : null;
    if (cuotas !== null && cuotas > 60) throw new ErrorUsuario("Como mucho 60 cuotas.");
    const metodo = String(formData.get("metodo") ?? "stripe");
    if (!["stripe", "transferencia", "otro"].includes(metodo)) throw new ErrorUsuario("Elige el método de pago.");
    const fechaTxt = String(formData.get("fecha") ?? "");
    const fecha = fechaTxt ? aIso(`${fechaTxt}T12:00`, proyecto.zona_horaria) : new Date().toISOString();
    // Desde la cita (closer), las estrellas de cómo era el prospecto son obligatorias
    const estrellasCloser = formData.get("desde_cita") ? estrellasEntre(formData.get("estrellas"), 1, 5) : null;
    // La cita que pasará a «cerrada»: la que se arrastró en Post-call (Paso H6, puede estar terminada) o,
    // si no viene, la abierta de este lead
    const citaElegida = String(formData.get("cita_id") ?? "");
    const { data: cita } = citaElegida
      ? await db().from("citas").select("id, closer_id, fecha").eq("id", citaElegida).eq("lead_id", leadId).eq("proyecto_id", proyecto.id).neq("estado", "cerrada").maybeSingle()
      : await db()
          .from("citas")
          .select("id, closer_id, fecha")
          .eq("lead_id", leadId)
          .in("estado", [...ABIERTAS, "seguimiento"]) // arreglo 8: también «confirmación pendiente»
          .order("fecha", { ascending: false })
          .limit(1)
          .maybeSingle();
    if (citaElegida && !cita) throw new ErrorUsuario("Esa cita no es de este lead o ya está cerrada.");
    // Vendedor: al cerrar una cita, la venta es del closer de esa cita aunque la cierre
    // el director o el CEO; si no, quien la registra (o a quien elija un jefe).
    // Mejora de la pasada (Cristian, 11 oct): un jefe que la registra desde la ficha sin elegir vendedor
    // también la deja a nombre del closer de la cita (así «Cerradas» y su facturación cuentan lo mismo).
    let vendedor = perfil.id;
    const vendedorForm = String(formData.get("vendedor") ?? "");
    if (formData.get("desde_cita") && cita?.closer_id) vendedor = cita.closer_id;
    else if ((esJefe(perfil) || perfil.rol === "caller") && !vendedorForm && cita?.closer_id) vendedor = cita.closer_id; // N1: el caller que vende un lead con cita, al closer de la cita (regla del 11 oct)
    else if (esJefe(perfil) && vendedorForm) {
      const { data: delProyecto } = await db().from("miembros_proyecto").select("perfil_id").eq("proyecto_id", proyecto.id).eq("perfil_id", vendedorForm).maybeSingle();
      if (!delProyecto) throw new ErrorUsuario("El vendedor elegido no es de este proyecto.");
      vendedor = vendedorForm;
    }
  
    // Reserva o cuotas: lo que falta queda en «Pagos pendientes» con sus fechas (se pueden cambiar en Finanzas)
    const plazos = planDePagos({ facturacion, cobradoHoy: cash, tipo, numCuotas: cuotas, fecha });
    // Mejora de la pasada (Cristian, 11 oct): si la cita aún no ha llegado, se cierra con la hora de ahora
    // (como si se hubiera adelantado), para que cuente como asistida hoy; en el historial queda la que tenía.
    const ahora = new Date();
    const adelantada = !!cita?.fecha && new Date(cita.fecha).getTime() > ahora.getTime();
    // Ola 6 (C1): venta, plazos, lead «vendido» y cita cerrada, todo o nada. Si falla algo, no queda venta
    // y reintentar no la duplica; si otra venta cerró la misma cita a la vez, esta no se guarda.
    const { error } = await db().rpc("registrar_venta", {
      p_proyecto: proyecto.id,
      p_lead: leadId,
      p_producto: producto.id,
      p_vendedor: vendedor,
      p_facturacion: facturacion,
      p_cash: cash,
      p_tipo_pago: tipo,
      p_num_cuotas: cuotas,
      p_metodo: metodo,
      p_nota: notaValida(String(formData.get("nota") ?? "")) || null,
      p_fecha: fecha,
      p_plazos: plazos,
      p_cita: cita?.id ?? null,
      p_cita_fecha: adelantada ? ahora.toISOString() : null,
      p_estrellas: estrellasCloser || null,
    });
    if (error?.message.includes("cita_cerrada")) throw new ErrorUsuario("Esa cita no es de este lead o ya está cerrada.");
    if (error) throw new Error(`No se pudo guardar la venta: ${error.message}`);
    if (cita && adelantada) await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "cita", nota: `Cita adelantada: era el ${fechaHora(cita.fecha, proyecto)}` });
    await registrarActividad({
      proyecto_id: proyecto.id,
      lead_id: leadId,
      perfil_id: perfil.id,
      tipo: "venta",
      resultado: tipo,
      nota: `${producto.nombre} · facturación ${facturacion} · cobrado ${cash}`,
    });
    // Si el pipeline tiene una columna con el nombre del producto (p. ej. «Membresía», «Grupal» o «VIP» en
    // Orgánico), va ahí; si no, a «Cerrados». (Bloque A: antes buscaba «low», «vip» o «grupal» en el nombre)
    await moverAColumna(lead, "vendido", ["cerrados", "cerrado"], [producto.nombre.toLowerCase()]);
    refrescar();
  });
}

// ---------- Jefes: mover / asignar desde la ficha ----------
export async function cambiarEtapaLead(leadId: string, etapaId: string) {
  return seguro(async () => {
    await exigirSeccion("cola", "crm", "agendas", "clientes"); // H5
    const { lead, perfil, proyecto } = await leadPermitido(leadId);
    if (!esJefe(perfil)) throw new ErrorUsuario("Solo el director o el CEO mueven leads en el CRM.");
    const { data: etapa } = await db().from("etapas").select("id, nombre, pipeline_id, pipelines!inner(proyecto_id, tipo)").eq("id", etapaId).eq("pipelines.proyecto_id", proyecto.id).eq("pipelines.tipo", "normal").maybeSingle();
    if (!etapa) throw new ErrorUsuario("Columna no encontrada.");
    await escribir(db().from("leads").update({ etapa_id: etapa.id, pipeline_id: etapa.pipeline_id }).eq("id", lead.id), "leads");
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: lead.id, perfil_id: perfil.id, tipo: "cambio_etapa", nota: `Movido a «${etapa.nombre}»` });
    refrescar();
  });
}

export async function asignarDesdeFicha(leadId: string, campo: "caller_id" | "closer_id", personaId: string) {
  return seguro(async () => {
    await exigirSeccion("cola", "crm", "agendas", "clientes"); // H5
    const { perfil, proyecto } = await leadPermitido(leadId);
    if (!esJefe(perfil)) throw new ErrorUsuario("Solo el director o el CEO asignan leads.");
    if (personaId) {
      const { data } = await db().from("miembros_proyecto").select("perfil_id").eq("proyecto_id", proyecto.id).eq("perfil_id", personaId).maybeSingle();
      if (!data) throw new ErrorUsuario("Esa persona no está en el proyecto.");
    }
    await escribir(db().from("leads").update({ [campo]: personaId || null }).eq("id", leadId), "leads");
    const { data: p } = personaId ? await db().from("perfiles").select("nombre").eq("id", personaId).single() : { data: null };
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "asignacion", nota: `${campo === "caller_id" ? "Caller" : "Closer"}: ${p?.nombre ?? "sin asignar"}` });
    refrescar();
  });
}

// Tablero del caller: devolver un lead a «Nuevo» (por ejemplo, si se marcó por error).
export async function volverANuevo(leadId: string) {
  return seguro(async () => {
    await exigirSeccion("cola", "crm", "agendas", "clientes"); // H5
    const { lead, perfil, proyecto } = await leadPermitido(leadId);
    await escribir(db().from("leads").update({ estado_caller: "nuevo", llamar_en: null }).eq("id", leadId), "leads"); // C11: «Leads»
    await moverAColumna(lead, "nuevo", ["nuevos", "nuevo"]);
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "nota", nota: "Devuelto a «Nuevo» en el tablero del caller" });
    refrescar();
  });
}
