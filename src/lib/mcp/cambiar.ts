import "server-only";
import { getSesion } from "@/lib/sesion";
import { db, porTrozos } from "@/lib/datos";
import { ErrorUsuario, esError, type ConError } from "@/lib/resultado";
import { fechaHora, localAIso } from "@/lib/formato";
import { elegir } from "@/lib/mcp/lectura";
import { borrarLeads, cambiarEtiquetas, crearLeadManual, moverCitaColumna, moverLead, moverLeads } from "@/app/(panel)/crm/acciones";
import { agendarCita, anadirNota, confirmarAgenda, registrarLlamada, registrarVenta, type ResultadoSimple } from "@/app/(panel)/leads/acciones";

// MCP, Fase 4 (11 nov 2026; plan en VENTAS/API-DASHBOARD): herramientas para cambiar. Cada una llama a la acción de la app
// tal cual (permisos, historial, GHL y refresco, los de la app). Decisión de Cristian: lo pequeño va directo; borrar,
// los cambios de varios leads, agendar y vender enseñan antes qué harían y solo se hacen con `confirmar: true`.

const MAX = 2000; // el mismo tope que las acciones masivas del CRM

type Vista = { vistaPrevia: true; haria: string; leads?: { id: string; nombre: string }[]; avisos?: string[]; paraHacerlo: string };
const vista = (haria: string, extra: Partial<Vista> = {}): Vista => ({ vistaPrevia: true, haria, ...extra, paraHacerlo: "No se ha cambiado nada. Si está bien, vuelve a llamar igual con confirmar: true." });

// Una acción de la app devuelve { error } en vez de lanzarlo: aquí se convierte en error de la herramienta
function ok<T>(r: T | ConError): T {
  if (esError(r)) throw new ErrorUsuario(r.error);
  return r as T;
}

// Los leads de este proyecto (en el orden pedido); si falta alguno, no se hace nada
async function leadsDe(ids: string[]) {
  const unicos = [...new Set((ids ?? []).filter(Boolean))];
  if (!unicos.length) throw new ErrorUsuario("No hay leads.");
  if (unicos.length > MAX) throw new ErrorUsuario(`Como mucho ${MAX} leads a la vez.`);
  const { proyecto } = await getSesion();
  const encontrados: { id: string; nombre: string; apellido: string | null; pipeline_id: string | null }[] = [];
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await db().from("leads").select("id, nombre, apellido, pipeline_id").in("id", unicos.slice(i, i + 200)).eq("proyecto_id", proyecto.id);
    if (error) throw new Error(`No se pudieron leer los leads: ${error.message}`);
    encontrados.push(...(data ?? []));
  }
  if (encontrados.length !== unicos.length) throw new ErrorUsuario(`${unicos.length - encontrados.length} de esos leads no son de ${proyecto.nombre}. No se ha cambiado nada.`);
  return encontrados.map((l) => ({ id: l.id, nombre: `${l.nombre} ${l.apellido ?? ""}`.trim(), pipeline_id: l.pipeline_id }));
}
const muestra = (l: { id: string; nombre: string }[]) => l.slice(0, 30).map(({ id, nombre }) => ({ id, nombre }));

// Columna por pipeline + columna (nombre o id)
async function columnaDe(pipeline: string, columna: string) {
  const { proyecto } = await getSesion();
  const { data: pipes } = await db().from("pipelines").select("id, nombre").eq("proyecto_id", proyecto.id).order("orden");
  const p = elegir((pipes ?? []) as { id: string; nombre: string }[], pipeline, "pipeline");
  const { data: etapas } = await db().from("etapas").select("id, nombre").eq("pipeline_id", p.id).order("orden");
  const e = elegir((etapas ?? []) as { id: string; nombre: string }[], columna, "columna");
  return { id: e.id, nombre: `${p.nombre} → ${e.nombre}` };
}

