"use server";

import { exigirSeccion } from "@/lib/permisos";
import { ErrorUsuario, notaValida, seguro } from "@/lib/resultado";
import { revalidatePath } from "next/cache";
import { getSesion, esJefe } from "@/lib/auth";
import { db, registrarActividad, escribir } from "@/lib/datos";
import { fechaHora, localAIso } from "@/lib/formato";
import { estrellasEntre } from "@/lib/estrellas";
import { planDePagos } from "@/lib/finanzas";
import type { EstadoCaller, Lead, Perfil, Proyecto } from "@/lib/tipos";
import { leerNumero } from "@/lib/numero";
import { ABIERTAS } from "@/lib/llamadas";

const refrescar = () => revalidatePath("/", "layout");

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

// ---------- Caller: resultado de la llamada ----------
export async function registrarLlamada(
  leadId: string,
  resultado: "no_contesta" | "llamar_luego" | "no_interesa" | "contestado",
  nota: string,
  llamarEn?: string,
  estrellas?: number
) {
  return seguro(async () => {
    await exigirSeccion("cola", "crm", "agendas", "clientes"); // H5
    nota = notaValida(nota);
    const { lead, perfil, proyecto } = await leadPermitido(leadId);
    const estado = resultado === "contestado" ? lead.estado_caller : resultado;
    const n = resultado === "no_contesta" ? 1 : resultado === "contestado" && estrellas === undefined ? null : estrellasEntre(estrellas, 2, 5);
    // F3 (plan Callers, 7 nov): antes no se comprobaba el error y salía «Guardado» aunque el estado no cambiara
    await escribir(
      db()
        .from("leads")
        .update({
          estado_caller: estado,
          llamar_en: resultado === "llamar_luego" && llamarEn ? aIso(llamarEn, proyecto.zona_horaria) : null,
          ...(n ? { estrellas_caller: n } : {}),
        })
        .eq("id", leadId),
      "leads"
    );
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "llamada", resultado, nota: [n ? `${n}★` : "", nota].filter(Boolean).join(" · ") || null });
    if (resultado !== "contestado") await moverAColumna(lead, resultado, resultado === "no_interesa" ? ["descartados", "descartado"] : []);
    refrescar();
  });
}

export async function registrarWhatsapp(leadId: string, nota: string) {
  return seguro(async () => {
    await exigirSeccion("cola", "crm", "agendas", "clientes"); // H5
    nota = notaValida(nota);
    const { perfil, proyecto } = await leadPermitido(leadId);
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "whatsapp", nota: nota || "Mensaje de WhatsApp enviado" });
    refrescar();
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

// ---------- Link de agenda enviado (4.4, Cristian, 11 oct) ----------
// El caller manda al lead el link del calendario de GHL. El lead sale de la cola y vuelve a los 2 días si no ha
// llegado su cita; cuando llega, la agenda es de quien envió el link.
export async function marcarLinkEnviado(leadId: string, estrellas: number) {
  return seguro(async () => {
    await exigirSeccion("cola", "crm", "agendas", "clientes"); // H5
    const { perfil, proyecto } = await leadPermitido(leadId);
    // Cómo fue la llamada (2 a 5), como antes al agendar: se copian a la cita cuando llegue de GHL
    const n = estrellasEntre(estrellas, 2, 5);
    const ahora = new Date();
    await escribir(
      db()
        .from("leads")
        .update({ estado_caller: "link_enviado", estrellas_caller: n, link_enviado_por: perfil.id, link_enviado_en: ahora.toISOString(), llamar_en: new Date(ahora.getTime() + 2 * 86_400_000).toISOString() })
        .eq("id", leadId),
      "leads"
    );
    // Cuenta como contacto (como un WhatsApp)
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "whatsapp", nota: "Link de agenda enviado" });
    refrescar();
  });
}

