"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, ArrowRight, RotateCw } from "lucide-react";
import { Modal } from "@/components/modal";
import { OfertaChip } from "@/components/oferta-chip";
import { VerEstrellas } from "@/components/estrellas";
import { TelefonoCopiable } from "@/components/telefono-copiable";
import { resumenLead, type ResumenLead } from "@/app/(panel)/leads/resumen";
import { nombrePais } from "@/lib/formato";

// Popup de la card del lead (Cristian, 13 oct 2026): sus datos básicos y las respuestas del formulario, con el botón
// «Ver toda la info» a su ficha. Lo abren las cards del CRM (todos los tableros) y las filas de la Biblioteca.
export function PopupLead({ leadId, nombre, onCerrar }: { leadId: string; nombre: string; onCerrar: () => void }) {
  const [datos, setDatos] = useState<ResumenLead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false); // falló la red: «Reintentar» en vez de «Cargando…» para siempre
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    let vivo = true;
    resumenLead(leadId).then(
      (r) => {
        if (!vivo) return;
        if (!r || typeof r !== "object") return void setFallo(true);
        if ("error" in r) setError(r.error as string);
        else setDatos(r);
      },
      () => vivo && setFallo(true),
    );
    return () => {
      vivo = false;
    };
  }, [leadId, intento]);

  return (
    <Modal titulo={datos?.nombre || nombre || "Sin nombre"} onCerrar={onCerrar} ancho="max-w-xl">
      {error ? (
        <p className="text-sm text-mal">{error}</p>
      ) : fallo ? (
        <p className="py-6 text-center text-sm">
          <button type="button" className="inline-flex items-center gap-1 font-medium text-mal hover:underline" onClick={() => (setFallo(false), setIntento((n) => n + 1))}>
            <RotateCw className="h-3.5 w-3.5" /> No se pudo cargar · Reintentar
          </button>
        </p>
      ) : !datos ? (
        <p className="py-6 text-center text-sm text-texto-3">Cargando…</p>
      ) : (
        <div className="max-h-[calc(100dvh-13rem)] space-y-4 overflow-y-auto overscroll-contain pr-1 text-sm">
          <Bloque titulo="Contacto">
            <Dato k="Teléfono">
              {datos.telefono ? (
                <TelefonoCopiable telefono={datos.telefono} className="inline-flex items-center gap-1.5 text-primario hover:underline">
                  {datos.telefono} <Copy className="h-3.5 w-3.5" />
                </TelefonoCopiable>
              ) : "—"}
            </Dato>
            <Dato k="País">{nombrePais(datos.pais)}</Dato>
            <Dato k="Email">{datos.email || "—"}</Dato>
          </Bloque>
          <Bloque titulo="Dónde está">
            <Dato k="Pipeline y columna">
              {datos.donde.length ? datos.donde.map((d, i) => <div key={i}>{i > 0 && "🔗 "}{d.pipeline} → {d.columna}</div>) : "—"}
            </Dato>
            <Dato k="Entró">{datos.entro}</Dato>
          </Bloque>
          <Bloque titulo="Equipo">
            <Dato k="Caller">{datos.caller ?? "Sin caller"}</Dato>
            <Dato k="Closer">{datos.closer ?? "Sin closer"}</Dato>
            <Dato k="Estado de la llamada">{datos.estado}</Dato>
            <Dato k="Estrellas del caller"><VerEstrellas n={datos.estrellas} quien="caller" /></Dato>
          </Bloque>
          <section>
            <h3 className="titulo-seccion mb-2">Etiquetas y oferta</h3>
            <div className="flex flex-wrap items-center gap-1">
              <OfertaChip oferta={datos.oferta} vacio={false} />
              {datos.etiquetas.map((t) => <span key={t} className="chip bg-panel-2 text-texto-3">{t}</span>)}
              {!datos.oferta && !datos.etiquetas.length && <span className="text-texto-3">—</span>}
            </div>
          </section>
          <section>
            <h3 className="titulo-seccion mb-2">Respuestas del formulario</h3>
            {datos.respuestas.length ? (
              <dl className="space-y-2">
                {datos.respuestas.map((r, i) => (
                  <div key={i}>
                    <dt className="text-[11px] text-texto-3">{r.pregunta}</dt>
                    <dd>{r.respuesta || "—"}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-texto-3">Este lead no tiene respuestas de formulario.</p>
            )}
          </section>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Link href={`/leads/${leadId}`} className="btn-primario inline-flex items-center gap-1.5">
          Ver toda la info <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Modal>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="titulo-seccion mb-2">{titulo}</h3>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Dato({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-texto-3">{k}</div>
      <div>{children}</div>
    </div>
  );
}
