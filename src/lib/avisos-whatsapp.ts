import "server-only";
import { db } from "@/lib/datos";
import { guardarError } from "@/lib/errores-app";
import { CAMPOS_FICHA, limpiarFicha, type Ficha } from "@/lib/ficha-cualificacion";
import { dinero, fechaHora } from "@/lib/formato";
import { ABIERTAS } from "@/lib/llamadas";
import { chatIdDe, enviarWhatsapp, whatsappConfigurado } from "@/lib/whatsapp";
import { leerConfigsWhatsapp } from "@/lib/whatsapp-config";
import { nombreZona, zonaPersona } from "@/lib/zona-persona";
import type { ConfigWhatsapp, Proyecto } from "@/lib/tipos";

// Fase D-3 (Jose, 17 nov 2026): aviso por WhatsApp al EQUIPO al agendar una cita y al cerrar una venta: al closer,
// al caller que la agendó y al grupo de los CEO (Administración → WhatsApp). Al lead no se le escribe (lo hace GHL).
// Reglas: sin WhatsApp configurado no se hace nada (ni lecturas); solo citas abiertas y futuras; solo personas
// activas y con número con prefijo de país; una sola vez por evento, origen y destino (reserva en whatsapp_envios
// antes de mandar; en las citas el origen lleva la hora, así un cambio de hora es otro aviso). Cada persona ve la
// hora en su zona (N2) y el grupo, en la del proyecto con su nombre. Se llama dentro de after(): NUNCA lanza.
const PREFIJO = "[avisos-whatsapp]";
const RESERVANDO = "enviando"; // error de la fila mientras se manda; si se queda así, el envío no terminó
const SIN_PREFIJO = "Sin prefijo de país (+)";
const NO_ES_NUMERO = "No es un número de teléfono (con +)";

export type MotivoCita = "agendada" | "reagendada";
export type PersonaAviso = { id: string; nombre: string; whatsapp: string | null; rol: string; zona_horaria?: string | null; activo: boolean };
// destino = lo que se guarda en whatsapp_envios (el chatId, o «perfil:<id>» si la persona no tiene un número válido)
// quien (Fase E): a quién va, para elegir el texto (la plantilla con la ficha al closer y al grupo; al caller, el corto)
export type DestinoAviso = { destino: string; chatId: string | null; error: string | null; para: "persona" | "grupo"; quien: "closer" | "caller" | "grupo"; zona: string };
type Evento = "cita" | "venta";
type Lead = { nombre: string | null; apellido: string | null; telefono?: string | null } | null;

const nombreLead = (l: Lead) => [l?.nombre, l?.apellido].filter(Boolean).join(" ") || "Sin nombre";

export function textoCita(o: { motivo: MotivoCita; lead: string; fecha: string; zona: string; para: "persona" | "grupo"; closer: string | null; agendo: string | null }) {
  const hora = fechaHora(o.fecha, { zona_horaria: o.zona as Proyecto["zona_horaria"] });
  return [
    o.motivo === "reagendada" ? "🔁 Cita cambiada de hora" : "📅 Nueva cita",
    `Lead: ${o.lead}`,
    `Cuándo: ${hora} (${o.para === "persona" ? "tu hora" : `hora de ${nombreZona(o.zona)}`})`,
    `Closer: ${o.closer ?? "sin asignar"}`,
    o.agendo ? `La consiguió: ${o.agendo}` : "La reservó el lead en el calendario",
  ].join("\n");
}

// Fase E (Jose, 18 nov): la plantilla solo si el caller rellenó algo de los 11 del formulario (los antiguos no cuentan)
export const tieneFicha = (f: Ficha) => CAMPOS_FICHA.some(({ k }) => !!f[k]);

// «viernes 20 nov a las 17:30», en la zona dada
function diaYHora(fecha: string, zona: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("es-ES", { timeZone: zona, weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(fecha))
      .map((x) => [x.type, x.value])
  );
  return `${p.weekday} ${p.day} ${p.month} a las ${p.hour}:${p.minute}`;
}

