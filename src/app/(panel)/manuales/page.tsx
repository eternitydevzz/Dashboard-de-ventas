import { BookOpen } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { db, equipo } from "@/lib/datos";
import { Cabecera, Contenido, Vacio } from "@/components/ui";
import { VisorManuales, SubirManual, type ManualFila } from "./cliente";
import { mercadoDe, type Mercado } from "@/lib/mercado";
import { mercadosDelProyecto, mercadoVista } from "@/lib/mercado-datos";
import { manualesDeMercado, mercadosDe, quienLoHaVisto } from "@/lib/manuales";
import { SelectorMercado } from "@/components/selector-mercado";
import { PestanasManuales } from "./pestanas";

type Fila = { id: string; titulo: string; actualizado_en: string; mercado?: string; mercados?: string[]; perfiles: unknown };
type Visto = { manual_id: string; perfil_id: string; visto_en: string };

// C9 (plan Callers, 7 nov; maqueta «Manuales»): lista de manuales a la izquierda y el elegido dentro de la app.
// Cristian, 14 nov: cada uno ve solo los manuales marcados para su mercado (sin caer en los de Latam); los jefes,
// con el selector, los de cada mercado y, en el ajuste ⚙, quién los ha visto.
export default async function ManualesPage({ searchParams }: PageProps<"/manuales">) {
  const { perfil, proyecto } = await exigirPagina("manuales");
  const editor = esJefe(perfil);
  const sp = await searchParams;
  const [{ data }, vista] = await Promise.all([
    // `*` y no `mercados`: así sigue funcionando si la base aún no tiene la columna
    db().from("manuales").select("*, perfiles:actualizado_por(nombre)").eq("proyecto_id", proyecto.id).order("orden"),
    mercadoVista(editor, sp.mercado, proyecto.id, perfil.id), // 13 nov: Latam / España
  ]);
  const mercado = mercadoDe(vista);
  const filas = manualesDeMercado((data ?? []) as Fila[], mercado);
  const [personas, mercados, vistos]: [{ id: string; nombre: string }[], Record<string, Mercado>, Visto[]] = editor
    ? await Promise.all([
        equipo(proyecto.id),
        mercadosDelProyecto(proyecto.id),
        // Si falla (o aún no está la tabla), todos «Sin ver»: la pantalla se enseña igual
        filas.length ? db().from("manuales_vistos").select("manual_id, perfil_id, visto_en").in("manual_id", filas.map((f) => f.id)).then((r) => (r.data ?? []) as Visto[]) : [],
      ])
    : [[], {}, []];
  const manuales: ManualFila[] = filas.map((m) => {
    const suyos = mercadosDe(m);
    return {
      id: m.id,
      titulo: m.titulo,
      actualizado_en: m.actualizado_en,
      por: (m.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
      mercados: suyos,
      vistos: editor ? quienLoHaVisto(suyos, personas, mercados, vistos.filter((v) => v.manual_id === m.id)) : undefined,
    };
  });
  const elegido = manuales.find((m) => m.id === sp.m) ?? manuales[0] ?? null;
  return (
    <>
      <Cabecera titulo="Manuales" subtitulo="Lo que necesitas saber para vender" acciones={editor ? <SubirManual mercado={mercado} /> : undefined} />
      <Contenido>
        <PestanasManuales activa="manuales" manuales guiones={editor} />
        {editor && <SelectorMercado actual={mercado} href={(m) => (m === "es" ? "/manuales?mercado=es" : "/manuales")} nota="España ve solo los manuales marcados para España (⚙ de cada manual)." />}
        {manuales.length === 0 ? (
          <div className="tarjeta"><Vacio icono={BookOpen} texto={editor ? "Todavía no hay manuales. Sube el primero con «Subir manual (.html)»." : "Todavía no hay manuales."} /></div>
        ) : (
          <VisorManuales manuales={manuales} elegido={elegido!} editor={editor} zona={proyecto.zona_horaria} mercado={mercado} />
        )}
      </Contenido>
    </>
  );
}
