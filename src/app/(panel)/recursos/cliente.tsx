"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Plus, Trash2, Copy, Check, Pencil, ExternalLink } from "lucide-react";
import { borrarRecurso, crearRecurso, guardarLinkPago, prepararSubidaPdf } from "./acciones";
import { subirDelFormulario } from "@/lib/subir-cliente";
import { useAccion } from "@/components/acciones-lead";
import { Modal } from "@/components/modal";
import { confirmar, pedirTexto } from "@/components/dialogos";
import { Pastillas } from "@/components/eleccion";

// 13 nov: mirando España, el recurso nuevo es del equipo de España
export function NuevoRecurso({ mercado = "latam" }: { mercado?: "latam" | "es" }) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState("pdf");
  const [estado, accion, enviando] = useActionState(crearRecurso, null as null | { ok?: string; error?: string });
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState("");
  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErrorSubida("");
    if (tipo === "pdf") {
      setSubiendo(true);
      try {
        await subirDelFormulario(fd, "archivo", "application/pdf", prepararSubidaPdf);
      } catch (err) {
        return setErrorSubida(err instanceof Error ? err.message : "No se pudo subir el archivo.");
      } finally {
        setSubiendo(false);
      }
    }
    startTransition(() => accion(fd));
  };
  const error = errorSubida || estado?.error;
  return (
    <>
      <button className="btn-primario" onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Nuevo recurso</button>
      {abierto && (
        <Modal titulo={mercado === "es" ? "Nuevo recurso · España" : "Nuevo recurso"} onCerrar={() => setAbierto(false)} ancho="max-w-lg">
          <form onSubmit={enviar} className="space-y-3">
            <input type="hidden" name="mercado" value={mercado} />
            <label className="block"><span className="etiqueta-campo">Título</span><input name="titulo" required className="campo" placeholder="Ej: Guion de apertura" /></label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="etiqueta-campo" htmlFor="cliente-tipo">Tipo</label>
                <Pastillas id="cliente-tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="campo">
                  <option value="pdf">PDF</option><option value="enlace">Enlace</option><option value="guion">Guion</option><option value="video">Vídeo</option>
                </Pastillas>
              </div>
              <div>
                <label className="etiqueta-campo" htmlFor="cliente-para">Para</label>
                <Pastillas id="cliente-para" name="para_rol" className="campo"><option value="todos">Todo el equipo</option><option value="caller">Solo callers</option><option value="closer">Solo closers</option></Pastillas>
              </div>
            </div>
            {tipo === "pdf" && <label className="block"><span className="etiqueta-campo">Archivo PDF (máx. 15 MB)</span><input type="file" name="archivo" accept="application/pdf" required className="campo" /></label>}
            {(tipo === "enlace" || tipo === "video") && <label className="block"><span className="etiqueta-campo">{tipo === "video" ? "Enlace del vídeo (YouTube, Loom, Drive…)" : "Enlace"}</span><input name="url" type="url" required className="campo" placeholder="https://" /></label>}
            {tipo === "guion" && <label className="block"><span className="etiqueta-campo">Guion</span><textarea name="contenido" rows={10} required className="campo font-mono text-xs" /></label>}
            {error && <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{error}</p>}
            {!error && estado?.ok && <p className="rounded-lg bg-ok-suave px-3 py-2 text-sm text-ok">{estado.ok}</p>}
            <button className="btn-primario w-full" disabled={enviando || subiendo}>{subiendo ? "Subiendo…" : enviando ? "Guardando…" : "Guardar"}</button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function BorrarRecurso({ id }: { id: string }) {
  const { pendiente, ejecutar } = useAccion();
  return (
    <button className="rounded-md p-1 text-texto-3 hover:bg-mal-suave hover:text-mal" disabled={pendiente} title="Borrar" onClick={() => void confirmar("¿Borrar este recurso?").then((ok) => ok && ejecutar(() => borrarRecurso(id)))}>
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

// Bloque 7 de 1.0: botón «Copiar link» (se queda en «Copiado» un momento)
export function CopiarLink({ url, etiqueta = "Copiar link" }: { url: string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="btn-secundario px-2.5 py-1.5 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      }}
    >
      {copiado ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
      {copiado ? "Copiado" : etiqueta}
    </button>
  );
}

// Un link de un producto (dossier o pago): Abrir y Copiar; quien edita recursos lo cambia con el lápiz
export function LinkProducto({ etiqueta, url, productoId, campo, editor }: { etiqueta: string; url: string | null; productoId: string; campo: "link_pago" | "link_dossier"; editor: boolean }) {
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <div className="rounded-lg bg-panel px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-texto-2">{etiqueta}</span>
        {editor && (
          <button
            type="button"
            className="rounded-md p-1 text-texto-3 hover:bg-panel-2 hover:text-texto"
            disabled={pendiente}
            aria-label={`Editar ${etiqueta.toLowerCase()}`}
            onClick={() => {
              void pedirTexto(`${etiqueta} (https://…). Déjalo vacío para quitarlo.`, url ?? "").then((nuevo) => {
                if (nuevo !== null) ejecutar(() => guardarLinkPago(productoId, nuevo, campo), `${etiqueta} guardado`);
              });
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {url ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <a href={url} target="_blank" rel="noreferrer" className="btn-primario px-2.5 py-1.5 text-xs"><ExternalLink className="h-3.5 w-3.5" /> Abrir</a>
          <CopiarLink url={url} />
        </div>
      ) : (
        <p className="mt-1 text-xs text-texto-3">Sin link todavía</p>
      )}
      {error && <p className="mt-1 text-xs text-mal">{error}</p>}
    </div>
  );
}

export function VerGuion({ titulo, contenido }: { titulo: string; contenido: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button className="text-sm text-primario hover:underline" onClick={() => setAbierto(true)}>Leer guion →</button>
      {abierto && (
        <Modal titulo={titulo} onCerrar={() => setAbierto(false)} ancho="max-w-2xl">
          <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-panel-2 p-4 font-sans text-sm leading-relaxed">{contenido}</pre>
        </Modal>
      )}
    </>
  );
}
