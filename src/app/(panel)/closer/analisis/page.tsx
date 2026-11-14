import Link from "next/link";
import { ScanSearch, Sparkles } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { db, equipo, todas } from "@/lib/datos";
import { closersVisibles } from "@/lib/agendas-datos";
import { coincide } from "@/lib/llamadas";
import { leerPeriodo, rangoNav, enRango } from "@/lib/periodos";
import { fechaHora, pct } from "@/lib/formato";
import { hayClaveIa } from "@/lib/ia";
import { Cabecera, Contenido, Insignia, Kpi, Seccion, Vacio } from "@/components/ui";
import { BarraPeriodo, FiltroUrl } from "@/components/barra-periodo";
import { BuscadorUrl } from "../llamadas/cliente";
import { PestanasAgendas } from "../pestanas";
import { AnalizarPendientes, ConfigurarIa, EvaluarManual } from "./cliente";
import type { ConfigAgentes } from "@/lib/ia-agentes";

type Fila = { id: string; closer_id: string | null; lead_id: string | null; estado: string; puntuacion: number | null; resultado: string | null; resumen: string | null; error: string | null; evaluacion_manual: number | null; evaluacion_nota: string | null; grabaciones: { titulo: string | null; inicio: string | null } | null; leads: { nombre: string; apellido: string } | null };
const RES = { cerrado: ["Cerrado", "ok"], no_cerrado: ["No cerrado", "mal"], seguimiento: ["Seguimiento", "aviso"] } as const;

