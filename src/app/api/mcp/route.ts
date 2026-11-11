import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { anotar, bloqueado, dentroDelLimite } from "@/lib/limite";
import { perfilDeClave, sesionMcpDe } from "@/lib/mcp/clave";
import { conSesionMcp } from "@/lib/mcp/sesion-mcp";
import { herramientaAsignar, herramientaKpis } from "@/lib/mcp/herramientas";
import { esError, seguro } from "@/lib/resultado";

// MCP del dashboard, Fase 2 (Cristian, 11 nov 2026; plan en VENTAS/API-DASHBOARD). Claude Code llama aquí con
// «Authorization: Bearer <clave personal>». Sin estado: un servidor MCP por petición (como pide Vercel).
// Cada herramienta se ejecuta «como» la persona de la clave, con sus permisos de la app.

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
        "Asigna, reasigna o desasigna el caller y/o el closer de uno o varios leads, como en el CRM del dashboard (CEO y directores). Se acepta el nombre o el id de la persona; null la quita. Si hay dos personas con el mismo nombre, no asigna y pregunta.",
      inputSchema: {
        proyecto: PROYECTO,
        leadIds: z.array(z.string().uuid()).min(1).max(2000).describe("Ids de los leads."),
        caller: z.string().nullable().optional().describe("Nombre o id del caller; null para quitarlo; sin poner, no se cambia."),
        closer: z.string().nullable().optional().describe("Nombre o id del closer; null para quitarlo; sin poner, no se cambia."),
      },
    },
    async ({ proyecto, ...a }) => ejecutar(proyecto, () => herramientaAsignar(a))
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
