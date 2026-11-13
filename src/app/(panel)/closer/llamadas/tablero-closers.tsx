"use client";

import { useRef, useState, type ReactNode } from "react";
import { cambiarEstadoCita, reagendarCita } from "../acciones";
import { registrarVenta } from "@/app/(panel)/leads/acciones";
import { moverCitaColumna } from "@/app/(panel)/crm/acciones";
import { borrarVenta, cambiarFormaPago, registrarCobro } from "@/app/(panel)/ventas/acciones";
import { FilaVentaAcciones } from "@/app/(panel)/ventas/fila-acciones";
import { useAccion, Mensajes, FormVenta } from "@/components/acciones-lead";
import { Modal } from "@/components/modal";
import { SelectorEstrellas } from "@/components/estrellas";
import { useToast } from "@/components/toasts";
import { exigirOk } from "@/lib/resultado-cliente";
import { esClavePrecall, type ClaveCloser } from "@/lib/llamadas";
import type { EstadoCita, Producto } from "@/lib/tipos";
import { confirmar } from "@/components/dialogos";
import { Pastillas } from "@/components/eleccion";
import { ARRASTRE_COLUMNA } from "@/lib/orden";
import { TarjetaCrm } from "@/components/tarjeta-crm";

// Tablero «Closers» (Paso 0, Cristian 10 oct 2026): Pre-call y Post-call juntos, en el CRM y en Agendas.
// Columnas unidas: Pre-call cambia el estado de la cita; Post-call como en el H6 (estrellas, fecha, venta; las
// ventas entre Reserva, Cuotas y Cerradas; fuera de ellas se borran). Columnas libres: la cita se queda ahí
// hasta que cambie su estado. Todo se mueve arrastrando (Fase 4, tarjeta común del CRM); en el móvil, donde arrastrar
// no funciona, la cita lleva un «Mover a…» (N10, 13 nov) que hace lo mismo que soltarla en esa columna.

export type TarjetaCitaC = {
  id: string;
  lead_id: string;
  estado: EstadoCita;
  natural: ClaveCloser | null; // la columna que le toca por su estado
  nombre: string;
  telefono: string | null;
  pais: string | null; // 1b: el país del lead
  fechaTxt: string;
  quien: string; // «Agendó X» o «Calendario GHL»
  nota: string | null;
  closer: string | null;
  pasada: boolean;
  recuperar: boolean; // 3 nov: sin closer del equipo y sin resultado → en rojo
};
export type TarjetaVentaC = { id: string; lead_id: string; nombre: string; detalle: string; facturacionTxt: string; faltaTxt: string; pendiente: number; cobrado: number; devuelta: boolean };
export type ColumnaC = { id: string; clave: ClaveCloser | null; t: string; d?: string; color: string; citas: TarjetaCitaC[]; ventas: TarjetaVentaC[] };

type Item = { clase: "cita"; cita: TarjetaCitaC; origen: string } | { clase: "venta"; venta: TarjetaVentaC; origen: string };
type Ventana = { item: Item; destino: ColumnaC };

const DIRECTO: Partial<Record<ClaveCloser, EstadoCita>> = { pendientes: "pendiente", no_show: "no_show", cancelada: "cancelada" };
const esVenta = (c: ClaveCloser | null) => c === "reserva" || c === "cuotas" || c === "cerradas";

