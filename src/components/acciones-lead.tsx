"use client";

import { startTransition, useState, useTransition, type ReactNode } from "react";
import { Clock, MessageCircle, ShoppingCart, StickyNote, ScrollText, Check, Link2, FolderOpen, CircleX, Repeat, CalendarDays, CalendarCheck, Ban, type LucideIcon } from "lucide-react";
import { anadirNota, borrarNotaReciente, confirmarAgenda, deshacerResultado, registrarLlamada, registrarVenta, type PasoResultado, type ResultadoSimple } from "@/app/(panel)/leads/acciones";
import { BOTONES_RESULTADO, ESTADOS_CALLER, colorEstado, etiquetaEstado } from "@/lib/estados-caller";
import { CON_VENTANA, VentanaEstado, type DestinoConVentana } from "@/app/(panel)/crm/ventanas-estado";
import { Modal } from "@/components/modal";
import { SelectorEstrellas } from "@/components/estrellas";
import { useQuitarToast, useToast } from "@/components/toasts";
import { avisoDe, exigirOk } from "@/lib/resultado-cliente";
import type { Lead, Producto, Respuesta } from "@/lib/tipos";
import { Desplegable, Pastillas } from "@/components/eleccion";
import { GuionLlamada } from "@/components/guion-llamada";
import { BotonGrabar, useGrabadora } from "@/components/grabadora";
import type { Guion } from "@/lib/guiones";

type Persona = { id: string; nombre: string; moneda?: string }; // moneda: la de su mercado (€ si es de España)

// Moneda (Cristian, 14 nov): cada venta en la de quien la vende, mire quien mire. Sin vendedor elegido («Yo») o sin
// su moneda, la de quien registra.
export function simboloVenta(miMoneda: string, vendedor?: Persona) {
  return (vendedor?.moneda ?? miMoneda) === "EUR" ? "€" : "$";
}


// Ejecuta una acción del servidor: muestra «guardado» en un aviso flotante
// y, si falla, el error en el aviso y también junto al botón.
// F1b: `deshacer(r)` devuelve cómo deshacerlo (con lo que contestó el servidor) → botón «Deshacer» y Ctrl+Z
export type DeshacerDe = (r: unknown) => (() => unknown) | undefined;
export function useAccion() {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState("");
  const toast = useToast();
  function ejecutar(fn: () => Promise<unknown>, mensaje?: string, deshacer?: DeshacerDe) {
    setError("");
    iniciar(async () => {
      try {
        const r = await exigirOk(fn());
        const atras = deshacer?.(r);
        if (mensaje) toast(mensaje, "ok", atras ? { deshacer: { texto: mensaje, deshacer: atras } } : undefined);
        const aviso = avisoDe(r);
        if (aviso) toast(aviso, "error");
      } catch (e) {
        const texto = e instanceof Error ? e.message : "Algo falló.";
        setError(texto);
        toast(texto, "error");
      }
    });
  }
  return { pendiente, error, ok: "", ejecutar };
}

// Una acción por clave a la vez: un doble clic durante el guardado no lanza otra. Con `guardando`, avisa al momento
// («Guardando…», Cristian 14 nov: la respuesta tardaba y no se veía nada) y el mensaje final sale al terminar.
export function crearUnaVez(enCurso: Set<string>, ejecutar: (fn: () => Promise<unknown>, mensaje?: string, deshacer?: DeshacerDe) => void, avisar: (texto: string) => void) {
  return (clave: string, fn: () => Promise<unknown>, mensaje: string, guardando = false, deshacer?: DeshacerDe) => {
    if (enCurso.has(clave)) return;
    enCurso.add(clave);
    if (guardando) avisar("Guardando…");
    ejecutar(() => fn().finally(() => enCurso.delete(clave)), mensaje, deshacer);
  };
}

export function Mensajes({ error, ok }: { error: string; ok: string }) {
  return (
    <>
      {error && <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{error}</p>}
      {ok && <p className="flex items-center gap-1.5 rounded-lg bg-ok-suave px-3 py-2 text-sm text-ok"><Check className="h-4 w-4" />{ok}</p>}
    </>
  );
}

// El botón de «Link enviado» se llama «Link de agenda» (Cristian, 10 nov); el resto, como su columna
const textoBoton = (k: string) => (k === "link_enviado" ? "Link de agenda" : etiquetaEstado(k));

