import Link from "next/link";
import { Sparkles } from "lucide-react";
import { db, todas } from "@/lib/datos";
import { fechaHora, ETIQUETA_ESTADO_CITA } from "@/lib/formato";
import { Seccion, Vacio } from "@/components/ui";
import type { Proyecto } from "@/lib/tipos";
import { Autocompletado } from "../analisis/cliente";

type A = { id: string; lead_id: string | null; autocompletado: { estado: string; estrellas: number; nota: string } | null; grabaciones: { titulo: string | null; inicio: string | null } | null; leads: { nombre: string; apellido: string } | null };

// 05 · Revisión IA: autocompletado del cierre, agendas sin lead y conciliaciones dudosas
export async function RevisionIa({ proyecto, closerIds, jefe, sinLead, baseQs }: { proyecto: Proyecto; closerIds: string[]; jefe: boolean; sinLead: number; baseQs: (c: Record<string, string | null>) => string }) {
  const ids = closerIds.length ? closerIds : ["00000000-0000-0000-0000-000000000000"];
  const [autos, dudosas] = await Promise.all([
    todas<A>((a, b) => db().from("analisis_llamadas").select("*, grabaciones(titulo, inicio), leads(nombre, apellido)").eq("proyecto_id", proyecto.id).in("closer_id", ids).eq("autocompletado_estado", "pendiente").order("creado_en").order("id").range(a, b)),
    todas<{ id: string; titulo: string | null; inicio: string | null; motivo: string | null }>((a, b) => db().from("grabaciones").select("id, titulo, inicio, motivo").eq("proyecto_id", proyecto.id).in("closer_id", ids).eq("conciliacion", "pendiente").order("inicio", { ascending: false }).order("id").range(a, b)),
  ]);
  const nombre = (x: A) => (x.leads ? `${x.leads.nombre} ${x.leads.apellido ?? ""}`.trim() : x.grabaciones?.titulo ?? "Llamada");
  return (
    <div className="space-y-4">
      <Seccion titulo={`Autocompletado de llamadas · ${autos.length}`}>
        {autos.length === 0 ? <Vacio icono={Sparkles} texto="Nada que confirmar. Cuando la IA analiza una llamada, propone aquí cómo cerrar la cita." /> : (
          <ul className="divide-y divide-borde">
            {autos.map((x) => (
              <li key={x.id} className="space-y-2 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><Link prefetch={false} href={`/closer/analisis/${x.id}`} className="font-medium hover:text-primario">{nombre(x)}</Link><span className="text-xs text-texto-3">{x.grabaciones?.inicio ? fechaHora(x.grabaciones.inicio, proyecto) : ""}</span></div>
                {x.autocompletado && <p>La IA propone: <b>{ETIQUETA_ESTADO_CITA[x.autocompletado.estado] ?? x.autocompletado.estado}</b> · {x.autocompletado.estrellas}★ · <span className="text-texto-2">{x.autocompletado.nota}</span></p>}
                <Autocompletado id={x.id} estado="pendiente" />
              </li>
            ))}
          </ul>
        )}
      </Seccion>
      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo={`Agendas sin lead asignado · ${sinLead}`}>
          <p className="text-sm text-texto-2">{sinLead ? <>Citas de GHL que no se han podido unir a un lead. {jefe ? <Link prefetch={false} href={baseQs({ tab: "agendas", revisar: "1" })} className="text-primario hover:underline">Revisar →</Link> : "Las revisa un director o el CEO."}</> : "Todas las citas de GHL tienen su lead."}</p>
        </Seccion>
        <Seccion titulo={`Conciliaciones dudosas · ${dudosas.length}`}>
          {dudosas.length === 0 ? <p className="text-sm text-texto-2">Todas las grabaciones están unidas a su cita (o descartadas).</p> : (
            <ul className="space-y-1 text-sm">
              {dudosas.slice(0, 8).map((g) => <li key={g.id}><b>{g.titulo ?? "Grabación"}</b> <span className="text-xs text-texto-3">· {g.inicio ? fechaHora(g.inicio, proyecto) : "sin fecha"} · {g.motivo ?? ""}</span></li>)}
              <li><Link prefetch={false} href={baseQs({ tab: "grabaciones", conc: "pendientes" })} className="text-primario hover:underline">Elegir la cita en Grabaciones →</Link></li>
            </ul>
          )}
        </Seccion>
      </div>
    </div>
  );
}
