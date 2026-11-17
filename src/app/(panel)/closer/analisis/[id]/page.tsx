import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { db } from "@/lib/datos";
import { fechaHora, ETIQUETA_ESTADO_CITA } from "@/lib/formato";
import { AGENTES } from "@/lib/ia-agentes";
import { esCloser } from "@/lib/tipos";
import { Cabecera, Contenido, Insignia, Seccion } from "@/components/ui";
import { Autocompletado, Reanalizar, TextoIa } from "../cliente";

const RES = { cerrado: ["Cerrado", "ok"], no_cerrado: ["No cerrado", "mal"], seguimiento: ["Seguimiento", "aviso"] } as const;

export default async function AnalisisDetalle({ params }: PageProps<"/closer/analisis/[id]">) {
  const { perfil, proyecto } = await exigirPagina("agendas"); // H5
  // H5 (caso 1): un caller con «Agendas» solo ve los de las citas que agendó él, sin botones
  // A2 (17 nov): el caller con «También closer», los suyos con botones; los de citas que agendó con otro closer, sin botones
  const doble = perfil.rol === "caller" && esCloser(perfil);
  const { id } = await params;
  const { data: a } = await db().from("analisis_llamadas").select("*, grabaciones(titulo, inicio, share_url, url), leads(id, nombre, apellido)").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle();
  if (!a) notFound();
  const suyo = esJefe(perfil) || (esCloser(perfil) && a.closer_id === perfil.id);
  const mirar = (perfil.rol === "caller" && !esCloser(perfil)) || (doble && !suyo);
  if (mirar) {
    const { data: cita } = a.cita_id ? await db().from("citas").select("agendada_por").eq("id", a.cita_id).maybeSingle() : { data: null };
    if (cita?.agendada_por !== perfil.id) notFound();
  } else if (!suyo) notFound();
  const g = a.grabaciones as { titulo: string | null; inicio: string | null; share_url: string | null; url: string | null } | null;
  const l = a.leads as { id: string; nombre: string; apellido: string } | null;
  const secciones = (a.secciones ?? {}) as Record<string, string>;
  const auto = a.autocompletado as { estado: string; estrellas: number; nota: string } | null;
  return (
    <>
      <Cabecera titulo={l ? `${l.nombre} ${l.apellido ?? ""}`.trim() : g?.titulo ?? "Llamada"} subtitulo={`${g?.titulo ?? ""}${g?.inicio ? ` · ${fechaHora(g.inicio, proyecto)}` : ""}`} acciones={mirar ? undefined : <Reanalizar id={a.id} />} />
      <Contenido>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/closer/analisis?sub=llamadas" className="inline-flex items-center gap-1 text-primario hover:underline"><ArrowLeft className="h-4 w-4" /> Volver</Link>
          {l && <Link href={`/leads/${l.id}`} className="text-primario hover:underline">Ficha del lead</Link>}
          {(g?.share_url || g?.url) && <a href={g.share_url ?? g.url!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primario hover:underline">Ver en Fathom <ExternalLink className="h-3.5 w-3.5" /></a>}
        </div>
        {a.estado !== "hecho" ? (
          <Seccion titulo="Análisis">
            <p className="text-sm">{a.estado === "error" ? <span className="text-mal">No se pudo analizar: {a.error}</span> : a.estado === "procesando" ? "Analizándose ahora…" : "En cola para analizar."}</p>
          </Seccion>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
              <div className="tarjeta flex flex-col items-center justify-center gap-2 p-5 text-center">
                <div className="text-5xl font-semibold tabular-nums text-oro">{a.puntuacion}</div>
                <div className="titulo-seccion">Puntuación (0-100)</div>
                {a.resultado && <Insignia tono={RES[a.resultado as keyof typeof RES][1]}>{RES[a.resultado as keyof typeof RES][0]}</Insignia>}
                {a.evaluacion_manual !== null && <div className="text-xs text-texto-3">Evaluación a mano: <b>{a.evaluacion_manual}/10</b></div>}
              </div>
              <Seccion titulo="Resumen"><TextoIa texto={a.resumen ?? ""} /></Seccion>
            </div>
            {auto && (
              <Seccion titulo="Autocompletado del cierre (propuesta de la IA)">
                <p className="mb-3 text-sm">Estado: <b>{ETIQUETA_ESTADO_CITA[auto.estado] ?? auto.estado}</b> · {auto.estrellas}★ · {auto.nota}</p>
                {!mirar && <Autocompletado id={a.id} estado={a.autocompletado_estado} />}
              </Seccion>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              {AGENTES.filter((x) => secciones[x.v]).map((x) => (
                <Seccion key={x.v} titulo={x.t}><TextoIa texto={secciones[x.v]} /></Seccion>
              ))}
            </div>
            <p className="text-xs text-texto-3">Analizado con {a.modelo ?? "Claude"}{a.analizado_en ? ` el ${fechaHora(a.analizado_en, proyecto)}` : ""}. La IA se puede equivocar: úsalo como guía, no como verdad.</p>
          </>
        )}
      </Contenido>
    </>
  );
}
