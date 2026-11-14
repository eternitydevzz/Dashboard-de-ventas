import Link from "next/link";
import { FileDown, Microscope } from "lucide-react";
import { db, todas } from "@/lib/datos";
import { dinero, fecha, pct } from "@/lib/formato";
import { notaLead, preguntasDe, type LeadQ, type Pesos } from "@/lib/cualificacion";
import { datosEstudio } from "@/lib/cualificacion-datos";
import { Seccion, Vacio } from "@/components/ui";
import type { Proyecto } from "@/lib/tipos";
import { TextoIa } from "../analisis/cliente";
import { CalcularScoring } from "./cualificacion-cliente";

type SP = Record<string, string | string[] | undefined>;

// 06 · Cualificación: Estudio (cash × llamada por respuesta) y Scoring IA. Solo director y CEO.
export async function Cualificacion({ proyecto, sp, baseQs }: { proyecto: Proyecto; sp: SP; baseQs: (c: Record<string, string | null>) => string }) {
  const ver = sp.cual === "scoring" ? "scoring" : "estudio";
  const leads = await todas<LeadQ & { nombre: string; apellido: string; estado_caller: string; creado_en: string }>((a, b) => db().from("leads").select("id, nombre, apellido, respuestas, estado_caller, creado_en").eq("proyecto_id", proyecto.id).order("id").range(a, b));
  const preguntas = preguntasDe(leads);
  const elegidas = (Array.isArray(sp.preg) ? sp.preg : typeof sp.preg === "string" ? [sp.preg] : []).filter((p) => preguntas.includes(p));
  const $ = (n: number) => dinero(n, proyecto);
  const conPreg = (lista: string[]) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && k !== "preg") as [string, string][]);
    for (const p of lista) q.append("preg", p);
    return `/closer/llamadas?${q}`;
  };
  const tabs = (
    <div className="flex rounded-lg border border-borde bg-panel-2 p-0.5">
      <Link prefetch={false} href={baseQs({ cual: null })} className={`rounded-md px-3 py-1.5 text-sm ${ver === "estudio" ? "bg-primario text-white" : "text-texto-2"}`}>Estudio</Link>
      <Link prefetch={false} href={baseQs({ cual: "scoring" })} className={`rounded-md px-3 py-1.5 text-sm ${ver === "scoring" ? "bg-primario text-white" : "text-texto-2"}`}>Scoring IA</Link>
    </div>
  );
  if (!preguntas.length) return <Seccion acciones={tabs}><Vacio icono={Microscope} texto="Aún no hay leads con respuestas del formulario (llegan con las landings o el CSV)." /></Seccion>;

  if (ver === "scoring") {
    const { data: sc } = await db().from("scoring_ia").select("*").eq("proyecto_id", proyecto.id).maybeSingle();
    const pesos = (sc?.pesos ?? {}) as Pesos;
    const ranking = sc
      ? leads.filter((l) => l.estado_caller !== "vendido").map((l) => ({ l, nota: notaLead(l.respuestas, pesos) })).filter((x) => x.nota !== null).sort((a, b) => b.nota! - a.nota! || b.l.creado_en.localeCompare(a.l.creado_en)).slice(0, 25)
      : [];
    return (
      <div className="space-y-4">
        <Seccion acciones={<div className="flex w-full flex-wrap items-center gap-2">{tabs}<div className="ml-auto"><CalcularScoring hay={!!sc} /></div></div>}>
          {!sc ? <p className="text-sm text-texto-2">La IA mira el estudio (solo respuestas y números, nunca nombres ni contactos) y da puntos a cada respuesta. Con eso, cada lead tiene una nota de 0 a 100 (50 = neutro).</p> : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div><div className="titulo-seccion mb-2">Qué ha visto la IA</div><TextoIa texto={sc.explicacion ?? ""} /><p className="mt-2 text-xs text-texto-3">Calculado el {fecha(sc.creado_en, proyecto)} con {sc.modelo}.</p></div>
              <div className="space-y-3">{Object.entries(pesos).map(([p, rs]) => <div key={p}><div className="text-sm font-medium">{p}</div>{Object.entries(rs).sort((a, b) => b[1] - a[1]).map(([r, v]) => <div key={r} className="flex justify-between text-xs"><span className="text-texto-2">{r}</span><span className={`tabular-nums ${v > 0 ? "text-ok" : v < 0 ? "text-mal" : "text-texto-3"}`}>{v > 0 ? "+" : ""}{v}</span></div>)}</div>)}</div>
            </div>
          )}
        </Seccion>
        {sc && (
          <Seccion titulo="Leads sin comprar con mejor nota">
            {ranking.length === 0 ? <p className="text-sm text-texto-3">Ningún lead tiene respuestas que encajen con el scoring.</p> : (
              <ul className="divide-y divide-borde text-sm">{ranking.map(({ l, nota }) => <li key={l.id} className="flex items-center justify-between py-2"><Link prefetch={false} href={`/leads/${l.id}`} className="hover:text-primario">{`${l.nombre} ${l.apellido ?? ""}`.trim() || "Sin nombre"}</Link><span className="font-semibold tabular-nums text-oro">{nota}</span></li>)}</ul>
            )}
          </Seccion>
        )}
      </div>
    );
  }

  const filas = await datosEstudio(proyecto.id, elegidas.length ? elegidas : undefined);
  const porPregunta = new Map<string, typeof filas>();
  for (const f of filas) porPregunta.set(f.pregunta, [...(porPregunta.get(f.pregunta) ?? []), f]);
  const qsCsv = new URLSearchParams();
  for (const p of elegidas) qsCsv.append("preg", p);
  return (
    <div className="space-y-4">
      <Seccion acciones={<div className="flex w-full flex-wrap items-center gap-2">{tabs}<a href={`/closer/llamadas/cualificacion?${qsCsv}`} className="btn-secundario ml-auto"><FileDown className="h-4 w-4" /> Exportar CSV</a></div>}>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="self-center text-texto-3">Preguntas:</span>
          <Link prefetch={false} href={conPreg([])} className={`chip ${!elegidas.length ? "bg-primario text-white" : "bg-panel-2 text-texto-2"}`}>Todas</Link>
          {preguntas.map((p) => {
            const on = elegidas.includes(p);
            return <Link prefetch={false} key={p} href={conPreg(on ? elegidas.filter((x) => x !== p) : [...elegidas, p])} className={`chip ${on ? "bg-primario text-white" : "bg-panel-2 text-texto-2"}`}>{p}</Link>;
          })}
        </div>
        <p className="mt-3 text-xs text-texto-3">Por cada respuesta: cuántos leads la dieron, cuántas llamadas hubo (asistidas), cuántos cerraron, % de cierre (de los que tuvieron llamada) y <b>cash por llamada</b> = cash cobrado de esos leads ÷ sus llamadas. Pocas llamadas = poco fiable.</p>
      </Seccion>
      {[...porPregunta.entries()].map(([p, fs]) => {
        const max = Math.max(1, ...fs.map((f) => f.cashPorLlamada));
        return (
          <Seccion key={p} titulo={p}>
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="tabla">
                <thead><tr><th>Respuesta</th><th className="text-right">Leads</th><th className="text-right">Llamadas</th><th className="text-right">Cerradas</th><th className="text-right">% cierre</th><th className="text-right">Cash</th><th className="w-56">Cash por llamada</th></tr></thead>
                <tbody>
                  {fs.map((f) => (
                    <tr key={f.respuesta}>
                      <td>{f.respuesta}</td>
                      <td className="text-right tabular-nums">{f.leads}</td>
                      <td className="text-right tabular-nums">{f.llamadas}</td>
                      <td className="text-right tabular-nums">{f.cerradas}</td>
                      <td className="text-right tabular-nums">{f.llamadas ? `${pct(f.cierre)}` : "—"}</td>
                      <td className="text-right tabular-nums">{$(f.cash)}</td>
                      <td><div className="flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-panel-2"><div className="h-2 rounded-full bg-primario" style={{ width: `${pct((f.cashPorLlamada / max) * 100)}` }} /></div><span className="w-20 text-right text-xs tabular-nums">{f.llamadas ? $(f.cashPorLlamada) : "—"}</span></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>
        );
      })}
    </div>
  );
}