// ---------- mover_leads ----------
export async function herramientaMover(a: { leadIds: string[]; pipeline: string; columna: string; confirmar?: boolean }) {
  const leads = await leadsDe(a.leadIds);
  const destino = await columnaDe(a.pipeline, a.columna);
  if (leads.length === 1) {
    ok(await moverLead(leads[0].id, destino.id));
    return { hecho: `«${leads[0].nombre}» movido a ${destino.nombre}.` };
  }
  if (!a.confirmar) return vista(`Mover ${leads.length} leads a ${destino.nombre}.`, { leads: muestra(leads) });
  const n = ok(await moverLeads(leads.map((l) => l.id), destino.id));
  return { hecho: `${n} leads movidos a ${destino.nombre}.` };
}

// ---------- etiquetas_leads ----------
export async function herramientaEtiquetas(a: { leadIds: string[]; anadir?: string[]; quitar?: string[]; confirmar?: boolean }) {
  const leads = await leadsDe(a.leadIds);
  const anadir = a.anadir ?? [];
  const quitar = a.quitar ?? [];
  const que = [anadir.length && `añadir ${anadir.map((x) => `«${x}»`).join(", ")}`, quitar.length && `quitar ${quitar.map((x) => `«${x}»`).join(", ")}`].filter(Boolean).join(" y ");
  if (leads.length > 1 && !a.confirmar) return vista(`En ${leads.length} leads: ${que}.`, { leads: muestra(leads) });
  const n = ok(await cambiarEtiquetas(leads.map((l) => l.id), anadir, quitar));
  return { hecho: `Etiquetas cambiadas en ${n} lead${n === 1 ? "" : "s"}: ${que}.` };
}

// ---------- crear_lead ----------
export async function herramientaCrearLead(a: { nombre: string; email?: string; telefono?: string; pipeline?: string }) {
  const { proyecto } = await getSesion();
  const fd = new FormData();
  fd.set("nombre", a.nombre);
  if (a.email) fd.set("email", a.email);
  if (a.telefono) fd.set("telefono", a.telefono);
  if (a.pipeline) {
    const { data: pipes } = await db().from("pipelines").select("id, nombre").eq("proyecto_id", proyecto.id).eq("tipo", "normal").order("orden");
    fd.set("pipeline", elegir((pipes ?? []) as { id: string; nombre: string }[], a.pipeline, "pipeline").id);
  }
  ok(await crearLeadManual(fd));
  // La acción no devuelve el id: el lead recién creado por su email o teléfono
  let q = db().from("leads").select("id, nombre, apellido").eq("proyecto_id", proyecto.id).eq("origen", "manual").order("creado_en", { ascending: false }).limit(1);
  q = a.email ? q.eq("email", a.email.trim().toLowerCase()) : q.eq("telefono", (a.telefono ?? "").trim());
  const { data } = await q.maybeSingle();
  return { hecho: `Lead «${a.nombre.trim()}» creado en ${proyecto.nombre}.`, leadId: data?.id ?? null };
}

