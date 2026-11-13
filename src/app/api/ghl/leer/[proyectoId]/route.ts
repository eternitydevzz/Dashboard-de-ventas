import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dentroDelLimite } from "@/lib/limite";
import { sincronizarCalendarios } from "@/lib/ghl-sync";
import { leerLeadsGhl } from "@/lib/ghl-leads";
import { descifrar } from "@/lib/cifrado";
import { MAX_LEADS_POR_LECTURA, enviarPendientesGhl, type ResultadoEnvios } from "@/lib/ghl-envios";
import { avanzarEjecuciones, dispararEtiquetas } from "@/lib/workflows-motor";
import { guardarError } from "@/lib/errores-app";
import type { Proyecto } from "@/lib/tipos";

// Plan GHL, fase 3 (Cristian, 16 oct 2026): el programador de Supabase llama aquí cada 60 s para leer las citas
// de GHL (migración 20261017190000_leer_ghl_cada_60s.sql). Misma clave que el webhook (la del proyecto, en la
// cabecera x-eternity-secreto): así no hay otra clave que guardar en Vercel.

export const maxDuration = 60;

function igual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/ghl/leer/[proyectoId]">) {
  const { proyectoId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(proyectoId)) return NextResponse.json({ ok: false }, { status: 404 });
  const secreto = request.headers.get("x-eternity-secreto") ?? "";
  // D43: el proyecto se lee 1 vez aquí y se pasa a las citas, los envíos, los workflows y los leads (antes, 5 lecturas)
  const { data: proyecto } = await createAdminClient().from("proyectos").select("*").eq("id", proyectoId).maybeSingle<ProyectoGhl>();
  if (!proyecto || !secreto || !igual(secreto, proyecto.webhook_secreto)) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!(await dentroDelLimite(`ghl-leer-fallo:${ip}`, 30, 15 * 60_000))) return NextResponse.json({ ok: false, error: "Demasiados intentos" }, { status: 429 });
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  // Como mucho una lectura cada 25 s por proyecto (si una tarda, la siguiente no se monta encima)
  if (!(await dentroDelLimite(`ghl-leer:${proyectoId}`, 1, 25_000))) return NextResponse.json({ ok: true, saltada: true });
  // Citas y leads van por separado: si falla una parte, la otra se lee igual
  // Plan GHL, fase 1 (6 nov 2026): antes de leer los leads se mandan a GHL los de las Entradas que ya esperaron.
  // Van primero: así, cuando su contacto vuelve en la lectura, el lead ya tiene su ghl_contact_id y no se duplica.
  const inicio = Date.now();
  let envios: ResultadoEnvios | null = null;
  let wfHechas: number | null = null;
  // F3: cada error va al registro y a «otros errores» de los avisos del CEO (mismo texto = un aviso con contador)
  const anotar = async (parte: string, textos: string[]) => {
    console.error(`[ghl-leer] ${parte}`, proyectoId, textos.join(" | "));
    for (const t of textos) await guardarError(`ghl-leer ${parte}`, t, proyectoId);
  };
  const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const enviarYLeer = async () => {
    try {
      envios = await enviarPendientes(proyecto);
      if (envios.errores.length) await anotar("envíos", envios.errores.slice(0, 3));
    } catch (e) {
      await anotar("envíos", [motivo(e)]);
    }
    // Workflows, 4a-1 y 4a-2 (7 nov 2026): avanzan los que ya tocan (en prueba no llaman a GHL; en real, sí). Comparten el
    // tope de leads por lectura con el envío de hoy (MAX_LEADS_POR_LECTURA, src/lib/ghl-envios.ts).
    // Un fallo no para la lectura.
    try {
      // Cada lead con fallo ya está en `errores` (también los que se reintentan): no se cuentan dos veces
      const usados = envios ? envios.enviados + envios.errores.length : 0;
      const ghl = (() => {
        try {
          const x = conGhl(proyecto);
          return { locationId: x.proyecto.ghl_location_id as string, token: x.token };
        } catch {
          return undefined;
        }
      })();
      const wf = await avanzarEjecuciones(proyectoId, { limite: Math.max(0, MAX_LEADS_POR_LECTURA - usados), ghl });
      wfHechas = wf.hechas;
      if (wf.errores.length) await anotar("workflows", wf.errores.slice(0, 3));
    } catch (e) {
      await anotar("workflows", [motivo(e)]);
    }
    return leerLeads(proyecto);
  };
  const [citas, leads] = await Promise.allSettled([sincronizarCalendarios(proyectoId, { proyecto }), enviarYLeer()]);
  if (citas.status === "fulfilled" && citas.value.errores.length) await anotar("citas", citas.value.errores.slice(0, 3));
  // Si la lectura de citas revienta entera, ghl_ultimo_resultado no se actualiza: el error queda aquí
  if (citas.status === "rejected") await anotar("citas", [motivo(citas.reason)]);
  if (leads.status === "fulfilled" && (leads.value.errores.length || leads.value.avisos.length)) await anotar("leads", [...leads.value.errores, ...leads.value.avisos].slice(0, 3));
  if (leads.status === "rejected") await anotar("leads", [motivo(leads.reason)]);
  // Medición (plan GHL 4.5): una línea por lectura, sin datos personales (null = esa parte falló)
  const en = envios as ResultadoEnvios | null;
  console.log(`[ghl-leer] medicion proyecto=${proyectoId} ms=${Date.now() - inicio} enviados=${en?.enviados ?? null} errores=${en?.errores.length ?? null} workflows=${wfHechas} citas_nuevas=${citas.status === "fulfilled" ? citas.value.nuevas : null}`);
  if (citas.status === "rejected" && leads.status === "rejected") return NextResponse.json({ ok: false, error: "No se pudo leer GHL" }, { status: 500 });
  const c = citas.status === "fulfilled" ? citas.value : null;
  const l = leads.status === "fulfilled" ? leads.value : null;
  return NextResponse.json({
    ok: true,
    envios: en ? { enviados: en.enviados, reintentos: en.reintentos, errores: en.errores.length } : { fallo: true },
    citas: c ? { nuevas: c.nuevas, actualizadas: c.actualizadas, canceladas: c.canceladas, errores: c.errores.length } : { fallo: true },
    leads: l ? { nuevos: l.nuevos, actualizados: l.actualizados, completados: l.completados, cambiados: l.cambiados, puestosAlDia: l.puestosAlDia, espejo: l.espejo ?? null, avisos: l.avisos.length, errores: l.errores.length } : { fallo: true },
  });
}

type ProyectoGhl = Proyecto & { ghl_token: string | null; ghl_location_id: string | null };
function conGhl(proyecto: ProyectoGhl) {
  if (!proyecto.ghl_token || !proyecto.ghl_location_id) throw new Error("Falta conectar GHL");
  return { proyecto, token: descifrar(proyecto.ghl_token, "el token de GHL") };
}

// Leads por API (Cristian, 16-17 oct 2026): contactos nuevos de GHL → su pipeline en la app (por su etiqueta)
async function leerLeads(p: ProyectoGhl) {
  const { proyecto, token } = conGhl(p);
  return leerLeadsGhl(proyecto, token);
}

async function enviarPendientes(p: ProyectoGhl) {
  const { proyecto, token } = conGhl(p);
  const proyectoId = proyecto.id;
  const r = await enviarPendientesGhl(proyecto, token);
  // A3: las etiquetas nuevas que puso «Qué hacer en GHL» arrancan los workflows de etiqueta; un fallo no para la lectura
  for (const n of r.nuevas) await dispararEtiquetas(proyectoId, n.leadId, n.etiquetas).catch((e) => console.error("[ghl-leer] workflows de etiqueta", proyectoId, e instanceof Error ? e.message : e));
  return r;
}