export default async function AnalisisPage({ searchParams }: PageProps<"/closer/analisis">) {
  const { perfil, proyecto } = await exigirPagina("agendas"); // H5
  const jefe = esJefe(perfil);
  // H5 (caso 1): un caller con «Agendas» ve solo los análisis de las citas que agendó él, solo mirar
  const mirar = perfil.rol === "caller";
  const citasMias = mirar ? (await todas<{ id: string }>((a, b) => db().from("citas").select("id").eq("proyecto_id", proyecto.id).eq("agendada_por", perfil.id).order("id").range(a, b))).map((c) => c.id) : null;
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const sub = ["llamadas", "manual"].includes(s("sub")) ? s("sub") : "resumen";
  const p = leerPeriodo(sp);
  const rango = rangoNav(p.periodo, p.n, proyecto.zona_horaria, p.desde, p.hasta);
  const gente = await equipo(proyecto.id);
  const vis = closersVisibles(perfil, gente, s("closer") || null);
  const ids = vis.ids.length ? vis.ids : ["00000000-0000-0000-0000-000000000000"];
  const [filas, configs, productos] = await Promise.all([
    todas<Fila>((a, b) => {
      const q = db().from("analisis_llamadas").select("*, grabaciones(titulo, inicio), leads(nombre, apellido)").eq("proyecto_id", proyecto.id).in("closer_id", ids);
      return (citasMias ? q.in("cita_id", citasMias.length ? citasMias : ["00000000-0000-0000-0000-000000000000"]) : q).order("creado_en", { ascending: false }).order("id").range(a, b);
    }),
    jefe ? db().from("config_ia").select("producto_id, contexto, agentes").eq("proyecto_id", proyecto.id) : Promise.resolve({ data: [] }),
    jefe ? db().from("productos").select("id, nombre").eq("proyecto_id", proyecto.id).order("orden") : Promise.resolve({ data: [] }),
  ]);
  const enPeriodo = filas.filter((f) => enRango(f.grabaciones?.inicio, rango));
  const hechos = enPeriodo.filter((f) => f.estado === "hecho");
  const media = hechos.length ? Math.round(hechos.reduce((x, f) => x + (f.puntuacion ?? 0), 0) / hechos.length) : null;
  const maxima = hechos.length ? Math.max(...hechos.map((f) => f.puntuacion ?? 0)) : null;
  const cierre = hechos.length ? Math.round((hechos.filter((f) => f.resultado === "cerrado").length / hechos.length) * 100) : 0;
  const nombre = (f: Fila) => (f.leads ? `${f.leads.nombre} ${f.leads.apellido ?? ""}`.trim() || "Sin nombre" : f.grabaciones?.titulo ?? "Llamada");
  const url = (c: Record<string, string | null>) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    for (const [k, v] of Object.entries(c)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    return `/closer/analisis?${q}`;
  };
  const q = s("q");
  const res = s("res");
  const lista = enPeriodo.filter((f) => coincide(q, nombre(f), f.grabaciones?.titulo) && (!res || f.resultado === res));
  const evaluar = s("eval");
  const manual = hechos.filter((f) => coincide(q, nombre(f)) && (evaluar === "evaluadas" ? f.evaluacion_manual !== null : evaluar === "sin" ? f.evaluacion_manual === null : true));
  const pendientes = filas.filter((f) => f.estado === "pendiente" || f.estado === "procesando").length;
  const errores = filas.filter((f) => f.estado === "error").length;

  return (
    <>
      <Cabecera
        titulo="Agendas"
        subtitulo={`${proyecto.nombre} · análisis de llamadas con IA (Fathom + Claude)`}
        acciones={jefe ? <div className="flex flex-wrap gap-2"><ConfigurarIa configs={(configs.data ?? []) as { producto_id: string | null; contexto: string | null; agentes: ConfigAgentes }[]} productos={(productos.data ?? []) as { id: string; nombre: string }[]} /><AnalizarPendientes clave={hayClaveIa()} /></div> : undefined}
      />
      <Contenido>
        <PestanasAgendas activa="/closer/analisis" />
        {!hayClaveIa() && <p className="tarjeta border-aviso/40 p-4 text-sm text-aviso">Falta la clave de Claude en el servidor (<code>ANTHROPIC_API_KEY</code>). Sin ella no se analiza nada; las grabaciones quedan en cola.</p>}
        <div className="tarjeta flex flex-wrap items-center gap-2 p-2.5">
          <div className="flex rounded-lg border border-borde bg-panel-2 p-0.5">
            {[["resumen", "Resumen"], ["llamadas", "Llamadas"], ...(jefe ? [["manual", "Manual"]] : [])].map(([v, t], i) => <Link prefetch={false} key={v} href={url({ sub: v === "resumen" ? null : v })} className={`rounded-md px-3 py-1.5 text-sm ${sub === v ? "bg-primario text-white" : "text-texto-2"}`}><span className="mr-1 font-mono text-[10px] opacity-70">0{i + 1}</span>{t}</Link>)}
          </div>
          {jefe && <FiltroUrl nombre="closer" etiqueta="Closer" todos="Todos los closers" opciones={vis.todos.map((c) => ({ v: c.id, t: c.nombre }))} />}
          <div className="2xl:ml-auto"><BarraPeriodo etiqueta={rango.etiqueta} conActualizar={false} /></div>
        </div>
        {(pendientes > 0 || errores > 0) && <p className="text-sm text-texto-2">{pendientes > 0 && <>En cola o analizándose: <b>{pendientes}</b>. </>}{errores > 0 && <>Con error: <b className="text-mal">{errores}</b> (ábrelas para ver el motivo y «Re-analizar»).</>}</p>}

        {sub === "resumen" && (
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Kpi titulo="Llamadas analizadas" valor={hechos.length} icono={ScanSearch} />
              <Kpi titulo="Puntuación media" valor={media ?? "—"} icono={Sparkles} tono="oro" detalle="de 0 a 100" />
              <Kpi titulo="Puntuación más alta" valor={maxima ?? "—"} icono={Sparkles} tono="ok" />
              <Kpi titulo="Tasa de cierre" valor={`${pct(cierre)}`} icono={ScanSearch} tono="ok" detalle="de las analizadas" />
            </div>
            <Seccion titulo="Últimas analizadas">
              {hechos.length === 0 ? <Vacio icono={ScanSearch} texto="No hay llamadas analizadas en este periodo. Se analizan solas al unir una grabación de Fathom con su cita." /> : <ListaLlamadas filas={hechos.slice(0, 8)} nombre={nombre} proyecto={proyecto} />}
            </Seccion>
          </>
        )}
        {sub === "llamadas" && (
          <Seccion acciones={<div className="flex w-full flex-wrap items-center gap-2"><BuscadorUrl placeholder="Buscar por nombre o título…" /><div className="flex rounded-lg border border-borde bg-panel-2 p-0.5">{[["", "Todas"], ["cerrado", "Cerrados"], ["no_cerrado", "No cerrados"], ["seguimiento", "Seguimiento"]].map(([v, t]) => <Link prefetch={false} key={v} href={url({ res: v || null })} className={`rounded-md px-3 py-1.5 text-sm ${res === v ? "bg-primario text-white" : "text-texto-2"}`}>{t}</Link>)}</div></div>}>
            {lista.length === 0 ? <Vacio icono={ScanSearch} texto="Nada con ese filtro." /> : <ListaLlamadas filas={lista} nombre={nombre} proyecto={proyecto} />}
          </Seccion>
        )}
        {sub === "manual" && jefe && (
          <Seccion acciones={<div className="flex w-full flex-wrap items-center gap-2"><BuscadorUrl placeholder="Buscar…" /><div className="flex rounded-lg border border-borde bg-panel-2 p-0.5">{[["", `Todas · ${hechos.length}`], ["sin", `Sin evaluar · ${hechos.filter((f) => f.evaluacion_manual === null).length}`], ["evaluadas", `Evaluadas · ${hechos.filter((f) => f.evaluacion_manual !== null).length}`]].map(([v, t]) => <Link prefetch={false} key={v} href={url({ eval: v || null })} className={`rounded-md px-3 py-1.5 text-sm ${evaluar === v ? "bg-primario text-white" : "text-texto-2"}`}>{t}</Link>)}</div></div>}>
            {manual.length === 0 ? <Vacio icono={ScanSearch} texto="No hay llamadas analizadas para evaluar." /> : (
              <ul className="divide-y divide-borde">
                {manual.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <Link prefetch={false} href={`/closer/analisis/${f.id}`} className="min-w-48 flex-1 font-medium hover:text-primario">{nombre(f)}<div className="text-xs font-normal text-texto-3">{f.grabaciones?.inicio ? fechaHora(f.grabaciones.inicio, proyecto) : ""} · IA: {f.puntuacion}/100</div></Link>
                    <EvaluarManual id={f.id} nota={f.evaluacion_manual} texto={f.evaluacion_nota ?? ""} />
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
        )}
      </Contenido>
    </>
  );
}

function ListaLlamadas({ filas, nombre, proyecto }: { filas: Fila[]; nombre: (f: Fila) => string; proyecto: Parameters<typeof fechaHora>[1] }) {
  return (
    <ul className="divide-y divide-borde">
      {filas.map((f) => (
        <li key={f.id}>
          <Link prefetch={false} href={`/closer/analisis/${f.id}`} className="flex flex-wrap items-center gap-3 py-3 text-sm hover:bg-panel-2">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${f.estado === "hecho" ? "bg-oro-suave text-oro" : "bg-panel-2 text-texto-3"}`}>{f.estado === "hecho" ? f.puntuacion : "…"}</span>
            <span className="min-w-40 flex-1"><b>{nombre(f)}</b><span className="block text-xs text-texto-3">{f.grabaciones?.inicio ? fechaHora(f.grabaciones.inicio, proyecto) : ""}</span></span>
            {f.estado === "hecho" && f.resultado && <Insignia tono={RES[f.resultado as keyof typeof RES][1]}>{RES[f.resultado as keyof typeof RES][0]}</Insignia>}
            {f.estado === "error" && <Insignia tono="mal">Error</Insignia>}
            {(f.estado === "pendiente" || f.estado === "procesando") && <Insignia>{f.estado === "pendiente" ? "En cola" : "Analizando…"}</Insignia>}
            {f.estado === "hecho" && f.resumen && <span className="hidden w-full text-xs text-texto-2 md:line-clamp-1">{f.resumen.replace(/\*\*/g, "")}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
