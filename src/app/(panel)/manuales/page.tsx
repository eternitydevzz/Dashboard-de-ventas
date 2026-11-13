import { BookOpen } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { db } from "@/lib/datos";
import { Cabecera, Contenido, Vacio } from "@/components/ui";
import { VisorManuales, SubirManual, type ManualFila } from "./cliente";
import { contenidoMercado } from "@/lib/mercado";
import { mercadoVista } from "@/lib/mercado-datos";
import { SelectorMercado } from "@/components/selector-mercado";

// C9 (plan Callers, 7 nov; maqueta «Manuales»): lista de manuales a la izquierda y el elegido dentro de la app.
export default async function ManualesPage({ searchParams }: PageProps<"/manuales">) {
  const { perfil, proyecto } = await exigirPagina("manuales");
  const editor = esJefe(perfil);
  const sp = await searchParams;
  const [{ data }, mercado] = await Promise.all([
    // `*` y no `mercado`: así sigue funcionando si la base aún no tiene la columna
    db().from("manuales").select("*, perfiles:actualizado_por(nombre)").eq("proyecto_id", proyecto.id).order("orden"),
    mercadoVista(editor, sp.mercado, proyecto.id, perfil.id), // 13 nov: Latam / España
  ]);
  const c = contenidoMercado(mercado, { crudo: editor });
  const manuales: ManualFila[] = c.filas((data ?? []) as { id: string; titulo: string; actualizado_en: string; mercado?: string; perfiles: unknown }[]).map((m) => ({
    id: m.id,
    titulo: m.titulo,
    actualizado_en: m.actualizado_en,
    por: (m.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
  }));
  const elegido = manuales.find((m) => m.id === sp.m) ?? manuales[0] ?? null;
  return (
    <>
      <Cabecera titulo="Manuales" subtitulo="Lo que necesitas saber para vender" acciones={editor ? <SubirManual mercado={c.mercado} /> : undefined} />
      <Contenido>
        {editor && <SelectorMercado actual={c.mercado} href={(m) => (m === "es" ? "/manuales?mercado=es" : "/manuales")} />}
        {manuales.length === 0 ? (
          <div className="tarjeta"><Vacio icono={BookOpen} texto={editor ? "Todavía no hay manuales. Sube el primero con «Subir manual (.html)»." : "Todavía no hay manuales."} /></div>
        ) : (
          <VisorManuales manuales={manuales} elegido={elegido!} editor={editor} zona={proyecto.zona_horaria} mercado={c.mercado} />
        )}
      </Contenido>
    </>
  );
}
