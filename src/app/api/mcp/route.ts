import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { anotar, bloqueado, dentroDelLimite } from "@/lib/limite";
import { perfilDeClave, sesionMcpDe } from "@/lib/mcp/clave";
import { conSesionMcp } from "@/lib/mcp/sesion-mcp";
import { herramientaAsignar, herramientaKpis } from "@/lib/mcp/herramientas";
import { herramientaBorrarMiembro, herramientaCrearMiembro, herramientaDarDeBaja } from "@/lib/mcp/equipo";
import { ESTADOS, herramientaAgendar, herramientaBorrar, herramientaCrearLead, herramientaEstado, herramientaEtiquetas, herramientaMover, herramientaMoverCita, herramientaNota, herramientaVenta } from "@/lib/mcp/cambiar";
import { herramientaEnlaceGrabacion, herramientaGrabacionesPendientes, herramientaSubirTranscripcion, herramientaTranscripciones } from "@/lib/mcp/grabaciones";
import { herramientaDuplicados, herramientaObjetivos, herramientaAgenda, herramientaBuscarLeads, herramientaFichaLead, herramientaFinanzas, herramientaFunnel, herramientaRanking } from "@/lib/mcp/lectura";
import { esError, seguro } from "@/lib/resultado";

// MCP del dashboard, Fase 2 (Cristian, 11 nov 2026; plan en VENTAS/API-DASHBOARD). Claude Code llama aquí con
// «Authorization: Bearer <clave personal>». Sin estado: un servidor MCP por petición (como pide Vercel).
// Cada herramienta se ejecuta «como» la persona de la clave, con sus permisos de la app.

const CONFIRMAR = z.boolean().optional().describe("Sin poner: solo enseña qué haría (vista previa). true: lo hace. Úsalo solo después de que la persona apruebe la vista previa.");
const PROYECTO = z.string().optional().describe("Nombre o id del proyecto (p. ej. «Maestria»). Obligatorio si la persona tiene varios.");

