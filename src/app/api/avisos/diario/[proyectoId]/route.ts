import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dentroDelLimite } from "@/lib/limite";
import { enviarDiario } from "@/lib/avisos-diario";

// Plan GHL F2: el programador de Supabase llama aquí a las 06:00 y 07:00 UTC (migración 20261109120100_avisos_diario.sql).
// Misma clave que la lectura de GHL (la del proyecto, en la cabecera x-eternity-secreto).

function igual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/avisos/diario/[proyectoId]">) {
  const { proyectoId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(proyectoId)) return NextResponse.json({ ok: false }, { status: 404 });
  const secreto = request.headers.get("x-eternity-secreto") ?? "";
  const { data: proyecto } = await createAdminClient().from("proyectos").select("id, webhook_secreto").eq("id", proyectoId).maybeSingle();
  if (!proyecto || !secreto || !igual(secreto, proyecto.webhook_secreto)) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!(await dentroDelLimite(`avisos-diario-fallo:${ip}`, 30, 15 * 60_000))) return NextResponse.json({ ok: false, error: "Demasiados intentos" }, { status: 429 });
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  try {
    const r = await enviarDiario(proyectoId);
    if (r.estado !== "fallo") return NextResponse.json({ ok: true, estado: r.estado });
    console.error("[avisos-diario]", proyectoId, r.motivo);
  } catch (e) {
    console.error("[avisos-diario]", proyectoId, e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ok: false, error: "No se pudo mandar el email diario" }, { status: 500 });
}
