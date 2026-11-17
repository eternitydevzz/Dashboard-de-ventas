import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dentroDelLimite } from "@/lib/limite";
import { enviarReporte } from "@/lib/reporte-envio";
import { igual, ipDe } from "@/lib/ip-envio";
import type { MercadoReporte } from "@/lib/tipos";

// Fase C: el programador de Supabase llama aquí cada 15 min (migración 20261125100000_reporte_diario.sql).
// Misma clave que el email de las 8:00 (la del proyecto, en la cabecera x-eternity-secreto).
// Se intentan los 2 reportes (España y USA); si uno falla, el otro se manda igual.

export const maxDuration = 60;

const MERCADOS: MercadoReporte[] = ["es", "latam"];

export async function POST(request: NextRequest, ctx: RouteContext<"/api/avisos/reporte/[proyectoId]">) {
  const { proyectoId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(proyectoId)) return NextResponse.json({ ok: false }, { status: 404 });
  const secreto = request.headers.get("x-eternity-secreto") ?? "";
  const { data: proyecto } = await createAdminClient().from("proyectos").select("id, webhook_secreto").eq("id", proyectoId).maybeSingle();
  if (!proyecto || !secreto || !igual(secreto, proyecto.webhook_secreto)) {
    const ip = ipDe(request.headers);
    if (!(await dentroDelLimite(`avisos-reporte-fallo:${ip}`, 30, 15 * 60_000))) return NextResponse.json({ ok: false, error: "Demasiados intentos" }, { status: 429 });
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const ahora = new Date();
  const [es, latam] = await Promise.all(
    MERCADOS.map(async (mercado) => {
      const r = await enviarReporte(proyectoId, mercado, ahora).catch((e: unknown) => ({ estado: "fallo" as const, motivo: e instanceof Error ? e.message : "Error desconocido" }));
      if (r.estado === "fallo") console.error("[avisos-reporte]", proyectoId, mercado, r.motivo);
      return r.estado;
    })
  );
  const ok = es !== "fallo" && latam !== "fallo";
  return NextResponse.json({ ok, es, latam }, { status: ok ? 200 : 500 });
}
