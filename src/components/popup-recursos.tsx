"use client";

import { useState } from "react";
import { Copy, ExternalLink, FileText, FolderOpen, Link2, Package, ScrollText, Video } from "lucide-react";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toasts";
import { recursosLlamada, type RecursosLlamada } from "@/app/(panel)/recursos/acciones";

const ICONO = { pdf: FileText, enlace: Link2, guion: ScrollText, video: Video };

// Botón azul «Recursos» del guion (Cristian, 10 nov): abre un popup con lo mismo que /recursos (productos con su
// dossier y links de pago, y los recursos), solo para abrir y copiar. Se carga al abrirlo, no antes.
// shortcut: lista propia de solo lectura (los componentes de /recursos importan acciones-lead y harían un ciclo).
export function BotonRecursos() {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<RecursosLlamada | null>(null);
  const [error, setError] = useState("");

  function abrir() {
    setAbierto(true);
    setError("");
    void recursosLlamada()
      .then((r) => ("error" in r ? setError(r.error) : setDatos(r)))
      .catch(() => setError("No se pudieron cargar los recursos. Vuelve a probar."));
  }

  return (
    <>
      <button type="button" onClick={abrir} className="inline-flex items-center gap-2 rounded-xl bg-primario-boton px-3 py-1.5 text-[12.5px] font-bold text-white hover:opacity-90">
        <FolderOpen className="h-4 w-4" /> Recursos
      </button>
      {abierto && (
        <Modal titulo="Links y recursos" onCerrar={() => setAbierto(false)} ancho="max-w-2xl">
          {error ? (
            <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal" role="alert">{error}</p>
          ) : !datos ? (
            <p className="py-8 text-center text-sm text-texto-3">Cargando…</p>
          ) : (
            <ContenidoRecursos datos={datos} />
          )}
        </Modal>
      )}
    </>
  );
}

function ContenidoRecursos({ datos }: { datos: RecursosLlamada }) {
  const [guion, setGuion] = useState<string | null>(null);
  const vacio = !datos.productos.length && !datos.recursos.length && !datos.reserva;
  if (vacio) return <p className="py-8 text-center text-sm text-texto-3">Tu director todavía no ha subido recursos.</p>;
  return (
    <div className="space-y-5">
      {(datos.productos.length > 0 || datos.reserva) && (
        <section className="space-y-2">
          <h3 className="titulo-seccion">Productos: dossier y link de pago</h3>
          {datos.productos.map((p) => (
            <div key={p.id} className="space-y-1.5 rounded-xl border border-borde bg-panel-2 p-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-oro-suave text-oro"><Package className="h-4 w-4" /></span>
                <div className="min-w-0"><div className="font-semibold leading-tight">{p.nombre}</div><div className="text-xs text-oro">{p.precio}</div></div>
              </div>
              {p.dossier && <FilaLink nombre="Dossier" url={p.dossier} />}
              {p.links.map((l) => <FilaLink key={l.url} nombre={l.nombre || "Link de pago"} url={l.url} />)}
              {!p.dossier && !p.links.length && <p className="text-xs text-texto-3">Sin dossier ni links de pago todavía.</p>}
            </div>
          ))}
          {datos.reserva && <div className="rounded-xl border border-borde bg-panel-2 p-3"><FilaLink nombre="Reserva (cualquier programa)" url={datos.reserva} /></div>}
        </section>
      )}
      {datos.recursos.length > 0 && (
        <section className="space-y-2">
          <h3 className="titulo-seccion">Recursos</h3>
          {datos.recursos.map((r) => {
            const Icono = ICONO[r.tipo];
            return (
              <div key={r.id} className="rounded-xl border border-borde bg-panel-2 p-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primario-suave text-primario"><Icono className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 font-semibold leading-snug">{r.titulo}</span>
                  {r.tipo === "guion" ? (
                    <button type="button" className="text-sm font-semibold text-primario hover:underline" onClick={() => setGuion(guion === r.id ? null : r.id)} aria-expanded={guion === r.id}>{guion === r.id ? "Cerrar" : "Leer"}</button>
                  ) : r.href ? (
                    <Acciones url={r.href} copiar={r.tipo !== "pdf"} />
                  ) : null}
                </div>
                {guion === r.id && <pre className="mt-2 max-h-[45vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-panel p-3 font-sans text-sm leading-relaxed">{r.contenido}</pre>}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function FilaLink({ nombre, url }: { nombre: string; url: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-panel px-3 py-2">
      <span className="min-w-0 truncate text-sm font-medium">{nombre}</span>
      <Acciones url={url} copiar />
    </div>
  );
}

// El PDF abre con un enlace que caduca en 1 hora: no se ofrece copiarlo (como en /recursos)
function Acciones({ url, copiar }: { url: string; copiar: boolean }) {
  const toast = useToast();
  const copiarLink = () =>
    void navigator.clipboard
      ?.writeText(url)
      .then(() => toast("Link copiado"))
      .catch(() => toast(`No se pudo copiar. El link es: ${url}`, "error"));
  return (
    <span className="flex shrink-0 gap-1.5">
      <a href={url} target="_blank" rel="noreferrer" className="btn-primario px-2.5 py-1 text-xs"><ExternalLink className="h-3.5 w-3.5" /> Abrir</a>
      {copiar && <button type="button" onClick={copiarLink} className="btn-secundario px-2.5 py-1 text-xs"><Copy className="h-3.5 w-3.5" /> Copiar</button>}
    </span>
  );
}
