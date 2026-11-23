"use client";

import { useState } from "react";
import { sinVaciar } from "@/components/sin-vaciar";
import { Plus, Trash2, Undo2 } from "lucide-react";
import { borrarVenta, darDeBajaMembresia, registrarCobro, registrarDevolucion } from "./acciones";
import { useAccion, Mensajes } from "@/components/acciones-lead";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toasts";
import { exigirOk } from "@/lib/resultado-cliente";
import { confirmar } from "@/components/dialogos";
import { Pastillas } from "@/components/eleccion";

export function FilaVentaAcciones({ ventaId, pendiente, cobrado, devuelta, jefe, membresiaActiva = false }: { ventaId: string; pendiente: number; cobrado: number; devuelta: boolean; jefe: boolean; membresiaActiva?: boolean }) {
  const { pendiente: cargando, error, ok, ejecutar } = useAccion();
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [devolucion, setDevolucion] = useState(false);
  return (
    <div className="flex items-center justify-end gap-1">
      {membresiaActiva && (
        <button className="btn-secundario px-2 py-1 text-xs" disabled={cargando} title="El Club deja de generar cobros cada mes" onClick={() => void confirmar("¿Dar de baja este Club? Deja de generar cobros cada mes y se quitan los que aún no vencieron.").then((ok) => ok && ejecutar(() => darDeBajaMembresia(ventaId), "Club dado de baja"))}>
          Dar de baja
        </button>
      )}
      {pendiente > 0 && (
        <button className="btn-secundario px-2 py-1 text-xs" disabled={cargando} onClick={() => setAbierto(true)} title="Registrar cobro de cuota o resto">
          <Plus className="h-3.5 w-3.5" /> Cobro
        </button>
      )}
      {jefe && !devuelta && cobrado > 0 && (
        <button className="btn-secundario px-2 py-1 text-xs" disabled={cargando} onClick={() => setDevolucion(true)} title="Registrar una devolución">
          <Undo2 className="h-3.5 w-3.5" /> Devolución
        </button>
      )}
      {jefe && (
        <button
          className="rounded-md p-1.5 text-texto-3 hover:bg-mal-suave hover:text-mal"
          disabled={cargando}
          title="Borrar venta"
          aria-label="Borrar venta"
          onClick={() =>
            void confirmar("¿Borrar esta venta? No se puede deshacer. Su cita volverá a «En seguimiento».").then((ok) => ok && ejecutar(async () => {
              const r = (await exigirOk(borrarVenta(ventaId))) as { aviso: string | null };
              toast(r.aviso ?? "Venta borrada", r.aviso ? "error" : undefined);
            }))
          }
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      {(error || ok) && <div className="absolute"><Mensajes error={error} ok={ok} /></div>}
      {devolucion && (
        <Modal titulo="Registrar devolución" onCerrar={() => setDevolucion(false)}>
          <form
            className="space-y-3"
            onSubmit={sinVaciar((fd) => {
              ejecutar(() => registrarDevolucion(ventaId, String(fd.get("importe")), String(fd.get("fecha") ?? ""), String(fd.get("nota") ?? "")), "Devolución registrada");
              setDevolucion(false);
            })}
          >
            <p className="text-sm text-texto-2">Cobrado hasta hoy: <b>{cobrado.toFixed(2)}</b>. La comisión que ya se pagó no se descuenta (la asume la empresa).</p>
            <label className="block"><span className="etiqueta-campo">Importe devuelto</span><input name="importe" inputMode="decimal" required defaultValue={cobrado.toFixed(2)} className="campo" /></label>
            <label className="block"><span className="etiqueta-campo">Fecha de la devolución</span><input name="fecha" type="date" className="campo" /></label>
            <label className="block"><span className="etiqueta-campo">Motivo (opcional)</span><textarea name="nota" rows={2} className="campo" /></label>
            <button className="btn-primario w-full">Guardar devolución</button>
          </form>
        </Modal>
      )}
      {abierto && (
        <Modal titulo="Registrar cobro" onCerrar={() => setAbierto(false)}>
          <form
            className="space-y-3"
            onSubmit={sinVaciar((fd) => {
              ejecutar(() => registrarCobro(ventaId, String(fd.get("importe")), String(fd.get("metodo")), String(fd.get("fecha") ?? "")), "Cobro registrado");
              setAbierto(false);
            })}
          >
            <p className="text-sm text-texto-2">Queda pendiente: <b>{pendiente.toFixed(2)}</b></p>
            <label className="block"><span className="etiqueta-campo">Importe cobrado</span><input name="importe" inputMode="decimal" required defaultValue={pendiente.toFixed(2)} className="campo" /></label>
            <div>
              <label className="etiqueta-campo" htmlFor="fila-acciones-metodo">Método</label>
              <Pastillas id="fila-acciones-metodo" name="metodo" className="campo"><option value="stripe">Stripe</option><option value="transferencia">Transferencia</option><option value="otro">Otro</option></Pastillas>
            </div>
            <label className="block"><span className="etiqueta-campo">Fecha del cobro (vacía = hoy)</span><input name="fecha" type="date" className="campo" /></label>
            <button className="btn-primario w-full">Guardar cobro</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
