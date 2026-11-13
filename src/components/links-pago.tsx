"use client";

import { useState } from "react";
import { Copy, CreditCard, ExternalLink, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toasts";
import { useAccion, Mensajes } from "@/components/acciones-lead";
import { guardarLinkReserva, guardarLinksPago } from "@/app/(panel)/recursos/acciones";
import type { LinkPago } from "@/lib/links-pago";

// Fase 7 (Cristian, 12 oct 2026): «Links de pago» abre una ventana con todos los links del programa (un pago,
// 2 meses, 4 semanas…) y, aparte, el de Reserva. Quien edita recursos los cambia ahí mismo.
function FilaLink({ l }: { l: LinkPago }) {
  const toast = useToast();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borde bg-panel px-3 py-2">
      <span className="min-w-0 flex-1 text-sm font-medium">{l.nombre}</span>
      <span className="flex gap-1.5">
        <a href={l.url} target="_blank" rel="noreferrer" className="btn-primario px-2.5 py-1.5 text-xs"><ExternalLink className="h-3.5 w-3.5" /> Abrir</a>
        <button type="button" className="btn-secundario px-2.5 py-1.5 text-xs" onClick={() => void navigator.clipboard?.writeText(l.url).then(() => toast(`Copiado: ${l.nombre}`))}>
          <Copy className="h-3.5 w-3.5" /> Copiar
        </button>
      </span>
    </li>
  );
}

export function LinksPago({
  productoId,
  programa,
  links,
  reserva,
  editor,
  conReserva = true,
  boton = "normal",
  mercado = "latam",
}: {
  productoId: string;
  programa: string;
  links: LinkPago[];
  reserva: string | null;
  editor: boolean;
  conReserva?: boolean; // la Membresía no la lleva
  boton?: "normal" | "pequeno";
  mercado?: "latam" | "es"; // 13 nov: qué versión se guarda (la de Latam o la de España)
}) {
  const [abierta, setAbierta] = useState(false);
  const [editando, setEditando] = useState(false);
  const [filas, setFilas] = useState<LinkPago[]>(links);
  const [reservaTxt, setReservaTxt] = useState(reserva ?? "");
  const { pendiente, error, ejecutar } = useAccion();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFilas(links);
          setReservaTxt(reserva ?? "");
          setEditando(false);
          setAbierta(true);
        }}
        className={boton === "pequeno" ? "btn-secundario px-2.5 py-1.5 text-xs" : "btn-primario w-full justify-center"}
      >
        <CreditCard className="h-4 w-4" /> Links de pago{links.length ? ` (${links.length})` : ""}
      </button>
      {abierta && (
        <Modal titulo={`Links de pago · ${programa}${mercado === "es" ? " · España" : ""}`} onCerrar={() => setAbierta(false)} ancho="max-w-xl">
          {!editando ? (
            <div className="space-y-4">
              {links.length ? <ul className="space-y-2">{links.map((l) => <FilaLink key={l.url} l={l} />)}</ul> : <p className="text-sm text-texto-3">Este programa no tiene links de pago todavía.</p>}
              {conReserva && reserva && (
                <div className="border-t border-borde pt-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-3">Reserva (vale para cualquier programa)</div>
                  <ul><FilaLink l={{ nombre: "Reserva", url: reserva }} /></ul>
                </div>
              )}
              {editor && (
                <button type="button" className="btn-secundario" onClick={() => setEditando(true)}><Pencil className="h-4 w-4" /> Editar links</button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filas.map((f, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]">
                  <input className="campo py-1.5" value={f.nombre} onChange={(e) => setFilas((l) => l.map((x, k) => (k === i ? { ...x, nombre: e.target.value } : x)))} placeholder="Ej: 510 $ × 4 semanas" aria-label={`Nombre del link ${i + 1}`} />
                  <input className="campo py-1.5" value={f.url} onChange={(e) => setFilas((l) => l.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))} placeholder="https://buy.stripe.com/…" aria-label={`Enlace ${i + 1}`} />
                  <button type="button" className="rounded p-1.5 text-texto-3 hover:text-mal" onClick={() => setFilas((l) => l.filter((_, k) => k !== i))} aria-label="Quitar link"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" className="btn-secundario" onClick={() => setFilas((l) => [...l, { nombre: "", url: "" }])}><Plus className="h-4 w-4" /> Añadir link</button>
              {conReserva && (
                <label className="block border-t border-borde pt-3">
                  <span className="etiqueta-campo">Link de Reserva (el mismo para todos los programas)</span>
                  <input className="campo" value={reservaTxt} onChange={(e) => setReservaTxt(e.target.value)} placeholder="https://buy.stripe.com/…" />
                </label>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primario"
                  disabled={pendiente}
                  onClick={() =>
                    ejecutar(async () => {
                      const r = await guardarLinksPago(productoId, filas.filter((f) => f.url.trim()), mercado);
                      if (r && typeof r === "object" && "error" in r && r.error) return r;
                      if (conReserva && reservaTxt.trim() !== (reserva ?? "")) return guardarLinkReserva(reservaTxt, mercado);
                      return r;
                    }, "Links guardados")
                  }
                >
                  <Save className="h-4 w-4" /> Guardar
                </button>
                <button type="button" className="btn-secundario" onClick={() => setEditando(false)}>Cancelar</button>
              </div>
              <Mensajes error={error} ok="" />
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