// La plantilla de Jose (negritas de WhatsApp: un asterisco), una línea en blanco entre campos y «—» si falta
export function textoPlantillaCita(o: { motivo: MotivoCita; lead: string; telefono: string | null; fecha: string; zona: string; para: "persona" | "grupo"; closer: string | null; ficha: Ficha }) {
  const f = o.ficha;
  const raya = (v: string | null | undefined) => v || "—";
  const cuando = `${diaYHora(o.fecha, o.zona)} (${o.para === "persona" ? "tu hora" : `hora de ${nombreZona(o.zona)}`})`;
  const situacion = [f.edad && `Edad: ${f.edad}`, f.situacion].filter(Boolean).join(" · ");
  return [
    `${o.motivo === "reagendada" ? "🔁" : "📅"} *LLAMADA LEAD (${o.lead}) – ${cuando} MEET* @ ${o.closer ?? "sin asignar"}`,
    `*Contacto:* ${raya(o.telefono)}`,
    `*Contexto del lead:* ${raya(f.contexto)}`,
    `*Experiencia:* ${raya(f.experiencia)}`,
    `*Motivación:* ${raya(f.motivacion)}`,
    `*Precio:* ${f.importe ? `Se le informó de una inversión de ${f.importe}.` : "—"}`,
    `*Respuesta:* ${raya(f.respuesta)}`,
    `*Situación profesional y actual:* ${raya(situacion)}`,
    `*Decisión de compra:* ${raya(f.decision)}`,
    `*Ubicación:* ${raya(f.lugar)}`,
    `*Conclusión:* ${raya(f.conclusion)}`,
    `*Tiempo disponible:* ${raya(f.tiempo)}`,
  ].join("\n\n");
}

export function textoVenta(o: { lead: string; producto: string; importe: number; moneda: Proyecto["moneda"]; vendedor: string | null; caller: string | null }) {
  const importe = dinero(o.importe, { moneda: o.moneda }, Number.isInteger(o.importe) ? 0 : 2);
  return ["💰 Venta cerrada", `Lead: ${o.lead}`, `Programa: ${o.producto} · ${importe}`, `Vendió: ${o.vendedor ?? "—"} · Caller: ${o.caller ?? "—"}`].join("\n");
}

// El número de una PERSONA: con prefijo de país («+…», tras quitar espacios). Un id de chat o de grupo (@c.us,
// @g.us) solo vale para el grupo de los CEO, no en un perfil.
function numeroPersona(whatsapp: string | null): { chatId: string | null; error: string | null } {
  const valor = (whatsapp ?? "").replace(/\s/g, "");
  if (!valor) return { chatId: null, error: null };
  if (/@(g|c)\.us$/i.test(valor)) return { chatId: null, error: NO_ES_NUMERO };
  if (!valor.startsWith("+")) return { chatId: null, error: SIN_PREFIJO };
  const chatId = chatIdDe(valor);
  return chatId ? { chatId, error: null } : { chatId: null, error: "Número no válido" };
}

// A quién se manda según la configuración. Las personas de baja, fuera. La misma persona (o número) dos veces, una.
export function destinosDe(config: ConfigWhatsapp, personas: { closer: PersonaAviso | null; caller: PersonaAviso | null }, grupo: string | null | undefined, zonaProyecto: string): DestinoAviso[] {
  const lista: DestinoAviso[] = [];
  const poner = (d: DestinoAviso) => {
    if (!lista.some((x) => x.destino === d.destino)) lista.push(d);
  };
  const persona = (p: PersonaAviso | null, quien: "closer" | "caller") => {
    if (!p || !p.activo) return;
    const n = numeroPersona(p.whatsapp);
    poner({ destino: n.chatId ?? `perfil:${p.id}`, chatId: n.chatId, error: n.error, para: "persona", quien, zona: zonaPersona(p, { zona_horaria: zonaProyecto }) });
  };
  if (config.a_closer) persona(personas.closer, "closer"); // primero: si es también el caller, se queda como closer
  if (config.a_caller) persona(personas.caller, "caller");
  const idGrupo = config.a_grupo ? chatIdDe(grupo) : null;
  if (idGrupo?.endsWith("@g.us")) poner({ destino: idGrupo, chatId: idGrupo, error: null, para: "grupo", quien: "grupo", zona: zonaProyecto });
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

async function leerPersonas(ids: (string | null | undefined)[]): Promise<Map<string, PersonaAviso>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map();
  const filas = leido(await db().from("perfiles").select("id, nombre, whatsapp, rol, zona_horaria, activo").in("id", unicos), "los perfiles") as PersonaAviso[] | null;
  return new Map((filas ?? []).map((p) => [p.id, p]));
}

type Origen = { proyectoId: string; evento: Evento; origenId: string };