// ---------- borrar_leads (solo el CEO, como en el CRM; siempre con confirmación) ----------
export async function herramientaBorrar(a: { leadIds: string[]; confirmar?: boolean }) {
  const leads = await leadsDe(a.leadIds);
  const ids = leads.map((l) => l.id);
  if (!a.confirmar) {
    const { proyecto } = await getSesion();
    // Ola 3 (C9): como el CRM, todas las citas y ventas (en trozos y paginadas); si una lectura falla, error
    const [citas, ventas, { data: webinar }] = await Promise.all([
      porTrozos<{ lead_id: string; ghl_cita_id: string | null }>(ids, (t, d, h) => db().from("citas").select("lead_id, ghl_cita_id").in("lead_id", t).order("id").range(d, h)),
      porTrozos<{ lead_id: string }>(ids, (t, d, h) => db().from("ventas").select("lead_id").in("lead_id", t).order("id").range(d, h)),
      db().from("pipelines").select("id").eq("proyecto_id", proyecto.id).ilike("nombre", "%webinar 1%"),
    ]);
    const protegidos = new Set([...citas, ...ventas].map((x) => x.lead_id));
    const conGhl = new Set(citas.filter((c) => c.ghl_cita_id).map((c) => c.lead_id));
    const espejo = new Set((webinar ?? []).map((p) => p.id as string));
    const vuelven = leads.filter((l) => conGhl.has(l.id) || (l.pipeline_id && espejo.has(l.pipeline_id)));
    const avisos = [
      protegidos.size ? `${protegidos.size} tienen citas o ventas: el CRM no los borra en masa (se saltan), para no perder sus citas, ventas, cobros y comisiones.` : "",
      vuelven.length ? `${vuelven.length} tienen cita en GHL o están en «Webinar 1»: pueden volver con la lectura de GHL (cada 60 s) si no se borran también en GHL: ${vuelven.slice(0, 10).map((l) => l.nombre).join(", ")}.` : "",
      "Borrar no se puede deshacer.",
    ].filter(Boolean);
    return vista(`Borrar ${leads.length - protegidos.size} de ${leads.length} leads.`, { leads: muestra(leads), avisos });
  }
  const r = ok(await borrarLeads(ids));
  return { hecho: `Borrados ${r.borrados}; saltados ${r.saltados} (con citas o ventas).` };
}

// ---------- mover_cita (pipeline «Closers») ----------
export async function herramientaMoverCita(a: { citaId: string; columna: string | null }) {
  const { proyecto } = await getSesion();
  let etapaId: string | null = null;
  if (a.columna !== null) {
    const { data: pipes } = await db().from("pipelines").select("id").eq("proyecto_id", proyecto.id).eq("tipo", "closers");
    const { data: etapas } = await db().from("etapas").select("id, nombre").in("pipeline_id", (pipes ?? []).map((p) => p.id)).order("orden");
    etapaId = elegir((etapas ?? []) as { id: string; nombre: string }[], a.columna, "columna de «Closers»").id;
  }
  ok(await moverCitaColumna(a.citaId, etapaId));
  return { hecho: a.columna === null ? "Cita devuelta a la columna de su estado." : `Cita movida a «${a.columna}».` };
}

// ---------- cambiar_estado (los botones de la ficha) ----------
export const ESTADOS: (ResultadoSimple | "confirma_agenda")[] = ["nuevo", "link_enviado", "wsp_enviado", "no_responde", "no_interesa", "seguimiento", "llamar_luego", "descartado", "reagendado", "confirma_agenda"];

export async function herramientaEstado(a: { leadId: string; estado: (typeof ESTADOS)[number]; nota?: string; estrellas?: number; llamarEn?: string }) {
  if (a.estado === "confirma_agenda") ok(await confirmarAgenda(a.leadId));
  else ok(await registrarLlamada(a.leadId, a.estado, a.nota ?? "", a.estrellas, a.llamarEn));
  return { hecho: `Estado cambiado a «${a.estado}».` };
}

// ---------- anadir_nota ----------
export async function herramientaNota(a: { leadId: string; nota: string }) {
  if (!a.nota.trim()) throw new ErrorUsuario("Escribe la nota.");
  ok(await anadirNota(a.leadId, a.nota));
  return { hecho: "Nota añadida al historial." };
}