export function TableroClosers({
  columnas,
  productos,
  moneda,
  jefe,
  soloMirar = false,
  menuColumna,
  alFinal,
  reordenarColumna,
}: {
  columnas: ColumnaC[];
  productos: Producto[];
  moneda: string;
  jefe: boolean;
  soloMirar?: boolean;
  menuColumna?: (col: ColumnaC, i: number) => ReactNode; // CRM: «⋯» de la columna (quien puede editar)
  alFinal?: ReactNode; // CRM: «Añadir columna» y avisos
  reordenarColumna?: (desde: string, hasta: string) => void; // CRM (Fase 4): columnas que se arrastran, quien puede editar
}) {
  const { pendiente, error, ejecutar } = useAccion();
  const toast = useToast();
  const [sobre, setSobre] = useState<string | null>(null);
  const [colSobre, setColSobre] = useState<string | null>(null);
  const [ventana, setVentana] = useState<Ventana | null>(null);
  const nombre = (i: Item) => (i.clase === "cita" ? i.cita.nombre : i.venta.nombre);
  // Doble clic en «Registrar venta» = dos ventas: la ventana no se cierra hasta que responde el servidor (como en acciones-lead)
  const ventaEnCurso = useRef(false);
  function registrarUnaVez(leadId: string, fd: FormData) {
    if (ventaEnCurso.current) return;
    ventaEnCurso.current = true;
    ejecutar(() => registrarVenta(leadId, fd).finally(() => (ventaEnCurso.current = false)), "Venta registrada");
  }

  // Borra la venta y devuelve su cita (la que estaba «cerrada»), o avisa si no hay
  async function quitarVenta(venta: TarjetaVentaC) {
    const r = (await exigirOk(borrarVenta(venta.id))) as { aviso: string | null; citaId: string | null };
    if (r.aviso) toast(r.aviso, "error");
    if (!r.citaId) throw new Error("Venta borrada. Su cita no se ha movido: el lead tiene otra venta o no tenía cita cerrada.");
    return r.citaId;
  }

  function mover(item: Item, destino: ColumnaC) {
    if (item.origen === destino.id) return;
    const clave = destino.clave;
    // Columna libre: solo citas (se quedan ahí hasta que cambie su estado)
    if (!clave) {
      if (item.clase === "venta") toast("Una venta solo va a Reserva, Cuotas o Cerradas, o a una columna de citas (y se borra).", "error");
      else ejecutar(() => moverCitaColumna(item.cita.id, destino.id), `${item.cita.nombre} → ${destino.t}`);
      return;
    }
    // Vuelve a la columna de su estado: no cambia nada más
    if (item.clase === "cita" && item.cita.natural === clave) {
      ejecutar(() => moverCitaColumna(item.cita.id, null), `${item.cita.nombre} → ${destino.t}`);
      return;
    }
    // Pre-call: cambia el estado de la cita
    if (esClavePrecall(clave)) {
      if (item.clase === "cita") ejecutar(() => cambiarEstadoCita(item.cita.id, clave, ""), `${item.cita.nombre} → ${destino.t}`);
      else void confirmar(`¿Borrar la venta de ${item.venta.nombre} (${item.venta.facturacionTxt}) y pasar su cita a «${destino.t}»? Se borran también sus cobros y plazos; no se puede deshacer.`).then((ok) => {
        if (ok) ejecutar(async () => exigirOk(cambiarEstadoCita(await quitarVenta(item.venta), clave, "")), `${item.venta.nombre} → ${destino.t}`);
      });
      return;
    }
    // Venta entre Reserva, Cuotas y Cerradas
    if (item.clase === "venta" && esVenta(clave)) {
      const pagada = item.venta.pendiente <= 0.001;
      if (clave === "cerradas") {
        // Cerradas = pagadas del todo: se registra el cobro de lo que falta (criterio de Claude, 10 oct 2026)
        if (pagada) toast("Esta venta ya está pagada del todo.");
        else setVentana({ item, destino });
      } else if (pagada) toast(`Esta venta ya está pagada del todo: no hay nada que pasar a ${clave === "cuotas" ? "cuotas" : "reserva"}.`, "error");
      else if (clave === "cuotas") setVentana({ item, destino });
      else void confirmar(`¿Pasar la venta de ${item.venta.nombre} a reserva? Lo que falta (${item.venta.faltaTxt}) queda en un solo plazo a 30 días.`).then((ok) => {
        if (ok) ejecutar(() => cambiarFormaPago(item.venta.id, "reserva"), `${item.venta.nombre} → Reserva`);
      });
      return;
    }
    const estado = DIRECTO[clave];
    if (estado) {
      if (item.clase === "cita") ejecutar(() => cambiarEstadoCita(item.cita.id, estado, ""), `${item.cita.nombre} → ${destino.t}`);
      else void confirmar(`¿Borrar la venta de ${item.venta.nombre} (${item.venta.facturacionTxt}) y pasar su cita a «${destino.t}»? Se borran también sus cobros y plazos; no se puede deshacer.`).then((ok) => {
        if (ok) ejecutar(async () => exigirOk(cambiarEstadoCita(await quitarVenta(item.venta), estado, "")), `${item.venta.nombre} → ${destino.t}`);
      });
      return;
    }
    setVentana({ item, destino }); // estrellas, fecha o venta
  }

  function soltar(destino: ColumnaC, texto: string) {
    if (soloMirar) return; // H5: un caller con «Agendas», solo mirar
    let d: { clase?: string; id?: string; origen?: string } = {};
    try {
      d = JSON.parse(texto);
    } catch {
      return; // no es una tarjeta de este tablero
    }
    const col = columnas.find((c) => c.id === d.origen);
    const cita = d.clase === "cita" ? col?.citas.find((x) => x.id === d.id) : undefined;
    const venta = d.clase === "venta" ? col?.ventas.find((x) => x.id === d.id) : undefined;
    if (cita) mover({ clase: "cita", cita, origen: d.origen! }, destino);
    else if (venta) mover({ clase: "venta", venta, origen: d.origen! }, destino);
  }

  // Lo que hace el formulario de la ventana: si la tarjeta es una venta, primero se borra
  const citaDe = async (i: Item) => (i.clase === "cita" ? i.cita.id : await quitarVenta(i.venta));
  const avisoBorrar = (i: Item) =>
    i.clase === "venta" ? <p className="rounded-lg bg-mal-suave px-3 py-2 text-xs text-mal">Se borrará la venta de {i.venta.nombre} ({i.venta.facturacionTxt}) con sus cobros y plazos. No se puede deshacer.</p> : null;
  const claveV = ventana?.destino.clave;

  return (
    <>
      <div className={`flex gap-3 overflow-x-auto pb-2 ${pendiente ? "cursor-progress" : ""}`}>
        {columnas.map((col, i) => {
          const total = col.citas.length + col.ventas.length;
          return (
            <div
              key={col.id}
              onDragOver={(ev) => {
                ev.preventDefault();
                if (ev.dataTransfer.types.includes(ARRASTRE_COLUMNA)) setColSobre(col.id);
                else setSobre(col.id);
              }}
              onDragLeave={() => {
                setSobre((s) => (s === col.id ? null : s));
                setColSobre((s) => (s === col.id ? null : s));
              }}
              onDrop={(ev) => {
                ev.preventDefault();
                setSobre(null);
                setColSobre(null);
                const desde = ev.dataTransfer.getData(ARRASTRE_COLUMNA);
                if (desde) return reordenarColumna?.(desde, col.id);
                soltar(col, ev.dataTransfer.getData("text/plain"));
              }}
              className={`flex w-72 shrink-0 flex-col rounded-xl border transition-colors ${sobre === col.id ? "border-primario bg-primario-suave/40" : colSobre === col.id ? "border-dashed border-primario bg-panel-2/60" : "border-borde bg-panel-2/60"}`}
            >
              <div
                draggable={!!reordenarColumna}
                onDragStart={(ev) => {
                  ev.dataTransfer.effectAllowed = "move";
                  ev.dataTransfer.setData(ARRASTRE_COLUMNA, col.id);
                }}
                title={reordenarColumna ? "Arrastra la columna para cambiarla de sitio" : undefined}
                className={`flex items-start justify-between gap-2 border-b border-borde px-3 py-2.5 ${reordenarColumna ? "cursor-grab active:cursor-grabbing" : ""}`}
                style={{ borderTop: `3px solid ${col.color}`, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{col.t}</span>
                    <span className="rounded-full bg-panel px-1.5 text-[11px] tabular-nums text-texto-2">{total}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-texto-3">{col.d ?? (col.clave ? "" : "Columna libre")}</div>
                </div>
                {menuColumna?.(col, i)}
              </div>
              <div className="flex max-h-[70vh] min-h-24 flex-col gap-2 overflow-y-auto p-2">
                {total === 0 && <p className="py-6 text-center text-xs text-texto-3">Sin llamadas</p>}
                {col.citas.map((c) => (
                  <TarjetaCita key={c.id} c={c} origen={col.id} soloMirar={soloMirar} columnas={columnas} ocupado={pendiente} onMover={(destino) => mover({ clase: "cita", cita: c, origen: col.id }, destino)} />
                ))}
                {col.ventas.map((v) => (
                  <TarjetaCrm
                    key={v.id}
                    leadId={v.lead_id}
                    nombre={v.nombre}
                    arriba={<span className="shrink-0 text-xs tabular-nums">{v.facturacionTxt}</span>}
                    arrastrable={!soloMirar}
                    onArrastrar={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ clase: "venta", id: v.id, origen: col.id }))}
                    chips={
                      <>
                        <span className="chip bg-panel-2 text-texto-2">{v.detalle}</span>
                        {v.pendiente > 0.001 ? <span className="chip bg-aviso-suave text-aviso">Falta {v.faltaTxt}</span> : <span className="chip bg-ok-suave text-ok">Pagada</span>}
                      </>
                    }
                    pie={!soloMirar ? <div className="relative flex justify-end"><FilaVentaAcciones ventaId={v.id} pendiente={v.pendiente} cobrado={v.cobrado} devuelta={v.devuelta} jefe={jefe} /></div> : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {alFinal}
      </div>
      <Mensajes error={error} ok="" />

      {ventana && (claveV === "seguimiento" || claveV === "perdida") && (
        <Modal titulo={`${nombre(ventana.item)} → ${ventana.destino.t}`} onCerrar={() => setVentana(null)}>
          <form
            className="space-y-3"
            action={(fd) => {
              const { item } = ventana;
              const e = claveV as "seguimiento" | "perdida";
              ejecutar(async () => exigirOk(cambiarEstadoCita(await citaDe(item), e, String(fd.get("nota") ?? ""), Number(fd.get("estrellas")))), ventana.destino.t);
              setVentana(null);
            }}
          >
            {avisoBorrar(ventana.item)}
            <SelectorEstrellas quien="closer" />
            <label className="block"><span className="etiqueta-campo">Nota (opcional)</span><textarea name="nota" rows={2} className="campo" placeholder={claveV === "seguimiento" ? "Qué falta para que decida" : "Por qué no compró"} /></label>
            <button className="btn-primario w-full">Guardar</button>
          </form>
        </Modal>
      )}
      {ventana && claveV === "reagendadas" && (
        <Modal titulo={`Reagendar a ${nombre(ventana.item)}`} onCerrar={() => setVentana(null)}>
          <form
            className="space-y-3"
            action={(fd) => {
              const { item } = ventana;
              ejecutar(async () => exigirOk(reagendarCita(await citaDe(item), String(fd.get("fecha")))), "Cita reagendada");
              setVentana(null);
            }}
          >
            {avisoBorrar(ventana.item)}
            <label className="block"><span className="etiqueta-campo">Nueva fecha y hora</span><input type="datetime-local" name="fecha" required className="campo" /></label>
            <button className="btn-primario w-full">Reagendar</button>
          </form>
        </Modal>
      )}
      {ventana && ventana.item.clase === "cita" && esVenta(claveV ?? null) && (
        <Modal titulo={`Registrar venta de ${ventana.item.cita.nombre} (${claveV === "reserva" ? "reserva" : claveV === "cuotas" ? "cuotas" : "pago completo"})`} onCerrar={() => setVentana(null)} ancho="max-w-lg">
          <FormVenta
            productos={productos}
            moneda={moneda}
            desdeCita
            tipoInicial={claveV === "cerradas" ? "completo" : (claveV as "reserva" | "cuotas")}
            onEnviar={(fd) => {
              if (ventana.item.clase !== "cita") return;
              const { lead_id, id } = ventana.item.cita;
              fd.set("cita_id", id); // cierra esta cita, aunque estuviera terminada
              registrarUnaVez(lead_id, fd);
              setVentana(null);
            }}
          />
        </Modal>
      )}
      {ventana && ventana.item.clase === "venta" && claveV === "cerradas" && (
        <Modal titulo={`Cobrar lo que falta de ${ventana.item.venta.nombre}`} onCerrar={() => setVentana(null)}>
          <form
            className="space-y-3"
            action={(fd) => {
              if (ventana.item.clase !== "venta") return;
              const v = ventana.item.venta;
              ejecutar(() => registrarCobro(v.id, String(fd.get("importe")), String(fd.get("metodo")), String(fd.get("fecha") ?? "")), `${v.nombre} → ${ventana.destino.t}`);
              setVentana(null);
            }}
          >
            <p className="text-sm text-texto-2">«{ventana.destino.t}» son las ventas pagadas del todo. Para pasarla, registra el cobro de lo que falta: <b>{ventana.item.venta.faltaTxt}</b>.</p>
            <label className="block"><span className="etiqueta-campo">Importe cobrado</span><input name="importe" inputMode="decimal" required defaultValue={ventana.item.venta.pendiente.toFixed(2)} className="campo" /></label>
            <label className="block">
              <span className="etiqueta-campo">Método</span>
              <Pastillas name="metodo" className="campo" defaultValue="stripe"><option value="stripe">Stripe</option><option value="transferencia">Transferencia</option><option value="otro">Otro</option></Pastillas>
            </label>
            <label className="block"><span className="etiqueta-campo">Fecha del cobro (vacía = hoy)</span><input name="fecha" type="date" className="campo" /></label>
            <button className="btn-primario w-full">Registrar cobro</button>
          </form>
        </Modal>
      )}
      {ventana && ventana.item.clase === "venta" && claveV === "cuotas" && (
        <Modal titulo={`Pasar a cuotas la venta de ${ventana.item.venta.nombre}`} onCerrar={() => setVentana(null)}>
          <form
            className="space-y-3"
            action={(fd) => {
              if (ventana.item.clase !== "venta") return;
              const v = ventana.item.venta;
              ejecutar(() => cambiarFormaPago(v.id, "cuotas", String(fd.get("cuotas"))), `${v.nombre} → ${ventana.destino.t}`);
              setVentana(null);
            }}
          >
            <p className="text-sm text-texto-2">Falta por cobrar <b>{ventana.item.venta.faltaTxt}</b>. Se reparte en cuotas mensuales desde el mes que viene; lo ya cobrado se queda como está.</p>
            <label className="block"><span className="etiqueta-campo">¿En cuántas cuotas lo que falta?</span><input name="cuotas" type="number" min={1} max={60} required defaultValue={3} className="campo" /></label>
            <button className="btn-primario w-full">Pasar a cuotas</button>
          </form>
        </Modal>
      )}
    </>
  );
}

// Sin botones (Cristian, 13 oct 2026): la cita se mueve arrastrando; el clic abre el popup del lead.
// N10: en pantallas pequeñas (sin arrastrar), «Mover a…».
function TarjetaCita({ c, origen, soloMirar, columnas, ocupado, onMover }: { c: TarjetaCitaC; origen: string; soloMirar: boolean; columnas: ColumnaC[]; ocupado: boolean; onMover: (destino: ColumnaC) => void }) {
  const moverA = !soloMirar && (
    <select
      aria-label={`Mover a ${c.nombre} a otra columna`}
      className="campo py-1.5 text-xs sm:hidden"
      value=""
      disabled={ocupado}
      onChange={(e) => {
        const destino = columnas.find((x) => x.id === e.target.value);
        if (destino) onMover(destino);
      }}
    >
      <option value="">Mover a…</option>
      {columnas.filter((x) => x.id !== origen).map((x) => <option key={x.id} value={x.id}>{x.t}</option>)}
    </select>
  );
  return (
    <TarjetaCrm
      leadId={c.lead_id}
      nombre={c.nombre}
      telefono={c.telefono}
      pais={c.pais}
      arriba={c.closer ? <span className={`chip shrink-0 ${c.recuperar ? "bg-mal text-white" : "bg-panel-2 text-texto-3"}`}>{c.recuperar ? `Recuperar · ${c.closer}` : c.closer}</span> : undefined}
      alerta={c.recuperar}
      arrastrable={!soloMirar}
      onArrastrar={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ clase: "cita", id: c.id, origen }))}
      chips={
        <>
          <span className="chip bg-primario-suave text-primario">📅 {c.fechaTxt}</span>
          <span className="chip bg-panel-2 text-texto-3">{c.quien}</span>
        </>
      }
      pie={c.nota || moverA ? <>{c.nota && <div className="text-xs text-texto-2">📝 {c.nota}</div>}{moverA}</> : undefined}
    />
  );
}