// Reserva (una fila por destino; si ya estaba, no entra y no se manda), envío (un texto por destino) y resultado
async function mandar(o: Origen & { destinos: DestinoAviso[]; texto: (d: DestinoAviso) => string }) {
  if (!o.destinos.length) return;
  const filas = o.destinos.map((d) => ({ proyecto_id: o.proyectoId, evento: o.evento, origen_id: o.origenId, destino: d.destino, estado: d.chatId ? "fallo" : "sin_numero", error: d.chatId ? RESERVANDO : d.error }));
  const { data: entraron, error } = await db().from("whatsapp_envios").upsert(filas, { onConflict: "evento,origen_id,destino", ignoreDuplicates: true }).select("destino");
  if (error) throw new Error(`No se pudo reservar el envío: ${error.message}`);
  const nuevos = new Set(((entraron ?? []) as { destino: string }[]).map((f) => f.destino));
  // Los que tienen el mismo texto (misma zona) van en el mismo envío
  const porTexto = new Map<string, string[]>();
  for (const d of o.destinos) {
    if (!d.chatId || !nuevos.has(d.destino)) continue;
    const t = o.texto(d);
    porTexto.set(t, [...(porTexto.get(t) ?? []), d.chatId]);
  }
  for (const [texto, chats] of porTexto) await apuntar(o, await enviarWhatsapp(chats, texto));
}