// ---------- agendar_cita (crea la cita también en el calendario de GHL; siempre con confirmación) ----------
export async function herramientaAgendar(a: { leadId: string; closer: string; fecha: string; nota?: string; estrellas?: number; confirmar?: boolean }) {
  const { perfil, proyecto } = await getSesion();
  const [lead] = await leadsDe([a.leadId]);
  const { data } = await db().from("miembros_proyecto").select("perfil_id, perfiles!inner(nombre, rol, tambien_closer, activo)").eq("proyecto_id", proyecto.id);
  const closers = (data ?? [])
    .map((m) => ({ id: m.perfil_id as string, ...(m.perfiles as unknown as { nombre: string; rol: string; tambien_closer: boolean | null; activo: boolean }) }))
    .filter((p) => p.activo && (p.rol === "closer" || p.tambien_closer)); // C9: un closer desactivado no se agenda
  const closer = elegir(closers, a.closer, "closer");
  const cuando = fechaHora(localAIso(a.fecha, proyecto.zona_horaria), proyecto); // valida el formato AAAA-MM-DDTHH:MM
  if (!a.confirmar)
    return vista(`Agendar a «${lead.nombre}» con ${closer.nombre} el ${cuando} (hora de ${proyecto.zona_horaria}).`, {
      avisos: [
        "La cita se crea también en el calendario de GHL del closer.",
        perfil.rol === "caller" ? "Como caller, el closer lo pone la rotación (como en la app)." : "",
      ].filter(Boolean),
    });
  const r = ok(await agendarCita(a.leadId, closer.id, a.fecha, a.nota ?? "", a.estrellas));
  return { hecho: `Cita de «${lead.nombre}» con ${closer.nombre} el ${cuando}.`, aviso: "aviso" in r ? r.aviso : null };
}

// ---------- registrar_venta (dinero, plazos y comisiones; siempre con confirmación) ----------
type ArgsVenta = { leadId: string; producto: string; facturacion: number; cash: number; tipoPago: "completo" | "reserva" | "cuotas" | "mensual"; numCuotas?: number; metodo: "stripe" | "transferencia" | "otro"; fecha?: string; vendedor?: string; nota?: string; confirmar?: boolean };

export async function herramientaVenta(a: ArgsVenta) {
  const { proyecto } = await getSesion();
  const [lead] = await leadsDe([a.leadId]);
  const { data: prods } = await db().from("productos").select("id, nombre").eq("proyecto_id", proyecto.id).order("orden");
  const producto = elegir((prods ?? []) as { id: string; nombre: string }[], a.producto, "producto");
  let vendedor: { id: string; nombre: string } | null = null;
  if (a.vendedor) {
    const { data } = await db().from("miembros_proyecto").select("perfil_id, perfiles!inner(nombre)").eq("proyecto_id", proyecto.id);
    vendedor = elegir((data ?? []).map((m) => ({ id: m.perfil_id as string, nombre: (m.perfiles as unknown as { nombre: string }).nombre })), a.vendedor, "vendedor");
  }
  const dinero = (n: number) => `${n} ${proyecto.moneda}`;
  if (!a.confirmar)
    return vista(
      `Registrar la venta de «${producto.nombre}» a «${lead.nombre}»: facturación ${dinero(a.facturacion)}, cobrado ahora ${dinero(a.cash)}, ${a.tipoPago}${a.numCuotas ? ` en ${a.numCuotas} cuotas` : ""}, por ${a.metodo}${a.fecha ? `, con fecha ${a.fecha}` : ", con fecha de hoy"}${vendedor ? `, a nombre de ${vendedor.nombre}` : ", a nombre del closer de su cita (o de quien la registra)"}.`,
      { avisos: ["El lead pasa a «vendido», su cita abierta se cierra y lo que falte por cobrar queda en «Pagos pendientes» de Finanzas. Cuenta para facturación y comisiones."] }
    );
  const fd = new FormData();
  fd.set("producto", producto.id);
  fd.set("facturacion", String(a.facturacion));
  fd.set("cash", String(a.cash));
  fd.set("tipo_pago", a.tipoPago);
  if (a.numCuotas) fd.set("num_cuotas", String(a.numCuotas));
  fd.set("metodo", a.metodo);
  if (a.fecha) fd.set("fecha", a.fecha);
  if (vendedor) fd.set("vendedor", vendedor.id);
  if (a.nota) fd.set("nota", a.nota);
  ok(await registrarVenta(a.leadId, fd));
  return { hecho: `Venta de «${producto.nombre}» registrada a «${lead.nombre}» (${dinero(a.facturacion)}).` };
}