function servidor(perfilId: string) {
  const server = new McpServer({ name: "eternity-dashboard", version: "0.1.0" });
  // Ejecuta la herramienta con la sesión de la persona; los errores de la app vuelven como texto (isError)
  const ejecutar = async (proyecto: string | undefined, fn: () => Promise<unknown>) => {
    const r = await seguro(async () => conSesionMcp(await sesionMcpDe(perfilId, proyecto), fn));
    if (esError(r)) return { content: [{ type: "text" as const, text: r.error }], isError: true };
    return { content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }] };
  };

  server.registerTool(
    "kpis",
    {
      description:
        "KPIs por persona (callers y closers) del periodo, iguales a la pantalla KPIs → «Por persona» del dashboard. Por defecto, este mes, en la zona horaria del proyecto.",
      inputSchema: {
        proyecto: PROYECTO,
        periodo: z.enum(["dia", "semana", "mes", "anio", "rango"]).optional().describe("Por defecto «mes». «rango» necesita desde y hasta."),
        n: z.number().int().min(-600).max(600).optional().describe("0 = el actual, -1 = el anterior (p. ej. el mes pasado)."),
        desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("AAAA-MM-DD, solo con periodo «rango»."),
        hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("AAAA-MM-DD, incluido, solo con periodo «rango»."),
      },
    },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaKpis(a))
  );

  server.registerTool(
    "asignar_leads",
    {
      description:
        "Asigna, reasigna o desasigna el caller y/o el closer de uno o varios leads, como en el CRM del dashboard (CEO y directores). Se acepta el nombre o el id de la persona; null la quita. Si hay dos personas con el mismo nombre, no asigna y pregunta. Con más de un lead, primero devuelve una vista previa y solo lo hace con confirmar: true.",
      inputSchema: {
        proyecto: PROYECTO,
        leadIds: z.array(z.string().uuid()).min(1).max(2000).describe("Ids de los leads."),
        caller: z.string().nullable().optional().describe("Nombre o id del caller; null para quitarlo; sin poner, no se cambia."),
        closer: z.string().nullable().optional().describe("Nombre o id del closer; null para quitarlo; sin poner, no se cambia."),
        confirmar: CONFIRMAR,
      },
    },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaAsignar(a))
  );

  // ---------- Equipo (Cristian, 13 nov): crear, dar de baja y borrar personas (src/lib/mcp/equipo.ts) ----------
  server.registerTool(
    "crear_miembro",
    {
      description:
        "Da de alta a una persona del equipo con cuenta, como «Dar de alta un miembro» en Equipo. Nadie ve contraseñas: le llega un email con un enlace (24 h) para entrar y crear la suya. Área por defecto «Ventas»; el puesto, el de su rol. Primero devuelve una vista previa y solo la crea con confirmar: true.",
      inputSchema: {
        proyecto: PROYECTO,
        nombre: z.string().min(1).max(120),
        email: z.string().email(),
        telefono: z.string().min(7).max(25).describe("Con prefijo, p. ej. +34 600 000 000."),
        rol: z.enum(["caller", "closer", "director", "ceo"]),
        mercado: z.enum(["es", "latam"]).describe("País del equipo: «es» = España, «latam» = Latam."),
        area: z.string().optional().describe("Nombre del área. Sin poner: «Ventas»."),
        confirmar: CONFIRMAR,
      },
    },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaCrearMiembro(a))
  );

  const SALIDA = {
    proyecto: PROYECTO,
    persona: z.string().describe("Nombre o id de la persona."),
    leadsA: z.string().optional().describe("Si tiene leads: nombre o id de quien se los queda, o «nadie» para dejarlos sin asignar. Obligatorio si tiene leads."),
    confirmar: CONFIRMAR,
  };
  server.registerTool(
    "dar_de_baja_miembro",
    {
      description:
        "Da de baja a una persona (solo CEO): no puede entrar, sale del equipo y pasa a «Ver inactivos»; se conserva su historial y se puede deshacer. Si tiene leads, pide a quién pasarlos (leadsA). Primero vista previa; solo lo hace con confirmar: true.",
      inputSchema: SALIDA,
    },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaDarDeBaja(a))
  );
  server.registerTool(
    "borrar_miembro",
    {
      description:
        "Borra para siempre a una persona (solo CEO): su cuenta y su sitio en el equipo; sus llamadas, citas y ventas se quedan sin quién las hizo. NO se puede deshacer: si basta con que no entre, usa dar_de_baja_miembro. Si tiene leads, pide a quién pasarlos (leadsA). Primero vista previa; solo lo hace con confirmar: true.",
      inputSchema: SALIDA,
    },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaBorrarMiembro(a))
  );

  // ---------- Fase 3: herramientas para leer (src/lib/mcp/lectura.ts) ----------
  // Funnel y Ranking cuentan el periodo como sus pantallas: hoy, semana, mes, todo o rango
  const periodoDe = z.enum(["hoy", "semana", "mes", "todo", "rango"]).optional();
  // Finanzas y Agendas, como las suyas: dia, semana, mes, anio o rango, más n (0 = el actual, -1 = el anterior)
  const periodoNav = z.enum(["dia", "semana", "mes", "anio", "rango"]).optional();
  const n = z.number().int().min(-600).max(600).optional().describe("0 = el actual, -1 = el anterior (p. ej. el mes pasado).");
  const fecha = (que: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe(`AAAA-MM-DD (${que}), solo con periodo «rango».`);

  server.registerTool(
    "funnel",
    {
      description: "Cifras del Funnel (KPIs → Funnel): facturación, cash, ventas, llamadas, leads, agendados, no-show, perdidos, tasas y la serie diaria. Solo CEO y directores. Por defecto, desde el día 1 de este mes.",
      inputSchema: { proyecto: PROYECTO, periodo: periodoDe.describe("Por defecto «mes»."), desde: fecha("desde"), hasta: fecha("hasta, incluido"), vendedor: z.string().optional().describe("Nombre o id de un caller o closer."), producto: z.string().optional().describe("Nombre o id del producto (solo afecta a ventas, facturación y cash).") },
    },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaFunnel(a))
  );
  server.registerTool(
    "ranking",
    {
      description: "Ranking del equipo, igual que la pantalla Ranking: callers por agendados y closers por facturación. Por defecto, esta semana.",
      inputSchema: { proyecto: PROYECTO, periodo: periodoDe.describe("Por defecto «semana»."), desde: fecha("desde"), hasta: fecha("hasta, incluido") },
    },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaRanking(a))
  );
  server.registerTool(
    "finanzas",
    {
      description: "Resumen de Finanzas (Finanzas → Resumen): facturación, cash collected, profit, ROAS, cuentas por cobrar, gastos, ingresos extra, de dónde viene el cash, cobros por día y el cambio frente al periodo anterior. Por defecto, este mes.",
      inputSchema: { proyecto: PROYECTO, periodo: periodoNav.describe("Por defecto «mes»."), n, desde: fecha("desde"), hasta: fecha("hasta, incluido") },
    },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaFinanzas(a))
  );
  server.registerTool(
    "buscar_leads",
    {
      description:
        "Busca leads como el CRM: por texto (nombre, email o teléfono), país, pipeline, columna, caller, closer, etiqueta y «sin actividad desde hace X días». Devuelve el total y los primeros (50 por defecto, máximo 200), del más reciente al más antiguo.",
      inputSchema: {
        proyecto: PROYECTO,
        texto: z.string().optional(),
        pais: z.string().optional().describe("Nombre en español («España»), código («ES») o «Sin país»."),
        pipeline: z.string().optional().describe("Nombre o id del pipeline."),
        columna: z.string().optional().describe("Nombre o id de la columna (necesita el pipeline)."),
        caller: z.string().nullable().optional().describe("Nombre o id; null = sin caller."),
        closer: z.string().nullable().optional().describe("Nombre o id; null = sin closer."),
        etiqueta: z.string().optional(),
        sinActividadDias: z.number().int().min(0).max(3650).optional().describe("Solo los leads sin ninguna actividad en estos días."),
        limite: z.number().int().min(1).max(200).optional(),
      },
    },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaBuscarLeads(a))
  );
  server.registerTool(
    "ficha_lead",
    {
      description: "Ficha de un lead: datos, dónde está, caller, closer, estado, respuestas del formulario, historial (30 últimos), citas, ventas, llamadas de GHL con su análisis IA, análisis de los closers y grabaciones de los callers.",
      inputSchema: { proyecto: PROYECTO, leadId: z.string().uuid().describe("Id del lead (sale en buscar_leads).") },
    },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaFichaLead(a))
  );
  server.registerTool(
    "agenda_citas",
    {
      description:
        "Citas de los closers, como Agendas → Llamadas: por periodo (por la fecha de la cita), closer y estado, o solo las que ya pasaron sin resultado. Incluye los contadores de la cabecera (pendientes, cerradas y perdidas del mes). Por defecto, este mes; como mucho 300 citas en la lista.",
      inputSchema: {
        proyecto: PROYECTO,
        periodo: periodoNav.describe("Por defecto «mes»."),
        n,
        desde: fecha("desde"),
        hasta: fecha("hasta, incluido"),
        closer: z.string().optional().describe("Nombre o id del closer."),
        estado: z.string().optional().describe("pendiente, confirmacion_pendiente, confirmada, cerrada, seguimiento, perdida, no_show, reagendada, cancelada, no_califica o «abiertas»."),
        sinResultado: z.boolean().optional().describe("true = solo citas ya pasadas que siguen abiertas (sin resultado)."),
      },
    },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaAgenda(a))
  );
  // ---------- Fase 4: herramientas para cambiar (src/lib/mcp/cambiar.ts). Varios leads, borrar, agendar y vender: vista previa y confirmar ----------
  const LEADS = z.array(z.string().uuid()).min(1).max(2000).describe("Ids de los leads (salen en buscar_leads).");
  server.registerTool(
    "mover_leads",
    { description: "Mueve uno o varios leads a una columna de un pipeline, como el CRM. Con más de un lead, vista previa y confirmar.", inputSchema: { proyecto: PROYECTO, leadIds: LEADS, pipeline: z.string().describe("Nombre o id del pipeline."), columna: z.string().describe("Nombre o id de la columna."), confirmar: CONFIRMAR } },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaMover(a))
  );
  server.registerTool(
    "etiquetas_leads",
    { description: "Añade y/o quita etiquetas a uno o varios leads (CEO y directores). Con más de un lead, vista previa y confirmar.", inputSchema: { proyecto: PROYECTO, leadIds: LEADS, anadir: z.array(z.string().max(60)).max(20).optional(), quitar: z.array(z.string().max(60)).max(20).optional(), confirmar: CONFIRMAR } },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaEtiquetas(a))
  );
  server.registerTool(
    "crear_lead",
    { description: "Crea un lead a mano, como «Nuevo lead» del CRM (CEO y directores). Necesita nombre y email o teléfono.", inputSchema: { proyecto: PROYECTO, nombre: z.string().min(1).max(200), email: z.string().email().optional(), telefono: z.string().max(40).optional().describe("Con prefijo, p. ej. +34600000000."), pipeline: z.string().optional().describe("Nombre o id del pipeline; entra en su primera columna.") } },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaCrearLead(a))
  );
  server.registerTool(
    "borrar_leads",
    { description: "Borra leads (solo el CEO, como el CRM). Siempre vista previa primero: avisa de los que se saltan (con citas o ventas) y de los que pueden volver desde GHL. No se puede deshacer.", inputSchema: { proyecto: PROYECTO, leadIds: LEADS, confirmar: CONFIRMAR } },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaBorrar(a))
  );
  server.registerTool(
    "mover_cita",
    { description: "Mueve una cita a una columna libre del pipeline «Closers» (o null: de vuelta a la de su estado).", inputSchema: { proyecto: PROYECTO, citaId: z.string().uuid().describe("Id de la cita (sale en agenda_citas)."), columna: z.string().nullable() } },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaMoverCita(a))
  );
  server.registerTool(
    "cambiar_estado",
    {
      description: "Cambia el estado de un lead con los mismos botones de la ficha: nuevo, link_enviado, wsp_enviado, no_responde, no_interesa, seguimiento, llamar_luego, descartado, reagendado o confirma_agenda. Para «Agendado» usa agendar_cita.",
      inputSchema: { proyecto: PROYECTO, leadId: z.string().uuid(), estado: z.enum(ESTADOS as [string, ...string[]]), nota: z.string().max(4000).optional(), estrellas: z.number().int().min(2).max(5).optional().describe("Para no_interesa, seguimiento y llamar_luego."), llamarEn: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional().describe("Para llamar_luego: AAAA-MM-DDTHH:MM, hora del proyecto.") },
    },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaEstado(a as Parameters<typeof herramientaEstado>[0]))
  );
  server.registerTool(
    "anadir_nota",
    { description: "Añade una nota al historial de un lead.", inputSchema: { proyecto: PROYECTO, leadId: z.string().uuid(), nota: z.string().min(1).max(4000) } },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaNota(a))
  );
  server.registerTool(
    "agendar_cita",
    { description: "Agenda una cita de un lead con un closer (la crea también en el calendario de GHL). Siempre vista previa primero y confirmar.", inputSchema: { proyecto: PROYECTO, leadId: z.string().uuid(), closer: z.string().describe("Nombre o id del closer."), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).describe("AAAA-MM-DDTHH:MM en la hora del proyecto."), nota: z.string().max(4000).optional(), estrellas: z.number().int().min(2).max(5).optional(), confirmar: CONFIRMAR } },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaAgendar(a))
  );
  server.registerTool(
    "registrar_venta",
    {
      description: "Registra una venta de un lead, como «Registrar venta» de la ficha (no los callers). Cierra su cita abierta y deja lo pendiente en Finanzas. Siempre vista previa primero y confirmar.",
      inputSchema: { proyecto: PROYECTO, leadId: z.string().uuid(), producto: z.string().describe("Nombre o id del producto."), facturacion: z.number().positive(), cash: z.number().min(0).describe("Cobrado ahora (entre 0 y la facturación)."), tipoPago: z.enum(["completo", "reserva", "cuotas", "mensual"]), numCuotas: z.number().int().min(2).max(60).optional(), metodo: z.enum(["stripe", "transferencia", "otro"]), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("AAAA-MM-DD; sin poner, hoy."), vendedor: z.string().optional().describe("Nombre o id; sin poner, el closer de su cita."), nota: z.string().max(4000).optional(), confirmar: CONFIRMAR },
    },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaVenta(a))
  );

  // ---------- Fase 5: grabaciones de los callers y transcripciones (src/lib/mcp/grabaciones.ts) ----------
  server.registerTool(
    "grabaciones_pendientes",
    { description: "Grabaciones de los callers que aún no tienen transcripción (CEO y directores), de la más antigua a la más nueva, con sus minutos.", inputSchema: { proyecto: PROYECTO, limite: z.number().int().min(1).max(500).optional() } },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaGrabacionesPendientes(a))
  );
  server.registerTool(
    "enlace_grabacion",
    { description: "Enlace firmado (1 hora) para descargar el audio de una grabación de un caller y transcribirlo en local con Whisper.", inputSchema: { proyecto: PROYECTO, grabacionId: z.string().uuid() } },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaEnlaceGrabacion(a))
  );
  server.registerTool(
    "subir_transcripcion",
    { description: "Guarda la transcripción de una grabación de un caller (como «Guardar texto» de la pantalla Grabaciones; CEO y directores).", inputSchema: { proyecto: PROYECTO, grabacionId: z.string().uuid(), texto: z.string().min(1).max(200000) } },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaSubirTranscripcion(a))
  );
  server.registerTool(
    "transcripciones",
    { description: "Transcripciones para analizar: de los callers (grabaciones), de los closers (Fathom) o de GHL. Filtra por persona y por los últimos días; como mucho 50.", inputSchema: { proyecto: PROYECTO, fuente: z.enum(["callers", "fathom", "ghl"]), persona: z.string().optional(), dias: z.number().int().min(1).max(3650).optional(), limite: z.number().int().min(1).max(50).optional() } },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaTranscripciones(a))
  );

  // ---------- Fase 7: objetivos y duplicados (src/lib/mcp/lectura.ts) ----------
  server.registerTool(
    "objetivos",
    { description: "Avance de los objetivos (KPIs → Objetivos): del equipo y de cada persona, por cifra y periodo (meta, hecho y %). Para ver los que van sin cumplir. Por defecto, hoy; `ver` = otra fecha pasada.", inputSchema: { proyecto: PROYECTO, ver: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("AAAA-MM-DD.") } },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaObjetivos(a))
  );
  server.registerTool(
    "duplicados",
    { description: "Posibles leads duplicados (CRM → Duplicados): grupos con el mismo teléfono. Solo los enseña; para unirlos, el botón «Unir» de la app.", inputSchema: { proyecto: PROYECTO } },
    async ({ proyecto }) => ejecutar(proyecto, () => herramientaDuplicados())
  );
  return server;
}

const noAutorizado = (status = 401, error = "No autorizado") => Response.json({ error }, { status });

async function atender(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const fallo = `mcp-fallo:${ip}`;
  if (await bloqueado(fallo, 30, 15 * 60_000)) return noAutorizado(429, "Demasiados intentos");
  const clave = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let perfilId: string | null;
  try {
    perfilId = clave ? await perfilDeClave(clave) : null;
  } catch (e) {
    console.error("[mcp] no se pudo comprobar la clave:", e instanceof Error ? e.message : e);
    return noAutorizado(503, "La base de datos no responde. Inténtalo en un momento.");
  }
  if (!perfilId) {
    await anotar(fallo);
    return noAutorizado();
  }
  if (!(await dentroDelLimite(`mcp:${perfilId}`, 120, 60_000))) return noAutorizado(429, "Demasiadas peticiones");
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await servidor(perfilId).connect(transport);
  return transport.handleRequest(req);
}

export const POST = atender;
export const GET = atender;
export const DELETE = atender;
