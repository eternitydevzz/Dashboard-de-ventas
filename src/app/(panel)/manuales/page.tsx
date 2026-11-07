import { BookOpen } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { db } from "@/lib/datos";
import { Cabecera, Contenido, Vacio } from "@/components/ui";
import { VisorManuales, SubirManual, type ManualFila } from "./cliente";

// C9 (plan Callers, 7 nov; maqueta «Manuales»): lista de manuales a la izquierda y el elegido dentro de la app.
export default async function ManualesPage({ searchParams }: PageProps<"/manuales">) {
  const { perfil, proyecto } = await exigirPagina("manuales");
  const editor = esJefe(perfil);
  const sp = await searchParams;
  const { data } = await db()
    .from("manuales")
    .select("id, titulo, actualizado_en, perfiles:actualizado_por(nombre)")
    .eq("proyecto_id", proyecto.id)
    .order("orden");
  const manuales: ManualFila[] = (data ?? []).map((m) => ({
    id: m.id,
    titulo: m.titulo,
    actualizado_en: m.actualizado_en,
    por: (m.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
  }));
  const elegido = manuales.find((m) => m.id === sp.m) ?? manuales[0] ?? null;
  return (
    <>
      <Cabecera titulo="Manuales" subtitulo="Lo que necesitas saber para vender" acciones={editor ? <SubirManual /> : undefined} />
      <Contenido>
        {manuales.length === 0 ? (
          <div className="tarjeta"><Vacio icono={BookOpen} texto={editor ? "Todavía no hay manuales. Sube el primero con «Subir manual (.html)»." : "Todavía no hay manuales."} /></div>
        ) : (
          <VisorManuales manuales={manuales} elegido={elegido!} editor={editor} zona={proyecto.zona_horaria} />
        )}
      </Contenido>
    </>
  );
}
