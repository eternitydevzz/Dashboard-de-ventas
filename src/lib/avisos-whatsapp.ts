import "server-only";
import { db } from "@/lib/datos";
import { dinero, fechaHora } from "@/lib/formato";
import { ABIERTAS } from "@/lib/llamadas";
import { chatIdDe, enviarWhatsapp, whatsappConfigurado } from "@/lib/whatsapp";
import { leerConfigsWhatsapp } from "@/lib/whatsapp-config";
import type { ConfigWhatsapp, Proyecto } from "@/lib/tipos";

// Fase D-3 (Jose, 17 nov 2026): aviso por WhatsApp al EQUIPO al agendar una cita y al cerrar una venta: al closer,
// al caller que la agendó y al grupo de los CEO (Administración → WhatsApp). Al lead no se le escribe (lo hace GHL).
// Reglas: sin WhatsApp configurado no se hace nada (ni lecturas); solo citas abiertas y futuras (importar citas viejas
// no avisa); una sola vez por evento, origen y destino (reserva en whatsapp_envios antes de mandar). Se llama dentro
// de after(): NUNCA lanza, cualquier error va a console.error con el prefijo de abajo.
const PREFIJO = "[avisos-whatsapp]";
const RESERVANDO = "enviando"; // error de la fila mientras se manda; si se queda así, el envío no terminó

export type MotivoCita = "agendada" | "reagendada";
export type PersonaAviso = { id: string; nombre: string; whatsapp: string | null };
// destino = lo que se guarda en whatsapp_envios (el chatId, o «perfil:<id>» si la persona no tiene número)
export type DestinoAviso = { destino: string; chatId: string | null };
type Evento = "cita" | "venta";
type Lead = { nombre: string | null; apellido: string | null } | null;

const nombreLead = (l: Lead) => [l?.nombre, l?.apellido].filter(Boolean).join(" ") || "Sin nombre";

export function textoCita(o: { lead: string; fecha: string; zona: Proyecto["zona_horaria"]; closer: string | null; agendo: string | null; motivo: MotivoCita }) {
  const cabeza = o.motivo === "reagendada" ? "🔁 Cita reagendada" : "📅 Nueva cita";
  return `${cabeza} · ${o.lead} · ${fechaHora(o.fecha, { zona_horaria: o.zona })} · Closer: ${o.closer ?? "sin asignar"} · Agendó: ${o.agendo ?? "GHL"}`;
}

export function textoVenta(o: { lead: string; producto: string; importe: number; moneda: Proyecto["moneda"]; vendedor: string | null }) {
  return `💰 Venta cerrada · ${o.lead} · ${o.producto} · ${dinero(o.importe, { moneda: o.moneda })} · Vendió: ${o.vendedor ?? "sin vendedor"}`;
}

// A quién se manda según la configuración. La misma persona (o el mismo número) dos veces, una sola.
export function destinosDe(config: ConfigWhatsapp, personas: { closer: PersonaAviso | null; caller: PersonaAviso | null }, grupo: string | null | undefined): DestinoAviso[] {
  const lista: DestinoAviso[] = [];
  const poner = (d: DestinoAviso) => {
    if (!lista.some((x) => x.destino === d.destino)) lista.push(d);
  };
  const persona = (p: PersonaAviso | null) => {
    if (!p) return;
    const chatId = chatIdDe(p.whatsapp);
    poner({ destino: chatId ?? `perfil:${p.id}`, chatId });
  };
  if (config.a_closer) persona(personas.closer);
  if (config.a_caller) persona(personas.caller);
  const idGrupo = config.a_grupo ? chatIdDe(grupo) : null;
  if (idGrupo) poner({ destino: idGrupo, chatId: idGrupo });
  return lista;
}

const leido = <T,>(r: { data: T; error: { message: string } | null }, que: string): T => {
  if (r.error) throw new Error(`No se pudo leer ${que}: ${r.error.message}`);
  return r.data;
};

async function leerProyecto(id: string) {
  const p = leido(await db().from("proyectos").select("id, zona_horaria, moneda, whatsapp_grupo").eq("id", id).maybeSingle(), "el proyecto");
  if (!p) throw new Error("Proyecto no encontrado");
  return p as Pick<Proyecto, "id" | "zona_horaria" | "moneda" | "whatsapp_grupo">;
}

async function leerPersonas(ids: (string | null)[]): Promise<Map<string, PersonaAviso>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map();
  const filas = leido(await db().from("perfiles").select("id, nombre, whatsapp").in("id", unicos), "los perfiles") as PersonaAviso[] | null;
  return new Map((filas ?? []).map((p) => [p.id, p]));
}

