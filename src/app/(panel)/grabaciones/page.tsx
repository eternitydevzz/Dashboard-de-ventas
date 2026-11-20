import { Mic } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { db, todas } from "@/lib/datos";
import { leerPeriodo, rangoNav } from "@/lib/periodos";
import { BarraPeriodo } from "@/components/barra-periodo";
import { Cabecera, Contenido, Vacio } from "@/components/ui";
import { ListaGrabaciones, type GrabacionFila } from "./cliente";

// C10 (plan Callers, 7 nov; maqueta «Grabaciones»): las llamadas grabadas desde el guion. El caller ve las suyas; los
// jefes, todas (con la columna Caller). Escuchar, descargar y subir la transcripción (CEO y directores).
export default async function GrabacionesPage({ searchParams }: PageProps<"/grabaciones">) {
  const { perfil, proyecto, tiene } = await exigirPagina("grabaciones");
  const jefe = esJefe(perfil);
  const verTodas = jefe || tiene.has("grabaciones_todas"); // Cristian (20 nov): algunos callers o closers ven las de todos
  const sp = await searchParams;
  // S2-12 (17 nov): por periodo (Mes por defecto) y todas sus filas; antes, las últimas 500 sin avisar (los contadores
  // «N llamadas · M min» salían sobre esas 500) y un fallo de la base salía como «Todavía no hay grabaciones»
  const per = leerPeriodo(sp);
  const rango = rangoNav(per.periodo, per.n, proyecto.zona_horaria, per.desde, per.hasta);
  type G = { id: string; lead_id: string | null; perfil_id: string; duracion_seg: number; transcripcion: string | null; creado_en: string; leads: unknown; perfiles: unknown };
  const data = await todas<G>((d, h) => {
    let q = db()
      .from("grabaciones_caller")
      .select("id, lead_id, perfil_id, duracion_seg, transcripcion, creado_en, leads(nombre, apellido), perfiles(nombre)")
      .eq("proyecto_id", proyecto.id)
      .gte("creado_en", rango.desde!.toISOString())
      .lt("creado_en", rango.hasta!.toISOString());
    if (!verTodas) q = q.eq("perfil_id", perfil.id);
    return q.order("creado_en", { ascending: false }).order("id").range(d, h);
  });
  const filas: GrabacionFila[] = data.map((g) => {
    const l = g.leads as unknown as { nombre: string; apellido: string } | null;
    return {
      id: g.id,
      leadId: g.lead_id,
      lead: l ? `${l.nombre} ${l.apellido ?? ""}`.trim() : "Lead borrado",
      callerId: g.perfil_id,
      caller: (g.perfiles as unknown as { nombre: string } | null)?.nombre ?? "Persona borrada",
      duracion: g.duracion_seg,
      transcripcion: g.transcripcion,
      creado_en: g.creado_en,
    };
  });
  return (
    <>
      <Cabecera titulo="Grabaciones" subtitulo={verTodas ? "Elige un perfil para ver sus llamadas. Dale al play y escucha sin salir de la lista." : "Tus llamadas grabadas desde el guion"} />
      <Contenido>
        <BarraPeriodo etiqueta={rango.etiqueta} conActualizar={false} />
        {filas.length === 0 ? (
          <div className="tarjeta"><Vacio icono={Mic} texto="No hay grabaciones en este periodo. Se graban desde el guion de un lead, con «Grabar»." /></div>
        ) : (
          <ListaGrabaciones filas={filas} elegida={typeof sp.g === "string" ? sp.g : null} jefe={jefe} todas={verTodas} yo={perfil.id} zona={proyecto.zona_horaria} />
        )}
      </Contenido>
    </>
  );
}
