"use client";

import { useState, useTransition } from "react";
import { PhoneOff, Clock, MessageCircle, ShoppingCart, StickyNote, ScrollText, Check, Link2, Phone, CircleX, Repeat, CalendarDays, CalendarCheck, Ban, type LucideIcon } from "lucide-react";
import { anadirNota, confirmarAgenda, registrarLlamada, registrarVenta, type ResultadoSimple } from "@/app/(panel)/leads/acciones";
import { BOTONES_RESULTADO, colorEstado, etiquetaEstado, type BotonResultado } from "@/lib/estados-caller";
import { CON_VENTANA, VentanaEstado, type DestinoConVentana } from "@/app/(panel)/crm/ventanas-estado";
import { Modal } from "@/components/modal";
import { SelectorEstrellas } from "@/components/estrellas";
import { useToast } from "@/components/toasts";
import { exigirOk } from "@/lib/resultado-cliente";
import type { Producto } from "@/lib/tipos";
import { Desplegable, Pastillas } from "@/components/eleccion";
import { GuionLlamada } from "@/components/guion-llamada";
import type { Guion } from "@/lib/guiones";

type Persona = { id: string; nombre: string };


// Ejecuta una acción del servidor: muestra «guardado» en un aviso flotante
// y, si falla, el error en el aviso y también junto al botón.
export function useAccion() {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState("");
  const toast = useToast();
  function ejecutar(fn: () => Promise<unknown>, mensaje?: string) {
    setError("");
    iniciar(async () => {
      try {
        await exigirOk(fn());
        if (mensaje) toast(mensaje);
      } catch (e) {
        const texto = e instanceof Error ? e.message : "Algo falló.";
        setError(texto);
        toast(texto, "error");
      }
    });
  }
  return { pendiente, error, ok: "", ejecutar };
}

export function Mensajes({ error, ok }: { error: string; ok: string }) {
  return (
    <>
      {error && <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{error}</p>}
      {ok && <p className="flex items-center gap-1.5 rounded-lg bg-ok-suave px-3 py-2 text-sm text-ok"><Check className="h-4 w-4" />{ok}</p>}
    </>
  );
}

// C11 (plan Callers, 7 nov): iconos de los 9 resultados (los de la maqueta, lucide)
export const ICONO_RESULTADO: Record<BotonResultado, LucideIcon> = {
  llamado: Phone,
  wsp_enviado: MessageCircle,
  no_responde: PhoneOff,
  no_interesa: CircleX,
  seguimiento: Repeat,
  llamar_luego: Clock,
  agendado: CalendarDays,
  confirma_agenda: CalendarCheck,
  descartado: Ban,
};