// C11 (plan Callers, 7 nov): iconos de los resultados (los de la maqueta, lucide). N1: sin «No responde»
const ICONO_RESULTADO: Record<string, LucideIcon> = {
  link_enviado: Link2, // 10 nov: «Link de agenda» en el sitio de «Llamado»
  wsp_enviado: MessageCircle,
  no_interesa: CircleX,
  seguimiento: Repeat,
  llamar_luego: Clock,
  agendado: CalendarDays,
  confirma_agenda: CalendarCheck,
  descartado: Ban,
};
const BOTONES = BOTONES_RESULTADO.filter((k) => ICONO_RESULTADO[k]); // solo los que tienen icono (N1: sin «No responde»)

// Botones del lead (cola, guion y ficha completa). C11: los 9 resultados mueven el lead a su columna de «Callers»;
// los que piden datos (estrellas, fecha) abren su ventana, la misma que al soltar en el CRM.
// C5 (maqueta, 7c.1): `variante="cola"` = cabecera azul con Guion · Grabar · Wsp · Copiar link agenda · Recursos · Nota
// y la tarjeta «¿Cómo ha ido?» con 9 baldosas y «Mover a». En la ficha completa del lead, como siempre.
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
  variante = "ficha",
  cabecera,
  respuestas,
  guionAbierto,
  onGuionAbierto,
  onSiguiente,
  puedeGrabar = false,
  onCambio,
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
  variante?: "ficha" | "cola";
  cabecera?: ReactNode; // cola: los datos del lead, dentro de la cabecera azul
  respuestas?: Respuesta[]; // pestaña «Form» del guion
  guionAbierto?: boolean; // cola: quién abre el guion lo decide la cola («Siguiente» lo abre en el siguiente)
  onGuionAbierto?: (abierto: boolean) => void;
  onSiguiente?: () => void;
  puedeGrabar?: boolean; // C10: con la sección «Grabaciones», «Grabar» en la cabecera del lead y en el guion
  onCambio?: (c: Partial<Pick<Lead, "estado_caller" | "llamar_en">>) => void; // cola: mueve el lead en pantalla al momento
}) {
  const grabadora = useGrabadora();
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
  // Doble clic = dos guardados (historial y KPIs repetidos; dos ventas): los botones del guion no se desactivan y la
  // ventana de venta no se cierra hasta que responde el servidor. Mientras una va, la segunda igual no sale.
  const [enCurso] = useState(() => new Set<string>()); // el mismo Set en cada pintado
  const unaVez = crearUnaVez(enCurso, ejecutar, aviso);
  const [modal, setModal] = useState<null | "guion" | "nota">(null);
  const [ventana, setVentana] = useState<DestinoConVentana | null>(null);
  const [nota, setNota] = useState("");
  const telLimpio = (telefono ?? "").replace(/[^\d]/g, "");
  const productosVisibles = productos; // N1 (Cristian, 16 nov): el caller también registra ventas
  const [ventaAbierta, setVentaAbierta] = useState(false); // aparte del guion: «Venta» se abre encima de él
  const quitarAviso = useQuitarToast();
  const [, iniciarResultado] = useTransition();

  // C1/R2/C13: el lead cambia en pantalla al pulsar (onCambio, dentro de la transición: si falla, vuelve solo), los
  // botones no se bloquean, «Guardando…» se quita al responder (C5, C14) y el aviso final trae «Deshacer» (y Ctrl+Z)
  // Devuelve si salió bien (la ventana de resultado se cierra solo entonces)
  function guardarResultado(clave: string, accion: () => Promise<unknown>, mensaje: string): Promise<boolean> {
    if (enCurso.has(`resultado:${clave}`)) return Promise.resolve(false); // doble clic en el mismo botón = un guardado
    enCurso.add(`resultado:${clave}`);
    const espera = aviso("Guardando…", "cargando");
    return new Promise((listo) => iniciarResultado(async () => {
      onCambio?.({ estado_caller: clave as Lead["estado_caller"] });
      try {
        const r = await exigirOk(accion());
        const paso = (r as { deshacer?: PasoResultado } | undefined)?.deshacer;
        aviso(mensaje, "ok", paso ? { deshacer: { texto: mensaje, deshacer: () => deshacer(paso) } } : undefined);
        const a = avisoDe(r);
        if (a) aviso(a, "error");
        listo(true);
      } catch (e) {
        aviso(e instanceof Error ? e.message : "Algo falló.", "error");
        listo(false);
      } finally {
        quitarAviso(espera);
        enCurso.delete(`resultado:${clave}`);
      }
    }));
  }
  // A3b-01: vuelve exactamente a como estaba (también la columna de la cola, al momento)
  function deshacer(paso: PasoResultado) {
    const espera = aviso("Deshaciendo…", "cargando");
    startTransition(async () => {
      onCambio?.({ estado_caller: paso.antes.estado_caller as Lead["estado_caller"], llamar_en: paso.antes.llamar_en });
      try {
        await exigirOk(deshacerResultado(paso));
        aviso("Deshecho");
      } catch (e) {
        aviso(e instanceof Error ? e.message : "No se pudo deshacer.", "error");
      } finally {
        quitarAviso(espera);
      }
    });
  }
  const nombre = nombreLead || "este lead";
  const controlado = guionAbierto !== undefined;
  const verGuion = controlado ? guionAbierto : modal === "guion";
  const abrirGuion = (b: boolean) => (controlado ? onGuionAbierto?.(b) : setModal(b ? "guion" : null));

  function resultado(clave: string, desdeMoverA = false) {
    grabadora?.avisarFin(); // 13 nov: un resultado = fin de la llamada (la app no ve cuándo se cuelga el móvil)
    if (CON_VENTANA.includes(clave)) return setVentana(clave as DestinoConVentana);
    // «Link de agenda» (Cristian, 10 nov): copia el link de GHL y lo apunta (lead a «Link enviado», cuenta como llamada)
    if (clave === "link_enviado" && !desdeMoverA) {
      if (!linkAgenda) return aviso("Este proyecto no tiene link de agenda: ponlo en Administración.", "error");
      void copiarLinkAgenda();
      return guardarResultado("link_enviado", () => registrarLlamada(leadId, "link_enviado", ""), "Link de agenda copiado y apuntado");
    }
    // Cristian, 14 nov: en la cola, «Guardando…» al pulsar y «✓ Llamada registrada» al terminar
    const final = (m: string) => (variante === "cola" ? "✓ Llamada registrada" : m);
    if (clave === "confirma_agenda") return guardarResultado(clave, () => confirmarAgenda(leadId), final("Guardado: Confirma Agenda (cita confirmada)"));
    guardarResultado(clave, () => registrarLlamada(leadId, clave as ResultadoSimple, ""), final(`Guardado: ${etiquetaEstado(clave)}`));
  }

  const ventanas = (
    <>
      {verGuion && guion && (
        <GuionLlamada
          leadId={leadId}
          nombreLead={nombre}
          telefono={telefono}
          miNombre={miNombre}
          guion={guion}
          respuestas={respuestas}
          actual={estado}
          grabador={puedeGrabar ? <BotonGrabar leadId={leadId} nombre={nombre} /> : undefined}
          resultados={BOTONES.map((k) => {
            const Icono = ICONO_RESULTADO[k];
            return { clave: k, texto: textoBoton(k), icono: <Icono className="h-4 w-4 shrink-0" style={{ color: colorEstado(k) }} /> };
          })}
          onResultado={resultado}
          onVenta={productosVisibles.length ? () => setVentaAbierta(true) : undefined}
          onSiguiente={onSiguiente && (() => { grabadora?.avisarFin(); onSiguiente(); })}
          onCerrar={() => abrirGuion(false)}
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
          onGuardar={(accion, mensaje) => guardarResultado(ventana, accion, mensaje)}
        />
      )}
      {ventaAbierta && (
        <Modal titulo="Registrar venta" onCerrar={() => setVentaAbierta(false)} ancho="max-w-lg">
          <FormVenta
            productos={productosVisibles}
            vendedores={vendedores}
            closerCita={closerCita}
            miId={miId}
            moneda={moneda}
            // S4-9: se cierra solo si se guardó (antes se cerraba al momento y con un error se perdía lo escrito)
            onEnviar={(fd) => unaVez("venta", () => exigirOk(registrarVenta(leadId, fd)).then(() => setVentaAbierta(false)), "Venta registrada")}
          />
        </Modal>
      )}
      {modal === "nota" && (
        <Modal titulo="Añadir nota" onCerrar={() => setModal(null)}>
          <div className="space-y-3">
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={4} className="campo" placeholder="Escribe la nota…" />
            {/* 13 nov: se borra y se cierra solo si se guardó (antes se perdía aunque fallara) */}
            <button
              className="btn-primario w-full"
              disabled={pendiente}
              onClick={() =>
                // F1b: Deshacer = borrar esa nota (el servidor solo deja la mía, reciente y del proyecto)
                unaVez("nota", () => exigirOk(anadirNota(leadId, nota)).then((r) => { setNota(""); setModal(null); return r; }), "Nota guardada", false, (r) => {
                  const id = (r as { id?: string } | undefined)?.id;
                  return id ? () => ejecutar(() => borrarNotaReciente(id), "Nota borrada") : undefined;
                })
              }
            >
              Guardar nota
            </button>
          </div>
        </Modal>
      )}
    </>
  );

  if (variante === "cola") {
    const bv = "inline-flex items-center gap-1.5 rounded-[10px] border border-white/30 bg-white/15 px-2.5 py-1.5 text-[12.5px] font-bold text-white transition hover:bg-white/25 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-white";
    return (
      <>
        <section className="relative rounded-[18px] bg-gradient-to-br from-primario-boton to-cola-degradado px-4 pb-3 pt-3.5 text-white shadow-[0_10px_30px_-16px_rgb(43_89_209/0.6)] sm:px-[18px]" aria-label="Lead elegido">
          {cabecera}
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/20 pt-3" role="toolbar" aria-label="Herramientas">
            {guion && (
              <button type="button" className={`${bv} !border-white !bg-white !text-primario-boton`} onClick={() => abrirGuion(true)}>
                <ScrollText className="h-4 w-4" /> Guion
              </button>
            )}
            {/* C10 (7c.3): «Grabar» abre el guion y empieza a grabar */}
            {puedeGrabar && grabadora && (
              <button type="button" className={`${bv} !border-white !bg-white !text-[#b4202f]`} disabled={grabadora.grabando?.leadId === leadId} onClick={() => { abrirGuion(true); void grabadora.empezar(leadId, nombre); }}>
                <span className="h-2.5 w-2.5 rounded-full bg-mal" /> {grabadora.grabando?.leadId === leadId ? "Grabando…" : "Grabar"}
              </button>
            )}
            {/* F9 (plan Callers): abrir WhatsApp ya no apunta nada; lo apunta el resultado «Wsp enviado» */}
            {telLimpio && <a href={`https://wa.me/${telLimpio}`} target="_blank" rel="noreferrer" className={bv} aria-label="WhatsApp"><MessageCircle className="h-4 w-4" /> Wsp</a>}
            {linkAgenda && <button type="button" className={bv} onClick={() => void copiarLinkAgenda()}><Link2 className="h-4 w-4" /> Copiar link agenda</button>}
            <a href="/recursos" target="_blank" rel="noreferrer" className={bv}><FolderOpen className="h-4 w-4" /> Recursos</a>
            {/* Cristian (7 nov, tras verlo en la app): sin «Nota» ni «Venta» en la cabecera de la cola */}
          </div>
        </section>

        <section className="tarjeta px-4 py-4 sm:px-5">
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
            <div>
              <h3 className="text-[15px] font-semibold">¿Cómo ha ido?</h3>
              <span className="text-xs text-texto-3">Un clic = mueve el lead a esa columna</span>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] font-semibold text-texto-2">
              Mover a
              <select className="campo w-auto py-1.5" value={estado ?? ""} onChange={(e) => e.target.value && e.target.value !== estado && resultado(e.target.value, true)}>
                {/* «Cerrados» no se elige (lo pone el closer), pero un lead vendido lo enseña en vez de «Leads» (13 nov) */}
                {ESTADOS_CALLER.filter((x) => x.v !== "vendido" || estado === "vendido").map((x) => <option key={x.v} value={x.v} disabled={x.v === "vendido"}>{x.t}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {BOTONES.map((k) => {
              const Icono = ICONO_RESULTADO[k];
              const actual = estado === k;
              const c = colorEstado(k);
              return (
                <button
                  key={k}
                  type="button"
                  aria-current={actual ? "true" : undefined}
                  onClick={() => resultado(k)}
                  style={{ ["--c" as string]: c }}
                  className={`flex min-h-[60px] items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-[13.5px] font-bold transition active:scale-[0.98] ${actual ? "border-[var(--c)] bg-[color-mix(in_srgb,var(--c)_10%,var(--panel-2))] shadow-[inset_0_0_0_1px_var(--c)]" : "border-borde bg-panel-2 hover:border-[color-mix(in_srgb,var(--c)_55%,transparent)]"}`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[11px] ${actual ? "bg-[var(--c)] text-white" : "bg-[color-mix(in_srgb,var(--c)_15%,transparent)] text-[var(--c)]"}`}>
                    <Icono className="h-[18px] w-[18px]" />
                  </span>
                  {textoBoton(k)}
                </button>
              );
            })}
            {/* N1 (Cristian, 16 nov): «Venta» en verde, la última; abre «Registrar venta» */}
            {productosVisibles.length > 0 && (
              <button type="button" onClick={() => setVentaAbierta(true)} className="flex min-h-[60px] items-center gap-3 rounded-2xl border border-[#15924a] bg-[#15924a] px-3 py-2.5 text-left text-[13.5px] font-bold text-white transition hover:brightness-110 active:scale-[0.98]">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-white/20"><ShoppingCart className="h-[18px] w-[18px]" /></span>
                Venta
              </button>
            )}
          </div>
          <div className="mt-3"><Mensajes error={error} ok={ok} /></div>
        </section>
        {ventanas}
      </>
    );
  }

  const boton = "btn-secundario justify-start";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {guion && (
          <button type="button" className="btn-primario" onClick={() => abrirGuion(true)}>
            <ScrollText className="h-4 w-4" /> Guion
          </button>
        )}
        {telLimpio && (
          <a href={`https://wa.me/${telLimpio}`} target="_blank" rel="noreferrer" className={`${boton} text-ok-texto`}>
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
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-3">¿Cómo ha ido?</div>
        <div className={`grid gap-2 ${compacto ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
          {BOTONES.map((k) => {
            const Icono = ICONO_RESULTADO[k];
            const actual = estado === k;
            return (
              <button key={k} type="button" className={`${boton} ${actual ? "border-primario bg-primario-suave text-primario" : ""}`} aria-current={actual ? "true" : undefined} onClick={() => resultado(k)}>
                <Icono className="h-4 w-4" style={{ color: colorEstado(k) }} /> {textoBoton(k)}
              </button>
            );
          })}
          {productosVisibles.length > 0 && (
            <button type="button" className="btn-secundario justify-start border-[#15924a] bg-[#15924a] text-white hover:brightness-110" onClick={() => setVentaAbierta(true)}>
              <ShoppingCart className="h-4 w-4" /> Venta
            </button>
          )}
        </div>
      </div>
      <Mensajes error={error} ok={ok} />
      {ventanas}
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
  const [vendedorId, setVendedorId] = useState("");
  // "" = el closer de la cita (o «Yo» si no hay cita); miId no está en `vendedores` → mi moneda
  const simbolo = simboloVenta(moneda, vendedorId ? vendedores?.find((v) => v.id === vendedorId) : closerCita);
  // S4-9: con `action`, React vacía el formulario al enviar aunque falle; así lo escrito se queda si hay un error
  return (
    <form onSubmit={(e) => (e.preventDefault(), onEnviar(new FormData(e.currentTarget)))} className="space-y-3">
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
        {tipo === "cuotas" && (
          <label className="block"><span className="etiqueta-campo">Número de cuotas</span><input name="num_cuotas" type="number" min={2} key={productoId} defaultValue={producto?.num_cuotas ?? 3} className="campo" /></label>
        )}
        {/* S4-8: un solo «Método» fuera del condicional; si no, al pasar a cuotas se montaba otro y volvía a Stripe */}
        <div>
          <label className="etiqueta-campo" htmlFor="acciones-lead-metodo">Método</label>
          <Pastillas id="acciones-lead-metodo" name="metodo" className="campo">
            <option value="stripe">Stripe</option>
            <option value="transferencia">Transferencia</option>
            <option value="otro">Otro</option>
          </Pastillas>
        </div>
        <label className="block"><span className="etiqueta-campo">Fecha de la venta</span><input name="fecha" type="date" className="campo" /></label>
      </div>
      {vendedores && vendedores.length > 0 && (
        <div>
          <label className="etiqueta-campo" htmlFor="acciones-lead-vendedor-si-no-eres-tu">Vendedor</label>
          {/* Con cita, por defecto el closer de la cita (lo decide también el servidor si no se elige nada) */}
          <Desplegable id="acciones-lead-vendedor-si-no-eres-tu" name="vendedor" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className="campo">
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
