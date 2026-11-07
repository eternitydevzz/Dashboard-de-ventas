import { Mic } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { db } from "@/lib/datos";
import { Cabecera, Contenido, Vacio } from "@/components/ui";
import { ListaGrabaciones, type GrabacionFila } from "./cliente";

// C10 (plan Callers, 7 nov; maqueta «Grabaciones»): las llamadas grabadas desde el guion. El caller ve las suyas; los
// jefes, todas (con la columna Caller). Escuchar, descargar y subir la transcripción (CEO y directores).
export default async function GrabacionesPage({ searchParams }: PageProps<"/grabaciones">) {
  const { perfil, proyecto } = await exigirPagina("grabaciones");
  const jefe = esJefe(perfil);
  const sp = await searchParams;
  let q = db()
    .from("grabaciones_caller")
    .select("id, lead_id, perfil_id, duracion_seg, transcripcion, creado_en, leads(nombre, apellido), perfiles(nombre)")
    .eq("proyecto_id", proyecto.id)
    .order("creado_en", { ascending: false })
    .limit(500);
  if (!jefe) q = q.eq("perfil_id", perfil.id);
  const { data } = await q;
  const filas: GrabacionFila[] = (data ?? []).map((g) => {
    const l = g.leads as unknown as { nombre: string; apellido: string } | null;
    return {
      id: g.id,
      leadId: g.lead_id,
      lead: l ? `${l.nombre} ${l.apellido ?? ""}`.trim() : "Lead borrado",
      caller: (g.perfiles as unknown as { nombre: string } | null)?.nombre ?? "—",
      duracion: g.duracion_seg,
      transcripcion: g.transcripcion,
      creado_en: g.creado_en,
    };
  });
  return (
    <>
      <Cabecera titulo="Grabaciones" subtitulo={jefe ? "Las llamadas grabadas desde el guion por todo el equipo" : "Tus llamadas grabadas desde el guion"} />
      <Contenido>
        {filas.length === 0 ? (
          <div className="tarjeta"><Vacio icono={Mic} texto="Todavía no hay grabaciones. Se graban desde el guion de un lead, con «Grabar»." /></div>
        ) : (
          <ListaGrabaciones filas={filas} elegida={typeof sp.g === "string" ? sp.g : null} jefe={jefe} zona={proyecto.zona_horaria} />
        )}
      </Contenido>
    </>
  );
}