// Botones del lead (cola, guion y ficha completa). C11: los 9 resultados mueven el lead a su columna de «Callers»;
// los que piden datos (estrellas, fecha) abren su ventana, la misma que al soltar en el CRM.
export function AccionesLead({
  leadId,
  telefono,
  closers,
  productos,
  rol,
  vendedores,
  closerCita,
  miId,
  linkAgenda,
  moneda,
  compacto = false,
  guion,
  nombreLead = "",
  miNombre = "",
  estado,
}: {
  leadId: string;
  telefono: string | null;
  closers: Persona[];
  productos: Producto[];
  rol: string;
  vendedores?: Persona[];
  closerCita?: Persona; // closer de la cita abierta del lead: por defecto la venta es suya (11 oct)
  miId?: string;
  linkAgenda?: string | null; // link del calendario de GHL del proyecto (4.4, 11 oct)
  moneda: string;
  compacto?: boolean;
  guion?: Guion; // Fase 6: «Guion» abre el guion de la llamada
  nombreLead?: string;
  miNombre?: string;
  estado?: string; // columna actual del lead: su botón se ve marcado
}) {
  const { pendiente, error, ok, ejecutar } = useAccion();
  const aviso = useToast();
  async function copiarLinkAgenda() {
    try {
      await navigator.clipboard.writeText(linkAgenda!);
      aviso("Link de agenda copiado");
    } catch {
      aviso(`No se pudo copiar. El link es: ${linkAgenda}`, "error");
    }
  }
  const [modal, setModal] = useState<null | "guion" | "nota" | "venta">(null);
  const [ventana, setVentana] = useState<DestinoConVentana | null>(null);
  const [nota, setNota] = useState("");
  const telLimpio = (telefono ?? "").replace(/[^\d]/g, "");
  const productosVisibles = rol === "caller" ? [] : productos; // el caller no registra ventas (Cristian, 12 oct)
  const nombre = nombreLead || "este lead";

  function resultado(clave: string) {
    if (CON_VENTANA.includes(clave)) return setVentana(clave as DestinoConVentana);
    if (clave === "confirma_agenda") return ejecutar(() => confirmarAgenda(leadId), "Guardado: Confirma Agenda (cita confirmada)");
    ejecutar(() => registrarLlamada(leadId, clave as ResultadoSimple, ""), `Guardado: ${etiquetaEstado(clave)}`);
  }

  const boton = "btn-secundario justify-start";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {guion && (
          <button type="button" className="btn-primario" onClick={() => setModal("guion")}>
            <ScrollText className="h-4 w-4" /> Guion
          </button>
        )}
        {/* F9 (plan Callers): abrir WhatsApp ya no apunta nada; lo apunta el resultado «Wsp enviado» */}
        {telLimpio && (
          <a href={`https://wa.me/${telLimpio}`} target="_blank" rel="noreferrer" className={`${boton} text-ok`}>
            <MessageCircle className="h-4 w-4" /> Wsp
          </a>
        )}
        {linkAgenda && (
          <button type="button" className={boton} onClick={() => void copiarLinkAgenda()}>
            <Link2 className="h-4 w-4 text-primario" /> Copiar link agenda
          </button>
        )}
        <button className={boton} disabled={pendiente} onClick={() => setModal("nota")}>
          <StickyNote className="h-4 w-4 text-texto-3" /> Nota
        </button>
        {productosVisibles.length > 0 && (
          <button className={boton} disabled={pendiente} onClick={() => setModal("venta")}>
            <ShoppingCart className="h-4 w-4 text-oro" /> Registrar venta
          </button>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-3">¿Cómo ha ido?</div>
        <div className={`grid gap-2 ${compacto ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
          {BOTONES_RESULTADO.map((k) => {
            const Icono = ICONO_RESULTADO[k];
            const actual = estado === k;
            return (
              <button key={k} type="button" className={`${boton} ${actual ? "border-primario bg-primario-suave text-primario" : ""}`} aria-current={actual ? "true" : undefined} disabled={pendiente} onClick={() => resultado(k)}>
                <Icono className="h-4 w-4" style={{ color: colorEstado(k) }} /> {etiquetaEstado(k)}
              </button>
            );
          })}
        </div>
      </div>
      <Mensajes error={error} ok={ok} />

      {modal === "guion" && guion && (
        <GuionLlamada
          leadId={leadId}
          nombreLead={nombre}
          telefono={telefono}
          miNombre={miNombre}
          guion={guion}
          resultados={BOTONES_RESULTADO.map((k) => {
            const Icono = ICONO_RESULTADO[k];
            return { clave: k, texto: etiquetaEstado(k), icono: <Icono className="h-4 w-4" style={{ color: colorEstado(k) }} /> };
          })}
          onResultado={(clave) => {
            setModal(null);
            resultado(clave);
          }}
          onCerrar={() => setModal(null)}
        />
      )}

      {ventana && (
        <VentanaEstado
          lead={{ id: leadId, nombre }}
          destino={ventana}
          closers={closers}
          productos={productosVisibles}
          moneda={moneda}
          esCaller={rol === "caller"}
          onCerrar={() => setVentana(null)}
          onGuardar={(accion, mensaje) => ejecutar(accion, mensaje)}
        />
      )}
      {modal === "venta" && (
        <Modal titulo="Registrar venta" onCerrar={() => setModal(null)} ancho="max-w-lg">
          <FormVenta
            productos={productosVisibles}
            vendedores={vendedores}
            closerCita={closerCita}
            miId={miId}
            moneda={moneda}
            onEnviar={(fd) => {
              ejecutar(() => registrarVenta(leadId, fd), "Venta registrada");
              setModal(null);
            }}
          />
        </Modal>
      )}
      {modal === "nota" && (
        <Modal titulo="Añadir nota" onCerrar={() => setModal(null)}>
          <div className="space-y-3">
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={4} className="campo" placeholder="Escribe la nota…" />
            <button
              className="btn-primario w-full"
              onClick={() => {
                ejecutar(() => anadirNota(leadId, nota), "Nota guardada");
                setNota("");
                setModal(null);
              }}
            >
              Guardar nota
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function FormVenta({
  productos,
  vendedores,
  closerCita,
  miId,
  moneda,
  onEnviar,
  desdeCita = false,
  tipoInicial,
}: {
  productos: Producto[];
  vendedores?: Persona[];
  closerCita?: Persona;
  miId?: string;
  moneda: string;
  onEnviar: (fd: FormData) => void;
  desdeCita?: boolean; // el closer cierra su cita: pide las estrellas del prospecto
  tipoInicial?: "completo" | "reserva" | "cuotas"; // al soltar en «Cerradas», «Reserva» o «Cuotas» del Post-call (Paso H6)
}) {
  const [productoId, setProductoId] = useState(productos[0]?.id ?? "");
  const producto = productos.find((p) => p.id === productoId);
  const [facturacion, setFacturacion] = useState(String(producto?.precio ?? ""));
  const tipoDe = (p?: Producto) => (p?.modo_pago === "cuotas" ? "cuotas" : p?.modo_pago === "mensual" ? "mensual" : "completo");
  const [tipo, setTipo] = useState<string>(tipoInicial ?? tipoDe(producto));
  const [cash, setCash] = useState(tipoInicial && tipoInicial !== "completo" ? "" : tipoDe(producto) === "cuotas" ? "" : String(producto?.precio ?? ""));
  const simbolo = moneda === "EUR" ? "€" : "$";
  return (
    <form action={onEnviar} className="space-y-3">
      <div>
        <label className="etiqueta-campo" htmlFor="acciones-lead-producto">Producto</label>
        <Desplegable id="acciones-lead-producto"
          name="producto"
          value={productoId}
          onChange={(e) => {
            setProductoId(e.target.value);
            const p = productos.find((x) => x.id === e.target.value);
            setFacturacion(String(p?.precio ?? ""));
            const t = tipoInicial ?? tipoDe(p);
            setTipo(t);
            setCash(t === "completo" || t === "mensual" ? String(p?.precio ?? "") : "");
          }}
          className="campo"
        >
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} {p.precio ? `· ${simbolo}${p.precio}` : "· precio personalizado"}
            </option>
          ))}
        </Desplegable>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="etiqueta-campo" htmlFor="acciones-lead-facturacion-valor-del-contrato">Facturación (valor del contrato)</label>
          <input id="acciones-lead-facturacion-valor-del-contrato"
            name="facturacion"
            inputMode="decimal"
            required
            value={facturacion}
            onChange={(e) => {
              setFacturacion(e.target.value);
              if (tipo === "completo") setCash(e.target.value);
            }}
            className="campo"
          />
        </div>
        <div>
          <label className="etiqueta-campo" htmlFor="acciones-lead-tipo-de-pago">Tipo de pago</label>
          <Pastillas id="acciones-lead-tipo-de-pago"
            name="tipo_pago"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value);
              if (e.target.value === "completo" || e.target.value === "mensual") setCash(facturacion);
            }}
            className="campo"
          >
            <option value="completo">Pago completo</option>
            <option value="reserva">Reserva (seña)</option>
            <option value="cuotas">Cuotas</option>
            <option value="mensual">Cada mes (membresía)</option>
          </Pastillas>
        </div>
        <div>
          <label className="etiqueta-campo" htmlFor="acciones-lead-cash-collected-hoy">Cash collected hoy</label>
          <input id="acciones-lead-cash-collected-hoy" name="cash" inputMode="decimal" required value={cash} onChange={(e) => setCash(e.target.value)} className="campo" />
        </div>
        {tipo === "cuotas" ? (
          <label className="block"><span className="etiqueta-campo">Número de cuotas</span><input name="num_cuotas" type="number" min={2} key={productoId} defaultValue={producto?.num_cuotas ?? 3} className="campo" /></label>
        ) : (
          <div>
            <label className="etiqueta-campo" htmlFor="acciones-lead-metodo">Método</label>
            <Pastillas id="acciones-lead-metodo" name="metodo" className="campo">
              <option value="stripe">Stripe</option>
              <option value="transferencia">Transferencia</option>
              <option value="otro">Otro</option>
            </Pastillas>
          </div>
        )}
        {tipo === "cuotas" && (
          <div>
            <label className="etiqueta-campo" htmlFor="acciones-lead-metodo-2">Método</label>
            <Pastillas id="acciones-lead-metodo-2" name="metodo" className="campo">
              <option value="stripe">Stripe</option>
              <option value="transferencia">Transferencia</option>
              <option value="otro">Otro</option>
            </Pastillas>
          </div>
        )}
        <label className="block"><span className="etiqueta-campo">Fecha de la venta</span><input name="fecha" type="date" className="campo" /></label>
      </div>
      {vendedores && vendedores.length > 0 && (
        <div>
          <label className="etiqueta-campo" htmlFor="acciones-lead-vendedor-si-no-eres-tu">Vendedor</label>
          {/* Con cita, por defecto el closer de la cita (lo decide también el servidor si no se elige nada) */}
          <Desplegable id="acciones-lead-vendedor-si-no-eres-tu" name="vendedor" defaultValue="" className="campo">
            <option value="">{closerCita ? `${closerCita.nombre} (closer de la cita)` : "Yo"}</option>
            {closerCita && miId && <option value={miId}>Yo</option>}
            {vendedores.filter((v) => v.id !== closerCita?.id).map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </Desplegable>
        </div>
      )}
      <label className="block"><span className="etiqueta-campo">Nota</span><textarea name="nota" rows={2} className="campo" /></label>
      {desdeCita && (
        <>
          <input type="hidden" name="desde_cita" value="1" />
          <SelectorEstrellas quien="closer" />
        </>
      )}
      <button className="btn-primario w-full">Guardar venta</button>
    </form>
  );
}