async function apuntar(o: Origen, r: Awaited<ReturnType<typeof enviarWhatsapp>>) {
  const fila = () => db().from("whatsapp_envios");
  if (r.enviados.length) {
    const { error: e } = await fila().update({ estado: "enviado", error: null }).eq("evento", o.evento).eq("origen_id", o.origenId).in("destino", r.enviados);
    if (e) console.error(PREFIJO, `no se pudo apuntar como enviado (${o.evento} ${o.origenId}): ${e.message}`);
  }
  for (const f of r.fallos) {
    const { error: e } = await fila().update({ estado: "fallo", error: f.motivo.slice(0, 300) }).eq("evento", o.evento).eq("origen_id", o.origenId).eq("destino", f.destino);
    if (e) console.error(PREFIJO, `no se pudo apuntar el fallo (${o.evento} ${o.origenId}): ${e.message}`);
  }
  // A la campana del CEO (errores_app): solo el motivo de WAHA (whatsapp.ts ya quita la clave), sin datos del lead
  for (const motivo of new Set(r.fallos.map((f) => f.motivo.slice(0, 200)))) {
    await guardarError("whatsapp", `Aviso de ${o.evento} por WhatsApp no enviado: ${motivo}`, o.proyectoId);
  }
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

type CitaAviso = { id: string; proyecto_id: string; fecha: string; estado: string; closer_id: string | null; agendada_por: string | null; lead_id: string; leads: Lead };

// Fase E: la ficha de cualificación del lead (vacía si no tiene). Si no se puede leer, vacía también: sale el aviso
// corto en vez de ninguno, y el fallo queda en el registro
async function leerFicha(leadId: string): Promise<Ficha> {
  const { data, error } = await db().from("cualificaciones").select("campos").eq("lead_id", leadId).maybeSingle();
  if (error) {
    console.error(PREFIJO, `no se pudo leer la ficha del lead ${leadId} (sale el aviso corto): ${error.message}`);
    return {};
  }
  return limpiarFicha((data as { campos: unknown } | null)?.campos);
}

export async function avisarCita(citaId: string, motivo: MotivoCita = "agendada"): Promise<void> {
  if (!whatsappConfigurado()) return;
  try {
    const cita = leido(await db().from("citas").select("id, proyecto_id, fecha, estado, closer_id, agendada_por, lead_id, leads(nombre, apellido, telefono)").eq("id", citaId).maybeSingle(), "la cita") as CitaAviso | null;
    if (!cita) return;
    if (new Date(cita.fecha).getTime() < Date.now()) return; // solo futuras: importar citas viejas no avisa
    if (!(ABIERTAS as readonly string[]).includes(cita.estado)) return; // una cancelada o terminada no es «nueva cita»
    const config = (await leerConfigsWhatsapp(cita.proyecto_id)).cita;
    if (!config.activo) return;
    const [proyecto, personas, ficha] = await Promise.all([leerProyecto(cita.proyecto_id), leerPersonas([cita.closer_id, cita.agendada_por]), leerFicha(cita.lead_id)]);
    const closer = cita.closer_id ? personas.get(cita.closer_id) ?? null : null;
    const caller = cita.agendada_por ? personas.get(cita.agendada_por) ?? null : null;
    const agendo = cita.agendada_por ? caller?.nombre ?? "—" : null; // null = la reservó el lead (GHL)
    const fecha = new Date(cita.fecha).toISOString();
    const lead = nombreLead(cita.leads);
    const conPlantilla = tieneFicha(ficha); // Fase E: sin ficha (p. ej. la reservó el lead en GHL), el corto para todos
    await mandar({
      proyectoId: cita.proyecto_id,
      evento: "cita",
      origenId: `${cita.id}:${fecha}`, // la hora en la clave: otra hora, otro aviso; la misma, ninguno
      destinos: destinosDe(config, { closer, caller }, proyecto.whatsapp_grupo, proyecto.zona_horaria),
      texto: (d) =>
        conPlantilla && d.quien !== "caller"
          ? textoPlantillaCita({ motivo, lead, telefono: cita.leads?.telefono ?? null, fecha, zona: d.zona, para: d.para, closer: closer?.nombre ?? null, ficha })
          : textoCita({ motivo, lead, fecha, zona: d.zona, para: d.para, closer: closer?.nombre ?? null, agendo }),
    });
  } catch (e) {
    console.error(PREFIJO, `cita ${citaId}: ${mensaje(e)}`);
  }
}

type VentaAviso = { id: string; proyecto_id: string; lead_id: string; vendedor_id: string | null; facturacion: number; productos: { nombre: string } | null; leads: (Lead & { caller_id: string | null }) | null };

// Como Finanzas (finanzas.ts, callerDe): el caller es quien agendó la cita cerrada de ese lead con el closer que
// vendió (la más reciente), si es caller y el vendedor es closer. Sin esa cita, el caller del lead (como antes).
async function callerDeVenta(venta: VentaAviso): Promise<{ id: string | null; personas: Map<string, PersonaAviso> }> {
  const cerrada = venta.vendedor_id
    ? (leido(
        await db().from("citas").select("agendada_por").eq("lead_id", venta.lead_id).eq("estado", "cerrada").eq("closer_id", venta.vendedor_id).not("agendada_por", "is", null).order("fecha", { ascending: false }).limit(1).maybeSingle(),
        "la cita de la venta"
      ) as { agendada_por: string | null } | null)
    : null;
  const personas = await leerPersonas([venta.vendedor_id, cerrada?.agendada_por, venta.leads?.caller_id]);
  if (!cerrada) return { id: venta.leads?.caller_id ?? null, personas };
  const vendedor = venta.vendedor_id ? personas.get(venta.vendedor_id) : undefined;
  const agendo = cerrada.agendada_por ? personas.get(cerrada.agendada_por) : undefined;
  return { id: vendedor?.rol === "closer" && agendo?.rol === "caller" ? agendo.id : null, personas };
}

export async function avisarVenta(ventaId: string): Promise<void> {
  if (!whatsappConfigurado()) return;
  try {
    const venta = leido(await db().from("ventas").select("id, proyecto_id, lead_id, vendedor_id, facturacion, productos(nombre), leads(nombre, apellido, caller_id)").eq("id", ventaId).maybeSingle(), "la venta") as VentaAviso | null;
    if (!venta) return;
    const config = (await leerConfigsWhatsapp(venta.proyecto_id)).venta;
    if (!config.activo) return;
    const [proyecto, quien] = await Promise.all([leerProyecto(venta.proyecto_id), callerDeVenta(venta)]);
    const vendedor = venta.vendedor_id ? quien.personas.get(venta.vendedor_id) ?? null : null;
    const caller = quien.id ? quien.personas.get(quien.id) ?? null : null;
    const texto = textoVenta({ lead: nombreLead(venta.leads), producto: venta.productos?.nombre ?? "Sin producto", importe: Number(venta.facturacion), moneda: proyecto.moneda, vendedor: vendedor?.nombre ?? null, caller: caller?.nombre ?? null });
    await mandar({ proyectoId: venta.proyecto_id, evento: "venta", origenId: venta.id, destinos: destinosDe(config, { closer: vendedor, caller }, proyecto.whatsapp_grupo, proyecto.zona_horaria), texto: () => texto });
  } catch (e) {
    console.error(PREFIJO, `venta ${ventaId}: ${mensaje(e)}`);
  }
}