// Reserva (una fila por destino; si ya estaba, no entra y no se manda), envío y resultado de cada destino
async function mandar(o: { proyectoId: string; evento: Evento; origenId: string; destinos: DestinoAviso[]; texto: string }) {
  if (!o.destinos.length) return;
  const filas = o.destinos.map((d) => ({ proyecto_id: o.proyectoId, evento: o.evento, origen_id: o.origenId, destino: d.destino, estado: d.chatId ? "fallo" : "sin_numero", error: d.chatId ? RESERVANDO : null }));
  const { data: entraron, error } = await db().from("whatsapp_envios").upsert(filas, { onConflict: "evento,origen_id,destino", ignoreDuplicates: true }).select("destino");
  if (error) throw new Error(`No se pudo reservar el envío: ${error.message}`);
  const nuevos = new Set(((entraron ?? []) as { destino: string }[]).map((f) => f.destino));
  const aMandar = o.destinos.filter((d) => d.chatId && nuevos.has(d.destino)).map((d) => d.chatId as string);
  if (!aMandar.length) return;

  const r = await enviarWhatsapp(aMandar, o.texto);
  const fila = () => db().from("whatsapp_envios");
  if (r.enviados.length) {
    const { error: e } = await fila().update({ estado: "enviado", error: null }).eq("evento", o.evento).eq("origen_id", o.origenId).in("destino", r.enviados);
    if (e) console.error(PREFIJO, `no se pudo apuntar como enviado (${o.evento} ${o.origenId}): ${e.message}`);
  }
  for (const f of r.fallos) {
    const { error: e } = await fila().update({ estado: "fallo", error: f.motivo.slice(0, 300) }).eq("evento", o.evento).eq("origen_id", o.origenId).eq("destino", f.destino);
    if (e) console.error(PREFIJO, `no se pudo apuntar el fallo (${o.evento} ${o.origenId}): ${e.message}`);
  }
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

type CitaAviso = { id: string; proyecto_id: string; fecha: string; estado: string; closer_id: string | null; agendada_por: string | null; leads: Lead };

export async function avisarCita(citaId: string, motivo: MotivoCita = "agendada"): Promise<void> {
  if (!whatsappConfigurado()) return;
  try {
    const cita = leido(await db().from("citas").select("id, proyecto_id, fecha, estado, closer_id, agendada_por, leads(nombre, apellido)").eq("id", citaId).maybeSingle(), "la cita") as CitaAviso | null;
    if (!cita) return;
    if (new Date(cita.fecha).getTime() < Date.now()) return; // solo futuras: importar citas viejas no avisa
    if (!(ABIERTAS as readonly string[]).includes(cita.estado)) return; // una cancelada o terminada no es «nueva cita»
    const config = (await leerConfigsWhatsapp(cita.proyecto_id)).cita;
    if (!config.activo) return;
    const [proyecto, personas] = await Promise.all([leerProyecto(cita.proyecto_id), leerPersonas([cita.closer_id, cita.agendada_por])]);
    const closer = cita.closer_id ? personas.get(cita.closer_id) ?? null : null;
    const caller = cita.agendada_por ? personas.get(cita.agendada_por) ?? null : null;
    const texto = textoCita({ lead: nombreLead(cita.leads), fecha: cita.fecha, zona: proyecto.zona_horaria, closer: closer?.nombre ?? null, agendo: caller?.nombre ?? null, motivo });
    await mandar({ proyectoId: cita.proyecto_id, evento: "cita", origenId: cita.id, destinos: destinosDe(config, { closer, caller }, proyecto.whatsapp_grupo), texto });
  } catch (e) {
    console.error(PREFIJO, `cita ${citaId}: ${mensaje(e)}`);
  }
}

type VentaAviso = { id: string; proyecto_id: string; vendedor_id: string | null; facturacion: number; productos: { nombre: string } | null; leads: (Lead & { caller_id: string | null }) | null };

export async function avisarVenta(ventaId: string): Promise<void> {
  if (!whatsappConfigurado()) return;
  try {
    const venta = leido(await db().from("ventas").select("id, proyecto_id, vendedor_id, facturacion, productos(nombre), leads(nombre, apellido, caller_id)").eq("id", ventaId).maybeSingle(), "la venta") as VentaAviso | null;
    if (!venta) return;
    const config = (await leerConfigsWhatsapp(venta.proyecto_id)).venta;
    if (!config.activo) return;
    const callerId = venta.leads?.caller_id ?? null;
    const [proyecto, personas] = await Promise.all([leerProyecto(venta.proyecto_id), leerPersonas([venta.vendedor_id, callerId])]);
    const vendedor = venta.vendedor_id ? personas.get(venta.vendedor_id) ?? null : null;
    const caller = callerId ? personas.get(callerId) ?? null : null;
    const texto = textoVenta({ lead: nombreLead(venta.leads), producto: venta.productos?.nombre ?? "Sin producto", importe: Number(venta.facturacion), moneda: proyecto.moneda, vendedor: vendedor?.nombre ?? null });
    await mandar({ proyectoId: venta.proyecto_id, evento: "venta", origenId: venta.id, destinos: destinosDe(config, { closer: vendedor, caller }, proyecto.whatsapp_grupo), texto });
  } catch (e) {
    console.error(PREFIJO, `venta ${ventaId}: ${mensaje(e)}`);
  }
}
