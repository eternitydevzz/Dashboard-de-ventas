import Link from "next/link";
import { FileText, Link2, ScrollText, Video, FolderOpen, Package, Search, ExternalLink } from "lucide-react";
import { puedeRecursos } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { db } from "@/lib/datos";
import { recursosVisibles } from "@/lib/recursos";
import { dinero, fecha } from "@/lib/formato";
import { Cabecera, Contenido, Seccion, Insignia, Vacio } from "@/components/ui";
import { NuevoRecurso, BorrarRecurso, CopiarLink, LinkProducto, VerGuion } from "./cliente";
import { LinksPago } from "@/components/links-pago";
import { contenidoMercado } from "@/lib/mercado";
import { mercadoVista } from "@/lib/mercado-datos";
import { SelectorMercado } from "@/components/selector-mercado";
import type { Producto, Recurso } from "@/lib/tipos";

const ICONO = { pdf: FileText, enlace: Link2, guion: ScrollText, video: Video };
const TIPO = { pdf: "PDF", enlace: "Enlace", guion: "Guion", video: "Vídeo" };

export default async function RecursosPage({ searchParams }: PageProps<"/recursos">) {
  const { perfil, proyecto } = await exigirPagina("recursos"); // H5
  const editor = puedeRecursos(perfil);
  const sp = await searchParams;
  const tipo = typeof sp.tipo === "string" ? sp.tipo : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  // 13 nov: quien edita elige Latam / España; el resto ve lo de su mercado
  const c = contenidoMercado(await mercadoVista(editor, sp.mercado, proyecto.id, perfil.id), { crudo: editor });
  const conMercado = (x: Record<string, string>) => new URLSearchParams({ ...x, ...(editor && c.mercado === "es" ? { mercado: "es" } : {}) });
  const sinTildes = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const [{ data: productos }, { data: recursosData }] = await Promise.all([
    db().from("productos").select("*").eq("proyecto_id", proyecto.id).eq("activo", true).order("orden"),
    db().from("recursos").select("*").eq("proyecto_id", proyecto.id).order("creado_en", { ascending: false }),
  ]);
  // Bloque 7: con buscador (por título)
  const recursos = recursosVisibles(c.filas((recursosData ?? []) as Recurso[]), perfil, tipo).filter((r) => !q || sinTildes(r.titulo).includes(sinTildes(q)));

  // Enlaces firmados (1 hora) para los PDF privados
  const firmados = new Map<string, string>();
  const pdfs = recursos.filter((r) => r.archivo_path).map((r) => r.archivo_path!);
  if (pdfs.length) {
    const { data } = await db().storage.from("recursos").createSignedUrls(pdfs, 3600);
    data?.forEach((d) => d.signedUrl && d.path && firmados.set(d.path, d.signedUrl));
  }

  return (
    <>
      <Cabecera titulo="Links y recursos" subtitulo="Todo lo que necesitas a mano durante las llamadas" acciones={editor ? <NuevoRecurso mercado={c.mercado} /> : undefined} />
      <Contenido>
        {editor && <SelectorMercado actual={c.mercado} href={(m) => `/recursos?${new URLSearchParams({ ...(tipo ? { tipo } : {}), ...(q ? { q } : {}), ...(m === "es" ? { mercado: "es" } : {}) })}`} />}
        {/* Bloque 7 de 1.0 (Cristian): una tarjeta por producto con su dossier encima del link de pago */}
        <Seccion titulo="Productos: dossier y link de pago">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {((productos ?? []) as Producto[]).filter((p) => editor || perfil.rol !== "caller" || p.vende_caller).map((p) => (
              <div key={p.id} className="space-y-2 rounded-xl border border-borde bg-panel-2 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-oro-suave text-oro"><Package className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <div className="font-semibold">{p.nombre}</div>
                    <div className="text-sm text-oro-texto">{p.precio ? dinero(Number(p.precio), { moneda: c.moneda(proyecto) }) : "Precio personalizado"}</div>
                  </div>
                </div>
                <LinkProducto etiqueta="Dossier" url={p.link_dossier ?? null} productoId={p.id} campo="link_dossier" editor={editor} />
                <LinksPago productoId={p.id} programa={p.nombre} links={c.linksPago(p)} reserva={c.linkReserva(proyecto)} editor={editor} conReserva={p.modo_pago !== "mensual"} mercado={c.mercado} />
              </div>
            ))}
          </div>
        </Seccion>

        <Seccion
          titulo="Recursos"
          acciones={
            <div className="flex flex-wrap gap-1 text-sm">
              {[["", "Todos"], ["pdf", "PDF"], ["enlace", "Enlaces"], ["guion", "Guiones"], ["video", "Vídeos"]].map(([v, t]) => (
                <Link key={v} href={`/recursos?${conMercado({ ...(v ? { tipo: v } : {}), ...(q ? { q } : {}) })}`} className={`rounded-md px-2.5 py-1 ${tipo === v ? "bg-primario-suave text-primario" : "text-texto-2 hover:bg-panel-2"}`}>{t}</Link>
              ))}
            </div>
          }
        >
          <form className="relative mb-4" action="/recursos">
            {tipo && <input type="hidden" name="tipo" value={tipo} />}
            {editor && c.mercado === "es" && <input type="hidden" name="mercado" value="es" />}
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3" />
            <input name="q" defaultValue={q} className="campo pl-9" placeholder="Buscar un recurso por su nombre…" aria-label="Buscar un recurso" />
          </form>
          {recursos.length === 0 ? (
            <Vacio icono={FolderOpen} texto={q ? `Ningún recurso con «${q}».` : editor ? "Todavía no hay recursos. Añade el primero con «Nuevo recurso»." : "Tu director todavía no ha subido recursos."} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recursos.map((r) => {
                const Icono = ICONO[r.tipo];
                const href = r.archivo_path ? firmados.get(r.archivo_path) : r.url;
                return (
                  <div key={r.id} className="flex flex-col rounded-xl border border-borde bg-panel-2 p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primario-suave text-primario"><Icono className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold leading-snug">{r.titulo}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-texto-3">
                          <Insignia>{TIPO[r.tipo]}</Insignia>
                          {r.para_rol !== "todos" && <Insignia tono="primario">Solo {r.para_rol}s</Insignia>}
                          {fecha(r.creado_en, proyecto)}
                        </div>
                      </div>
                      {editor && <BorrarRecurso id={r.id} />}
                    </div>
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                      {r.tipo === "guion" ? (
                        <VerGuion titulo={r.titulo} contenido={r.contenido ?? ""} />
                      ) : href ? (
                        <>
                          <a href={href} target="_blank" rel="noreferrer" className="btn-primario px-2.5 py-1.5 text-xs"><ExternalLink className="h-3.5 w-3.5" /> Abrir</a>
                          {/* El PDF abre con un enlace que caduca en 1 hora: no se ofrece copiarlo */}
                          {r.tipo !== "pdf" && <CopiarLink url={href} />}
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Seccion>
      </Contenido>
    </>
  );
}
