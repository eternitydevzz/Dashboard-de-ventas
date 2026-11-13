"use client";

import { useRef, useState } from "react";
import { Check, ShoppingCart, ListChecks, UserX, CalendarClock, XCircle, Ban, ThumbsDown, UserCog, Trash2 } from "lucide-react";
import { borrarCita, cambiarCloserCita, cambiarEstadoCita, reagendarCita } from "./acciones";
import { confirmar } from "@/components/dialogos";
import { registrarVenta } from "@/app/(panel)/leads/acciones";
import { useAccion, Mensajes, FormVenta } from "@/components/acciones-lead";
import { Modal } from "@/components/modal";
import { CoachIa } from "@/components/coach";
import { SelectorEstrellas } from "@/components/estrellas";
import type { EstadoCita, Producto } from "@/lib/tipos";

export function AccionesCita({
  cita,
  pasada,
  productos,
  moneda,
  ceo,
}: {
  cita: { id: string; estado: EstadoCita; lead_id: string; closer_id?: string | null };
  pasada: boolean;
  productos: Producto[];
  moneda: string;
  // Solo el CEO: cambiar el closer o borrar la cita (también en GHL)
  ceo?: { closers: { id: string; nombre: string }[] };
}) {
  const { pendiente, error, ok, ejecutar } = useAccion();
  const [modal, setModal] = useState<null | "venta" | "reagendar" | "seguimiento" | "perdida" | "closer">(null);
  const b = "btn-secundario px-2.5 py-1.5 text-xs";
  const abierta = cita.estado === "pendiente" || cita.estado === "confirmada" || cita.estado === "confirmacion_pendiente";
  const estado = (e: EstadoCita, msg: string) => ejecutar(() => cambiarEstadoCita(cita.id, e, ""), msg);
  // Doble clic en «Registrar venta» = dos ventas: la ventana no se cierra hasta que responde el servidor (como en acciones-lead)
  const ventaEnCurso = useRef(false);

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <div className="flex flex-wrap gap-1.5">
        {(abierta || cita.estado === "seguimiento") && <CoachIa leadId={cita.lead_id} className={b} />}
        {abierta && !pasada && (
          <>
            {(cita.estado === "pendiente" || cita.estado === "confirmacion_pendiente") && <button className={b} disabled={pendiente} onClick={() => estado("confirmada", "Confirmada")}><Check className="h-3.5 w-3.5 text-ok" />Confirmar</button>}
            <button className={b} disabled={pendiente} onClick={() => estado("no_califica", "Marcada como no califica")}><Ban className="h-3.5 w-3.5 text-mal" />No califica</button>
            <button className={b} disabled={pendiente} onClick={() => setModal("reagendar")}><CalendarClock className="h-3.5 w-3.5" />Reagendar</button>
            <button className={b} disabled={pendiente} onClick={() => estado("cancelada", "Cancelada")}><XCircle className="h-3.5 w-3.5 text-mal" />Cancelar</button>
          </>
        )}
        {(pasada && abierta) || cita.estado === "seguimiento" ? (
          <>
            <button className="btn-primario px-2.5 py-1.5 text-xs" disabled={pendiente} onClick={() => setModal("venta")}><ShoppingCart className="h-3.5 w-3.5" />Cerrada</button>
            {cita.estado !== "seguimiento" && <button className={b} disabled={pendiente} onClick={() => setModal("seguimiento")}><ListChecks className="h-3.5 w-3.5 text-aviso" />Seguimiento</button>}
            {cita.estado !== "seguimiento" && <button className={b} disabled={pendiente} onClick={() => estado("no_show", "No show")}><UserX className="h-3.5 w-3.5 text-mal" />No show</button>}
            <button className={b} disabled={pendiente} onClick={() => setModal("perdida")}><ThumbsDown className="h-3.5 w-3.5 text-mal" />Perdida</button>
            {cita.estado !== "seguimiento" && <button className={b} disabled={pendiente} onClick={() => setModal("reagendar")}><CalendarClock className="h-3.5 w-3.5" />Reagendar</button>}
          </>
        ) : null}
        {ceo && cita.estado !== "cerrada" && (
          <>
            <button className={b} disabled={pendiente} onClick={() => setModal("closer")}><UserCog className="h-3.5 w-3.5" />Cambiar closer</button>
            <button className={b} disabled={pendiente} onClick={async () => { if (await confirmar("¿Borrar esta cita? Se borra también en GHL y no se puede deshacer.", { boton: "Borrar" })) ejecutar(() => borrarCita(cita.id), "Cita borrada"); }}><Trash2 className="h-3.5 w-3.5 text-mal" />Borrar cita</button>
          </>
        )}
      </div>
      <Mensajes error={error} ok={ok} />
      {modal === "venta" && (
        <Modal titulo="Registrar venta (cita cerrada)" onCerrar={() => setModal(null)} ancho="max-w-lg">
          <FormVenta
            productos={productos}
            moneda={moneda}
            desdeCita
            onEnviar={(fd) => {
              if (ventaEnCurso.current) return;
              ventaEnCurso.current = true;
              ejecutar(() => registrarVenta(cita.lead_id, fd).finally(() => (ventaEnCurso.current = false)), "Venta registrada");
              setModal(null);
            }}
          />
        </Modal>
      )}
      {(modal === "seguimiento" || modal === "perdida") && (
        <Modal titulo={modal === "seguimiento" ? "Pasar a seguimiento" : "Marcar como perdida"} onCerrar={() => setModal(null)}>
          <form
            className="space-y-3"
            action={(fd) => {
              const e = modal;
              ejecutar(() => cambiarEstadoCita(cita.id, e, String(fd.get("nota") ?? ""), Number(fd.get("estrellas"))), e === "seguimiento" ? "En seguimiento" : "Perdida");
              setModal(null);
            }}
          >
            <SelectorEstrellas quien="closer" />
            <label className="block"><span className="etiqueta-campo">Nota (opcional)</span><textarea name="nota" rows={2} className="campo" placeholder={modal === "seguimiento" ? "Qué falta para que decida" : "Por qué no compró"} /></label>
            <button className="btn-primario w-full">Guardar</button>
          </form>
        </Modal>
      )}
      {modal === "closer" && ceo && (
        <Modal titulo="Cambiar closer" onCerrar={() => setModal(null)}>
          <form
            className="space-y-3"
            action={(fd) => {
              ejecutar(() => cambiarCloserCita(cita.id, String(fd.get("closer"))), "Closer cambiado");
              setModal(null);
            }}
          >
            <label className="block"><span className="etiqueta-campo">Nuevo closer (también en GHL)</span>
              <select name="closer" required className="campo" defaultValue="">
                <option value="" disabled>Elige un closer</option>
                {ceo.closers.filter((c) => c.id !== cita.closer_id).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <button className="btn-primario w-full">Cambiar</button>
          </form>
        </Modal>
      )}
      {modal === "reagendar" && (
        <Modal titulo="Reagendar cita" onCerrar={() => setModal(null)}>
          <form
            className="space-y-3"
            action={(fd) => {
              ejecutar(() => reagendarCita(cita.id, String(fd.get("fecha"))), "Cita reagendada");
              setModal(null);
            }}
          >
            <label className="block"><span className="etiqueta-campo">Nueva fecha y hora</span><input type="datetime-local" name="fecha" required className="campo" /></label>
            <button className="btn-primario w-full">Reagendar</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
