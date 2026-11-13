"use client";

import { useRef } from "react";
import { agendarCita, registrarLlamada, registrarVenta } from "@/app/(panel)/leads/acciones";
import { FormVenta } from "@/components/acciones-lead";
import { Modal } from "@/components/modal";
import { SelectorEstrellas } from "@/components/estrellas";
import type { Producto } from "@/lib/tipos";
import { CamposCita } from "@/components/campos-cita";
import { CalendarioAgenda } from "@/components/calendario-agenda";
import { MiniCalendario } from "@/components/mini-calendario";
import { etiquetaEstado } from "@/lib/estados-caller";

// Ventanas de los resultados que piden datos (Paso H7; C11, plan Callers, 7 nov). Se abren al soltar un lead en su
// columna del CRM y al pulsar su botón en «Mis leads» o en el guion. Estrellas como hoy (Cristian, 7 nov).
// «Llamar luego» pide cuándo con un minicalendario opcional (Cristian, 10 nov; antes, sin fechas por el punto 11).
// Sin «Link enviado» (desaparece).
export type DestinoConVentana = "llamar_luego" | "seguimiento" | "no_interesa" | "agendado" | "vendido";
export const CON_VENTANA: readonly string[] = ["llamar_luego", "seguimiento", "no_interesa", "agendado", "vendido"];

export function VentanaEstado({
  lead,
  destino,
  closers,
  productos,
  moneda,
  esCaller,
  onCerrar,
  onGuardar,
}: {
  lead: { id: string; nombre: string };
  destino: DestinoConVentana;
  closers: { id: string; nombre: string }[];
  productos: Producto[];
  moneda: string;
  esCaller: boolean; // el caller: estrellas obligatorias al agendar y el closer lo pone la rotación
  onCerrar: () => void;
  onGuardar: (accion: () => Promise<unknown>, mensaje: string) => void;
}) {
  // La ventana no se cierra hasta que responde el servidor (React junta su cierre con la acción en curso): un segundo
  // «Guardar» repetía el cambio (historial «Llamar luego» 2 veces, 10 nov). Una ventana = un envío.
  const enviado = useRef(false);
  const guardar = (accion: () => Promise<unknown>, mensaje: string) => {
    if (enviado.current) return;
    enviado.current = true;
    onGuardar(accion, mensaje);
    onCerrar();
  };
  if (destino === "llamar_luego" || destino === "seguimiento" || destino === "no_interesa")
    return (
      <Modal titulo={`${lead.nombre} → ${etiquetaEstado(destino)}`} onCerrar={onCerrar}>
        <form className="space-y-3" action={(fd) => guardar(() => registrarLlamada(lead.id, destino, String(fd.get("nota") ?? ""), Number(fd.get("estrellas")), String(fd.get("llamar_en") ?? "") || undefined), `${lead.nombre} → ${etiquetaEstado(destino)}`)}>
          <SelectorEstrellas quien="caller" />
          {destino === "llamar_luego" && <MiniCalendario name="llamar_en" />}
          <label className="block"><span className="etiqueta-campo">Nota (opcional)</span><textarea name="nota" rows={2} className="campo" placeholder={destino === "no_interesa" ? "Por qué no le interesa" : "Lo que te dijo, tal cual"} /></label>
          <button className="btn-primario w-full">Guardar</button>
        </form>
      </Modal>
    );
  if (destino === "agendado")
    return (
      <Modal titulo={`Agendar a ${lead.nombre}`} onCerrar={onCerrar}>
        <form
          className="space-y-3"
          action={(fd) =>
            guardar(() => agendarCita(lead.id, String(fd.get("closer") ?? ""), String(fd.get("fecha")), String(fd.get("nota") ?? ""), fd.get("estrellas") ? Number(fd.get("estrellas")) : undefined), `${lead.nombre} → Agendado`)
          }
        >
          {/* El caller elige en el calendario las horas libres del closer de la rotación (maqueta 7c.3) */}
          {esCaller ? <CalendarioAgenda leadId={lead.id} /> : <CamposCita closers={closers} id={`ventana-estado-closer-${lead.id}`} />}
          <label className="block"><span className="etiqueta-campo">Nota para el closer</span><textarea name="nota" rows={3} className="campo" placeholder="Situación, dolor, cifra…" /></label>
          <SelectorEstrellas quien="caller" opcional={!esCaller} />
          <button className="btn-primario w-full">Agendar</button>
        </form>
      </Modal>
    );
  return (
    <Modal titulo={`Venta a ${lead.nombre}`} onCerrar={onCerrar} ancho="max-w-lg">
      <FormVenta productos={productos} moneda={moneda} onEnviar={(fd) => guardar(() => registrarVenta(lead.id, fd), `${lead.nombre} → Vendido`)} />
    </Modal>
  );
}