// ---------- Agendar cita con un closer ----------
// 4.4 (Cristian, 11 oct): los callers ya no agendan a mano; mandan el link de GHL. Directores, CEO y closers sí.
export async function agendarCita(leadId: string, closerId: string, fechaLocal: string, nota: string, estrellas?: number) {
  return seguro(async () => {
    await exigirSeccion("cola", "crm", "agendas", "clientes"); // H5
    nota = notaValida(nota);
    const { lead, perfil, proyecto } = await leadPermitido(leadId);
    if (perfil.rol === "caller") throw new ErrorUsuario("Los callers no agendan a mano: manda el link de agenda al lead y pulsa «Link enviado».");
    if (!fechaLocal) throw new ErrorUsuario("Elige fecha y hora.");
    // Las estrellas de la llamada (2 a 5) son opcionales para quien agenda a mano (jefe o closer)
    const n = estrellas !== undefined ? estrellasEntre(estrellas, 2, 5) : null;
    const fecha = aIso(fechaLocal, proyecto.zona_horaria);
    const { data: closer } = await db()
      .from("miembros_proyecto")
      .select("perfil_id, perfiles!inner(rol, nombre)")
      .eq("proyecto_id", proyecto.id)
      .eq("perfil_id", closerId)
      .eq("perfiles.rol", "closer")
      .maybeSingle();
    if (!closer) throw new ErrorUsuario("Elige un closer del proyecto.");
    // Paso H6: un doble clic creaba dos citas iguales; la base ya no deja repetir lead, closer y hora
    const { error: errCita } = await db().from("citas").insert({ proyecto_id: proyecto.id, lead_id: leadId, closer_id: closerId, agendada_por: perfil.id, fecha, nota: nota || null, estrellas_caller: n });
    if (errCita?.code === "23505") throw new ErrorUsuario("Ese lead ya tiene una cita con ese closer a esa hora.");
    if (errCita) throw new Error(`No se pudo guardar en «citas»: ${errCita.message}`);
    // Arreglo 9: si agenda un jefe o un closer sin estrellas, no se borran las que puso el caller
    await escribir(db().from("leads").update({ estado_caller: "agendado", closer_id: closerId, llamar_en: null, ...(n !== null ? { estrellas_caller: n } : {}) }).eq("id", leadId), "leads");
    const nombreCloser = (closer as unknown as { perfiles: { nombre: string } }).perfiles.nombre;
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "cita", resultado: "agendada", nota: `Cita con ${nombreCloser}${n ? ` · ${n}★` : ""}${nota ? ` · ${nota}` : ""}` });
    await moverAColumna(lead, "agendado", ["agendados", "agendado", "agendan"]); // «Agendan»: como GHL (13 oct)
    refrescar();
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
    // Cristian (12 oct): el caller no cierra ventas; las registra el closer (o un jefe)
    if (perfil.rol === "caller") throw new ErrorUsuario("El caller no registra ventas: las cierra el closer.");
  
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
    else if (esJefe(perfil) && !vendedorForm && cita?.closer_id) vendedor = cita.closer_id;
    else if (esJefe(perfil) && vendedorForm) {
      const { data: delProyecto } = await db().from("miembros_proyecto").select("perfil_id").eq("proyecto_id", proyecto.id).eq("perfil_id", vendedorForm).maybeSingle();
      if (!delProyecto) throw new ErrorUsuario("El vendedor elegido no es de este proyecto.");
      vendedor = vendedorForm;
    }
  
    const { data: nueva, error } = await db().from("ventas").insert({
      proyecto_id: proyecto.id,
      lead_id: leadId,
      producto_id: producto.id,
      vendedor_id: vendedor,
      facturacion,
      cash_collected: cash,
      tipo_pago: tipo,
      num_cuotas: cuotas,
      metodo,
      nota: notaValida(String(formData.get("nota") ?? "")) || null,
      fecha,
    }).select("id").single();
    if (error) throw new ErrorUsuario(error.message);
    // Reserva o cuotas: lo que falta queda en «Pagos pendientes» con sus fechas (se pueden cambiar en Finanzas)
    const plazos = planDePagos({ facturacion, cobradoHoy: cash, tipo, numCuotas: cuotas, fecha });
    if (plazos.length) await db().from("vencimientos").insert(plazos.map((x) => ({ ...x, proyecto_id: proyecto.id, venta_id: nueva.id, lead_id: leadId })));
  
    await escribir(db().from("leads").update({ estado_caller: "vendido" }).eq("id", leadId), "leads");
    if (cita) {
      // Mejora de la pasada (Cristian, 11 oct): si la cita aún no ha llegado, se cierra con la hora de ahora
      // (como si se hubiera adelantado), para que cuente como asistida hoy; en el historial queda la que tenía.
      const ahora = new Date();
      const adelantada = cita.fecha && new Date(cita.fecha).getTime() > ahora.getTime();
      await db().from("citas").update({ estado: "cerrada", ...(adelantada ? { fecha: ahora.toISOString() } : {}), ...(estrellasCloser ? { estrellas_closer: estrellasCloser } : {}) }).eq("id", cita.id);
      if (adelantada) await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "cita", nota: `Cita adelantada: era el ${fechaHora(cita.fecha, proyecto)}` });
    }
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
    await escribir(db().from("leads").update({ estado_caller: "nuevo", llamar_en: null }).eq("id", leadId), "leads");
    await moverAColumna(lead, "nuevo", ["nuevos", "nuevo"]);
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "nota", nota: "Devuelto a «Nuevo» en el tablero del caller" });
    refrescar();
  });
}
