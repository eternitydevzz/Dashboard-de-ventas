import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { db } from "@/lib/datos";
import { fechaHora } from "@/lib/formato";
import { Cabecera, Contenido, Seccion } from "@/components/ui";
import { VerEstrellas } from "@/components/estrellas";
import { TextoIa } from "@/app/(panel)/closer/analisis/cliente";
import type { Linea } from "@/lib/ghl-llamadas";
import { Reintentar } from "../cliente";

export default async function LlamadaGrabada({ params }: PageProps<"/caller/grabadas/[id]">) {
  const { perfil, proyecto } = await exigirPagina("grabadas"); // F22 (plan Callers, 7 nov): antes no pedía la sección
  const { id } = await params;
  const { data: l } = await db().from("llamadas_ghl").select("*, leads(id, nombre, apellido)").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle();
  if (!l || (!esJefe(perfil) && l.perfil_id !== perfil.id)) notFound();
  const a = l.analisis as { resumen?: string; interes?: number; objeciones?: string; coaching?: string; siguiente_paso?: string } | null;
  const lead = l.leads as { id: string; nombre: string; apellido: string } | null;
  const lineas = (l.transcripcion ?? []) as Linea[];
  return (
    <>
      <Cabecera titulo={lead ? `${lead.nombre} ${lead.apellido ?? ""}`.trim() : "Llamada de GHL"} subtitulo={`${l.fecha ? fechaHora(l.fecha, proyecto) : ""} · ${Math.round((l.duracion ?? 0) / 60)} min${l.fuente ? ` · transcrita por ${l.fuente === "ghl" ? "GHL" : "Deepgram"}` : ""}`} acciones={l.estado === "error" || l.estado === "sin_audio" ? <Reintentar id={l.id} /> : undefined} />
      <Contenido>
        <div className="flex gap-3 text-sm"><Link href="/caller/grabadas" className="inline-flex items-center gap-1 text-primario hover:underline"><ArrowLeft className="h-4 w-4" /> Volver</Link>{lead && <Link href={`/leads/${lead.id}`} className="text-primario hover:underline">Ficha del lead</Link>}</div>
        {l.error && <p className="tarjeta p-4 text-sm text-mal">{l.error}</p>}
        {a && (
          <>
            <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
              <div className="tarjeta flex flex-col items-center justify-center gap-2 p-5 text-center"><div className="text-5xl font-semibold tabular-nums text-oro">{l.puntuacion}</div><div className="titulo-seccion">Nota de la llamada</div><VerEstrellas n={a.interes} quien="caller" /></div>
              <Seccion titulo="Resumen"><TextoIa texto={a.resumen ?? ""} /><p className="mt-3 text-sm"><b>Siguiente paso:</b> {a.siguiente_paso}</p></Seccion>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Seccion titulo="Objeciones"><TextoIa texto={a.objeciones ?? ""} /></Seccion>
              <Seccion titulo="Puntos de mejora"><TextoIa texto={a.coaching ?? ""} /></Seccion>
            </div>
          </>
        )}
        <Seccion titulo="Transcripción">
          {lineas.length === 0 ? <p className="text-sm text-texto-3">Aún no hay transcripción.</p> : (
            <div className="max-h-[60vh] space-y-1.5 overflow-y-auto text-sm">{lineas.map((x, i) => <p key={i}><span className="font-mono text-xs text-texto-3">{String(Math.floor(x.inicio / 60)).padStart(2, "0")}:{String(x.inicio % 60).padStart(2, "0")}</span> <b>{x.quien}:</b> {x.texto}</p>)}</div>
          )}
        </Seccion>
      </Contenido>
    </>
  );
}
