"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { PortadaMarca } from "@/components/portada-marca";
import { FIN_BIENVENIDA } from "@/components/bienvenida";
import { esError } from "@/lib/resultado";
import { marcarVistos, mensajesAlEntrar, popupsParaMi, reporteAlEntrar } from "@/app/(panel)/avisos-acciones";
import { CLAVE_SESION, quitarVistosEnSesion, type TarjetaPopup } from "@/lib/popups";
import type { AvisoCeo } from "@/lib/avisos-ceo";
import type { ClaveMensaje, NumerosCaller, NumerosCloser, TextoEntrada } from "@/lib/mensajes-entrada";
import type { Rol } from "@/lib/tipos";

// Ventana al entrar (Cristian, 11 nov 2026; maqueta docs/maqueta-bienvenida.html). Sale cuando se quita la bienvenida.
// Callers y closers: sus mensajes (motivación, grabar, felicitaciones) y sus números. CEO: el reporte de ayer
// y sus avisos. Portada: la M de Maestria sobre azul (Cristian: sin fotos de IA).
// Fase 3 (13 nov): también los popups de Administración y los avisos de cada persona, para todos los roles (también
// el director); sus textos se cambian en Administración → Popups. Con la app abierta, mira cada 60 s si hay algo nuevo.
type Etiqueta = "MOTIVACIÓN" | "RECUERDA" | "¡FELICIDADES!" | "AYER" | "AVISO";
type Tarjeta = TextoEntrada & { etiqueta: Etiqueta; imagen?: string | null; boton?: TarjetaPopup["boton"] };

const etiquetaDe = (k: ClaveMensaje): Etiqueta => (k === "motivacion" ? "MOTIVACIÓN" : k === "grabacion" ? "RECUERDA" : "¡FELICIDADES!");
const COLOR_ETIQUETA: Record<Etiqueta, string> = {
  "MOTIVACIÓN": "bg-ok-suave text-ok-texto",
  RECUERDA: "bg-aviso-suave text-aviso-texto",
  "¡FELICIDADES!": "bg-primario-suave text-primario",
  AYER: "bg-primario-suave text-primario",
  AVISO: "bg-primario-suave text-primario",
};
const CADA_MS = 60_000;

type Contenido = { tarjetas: Tarjeta[]; titulo: string; filas: { texto: string; detalle: string; rojo?: boolean }[] };

function deMensajes(r: { mensajes: ClaveMensaje[]; textos: TextoEntrada[]; numeros: NumerosCaller | NumerosCloser }): Contenido {
  const tarjetas = r.mensajes.map((k, i) => ({ etiqueta: etiquetaDe(k), ...r.textos[i] }));
  const n = r.numeros;
  const filas = "llamadasHoy" in n
    ? [{ texto: `${n.llamadasHoy} llamadas hoy`, detalle: n.llamadasHoy < 50 ? `Te faltan ${50 - n.llamadasHoy} para las 50` : "Objetivo de 50 cumplido" }, { texto: `${n.agendasSemana} agendas esta semana`, detalle: "Mis leads" }]
    : [{ texto: `${n.agendasSemana} llamadas esta semana`, detalle: "Mis agendas" }, { texto: `${n.ventasMes} ventas este mes`, detalle: "Mis ventas" }];
  return { tarjetas, titulo: "TUS NÚMEROS", filas };
}

function delReporte(r: TextoEntrada, avisos: AvisoCeo[]): Contenido {
  return {
    tarjetas: [{ etiqueta: "AYER", titulo: r.titulo, texto: r.texto }],
    titulo: "AVISOS",
    filas: avisos.length ? avisos.map((x) => ({ texto: x.texto, detalle: "Administración", rojo: true })) : [{ texto: "Sin avisos pendientes", detalle: "Todo en orden" }],
  };
}

const deSesion = (k: string) => {
  try {
    return sessionStorage.getItem(k) !== null;
  } catch {
    return false;
  }
};

export function VentanaEntrada({ rol, nombre, avisos = [] }: { rol: Rol; nombre: string; avisos?: AvisoCeo[] }) {
  const [contenido, setContenido] = useState<Contenido | null>(null);
  const [extras, setExtras] = useState<TarjetaPopup[]>([]); // popups y avisos por enseñar
  const [lista, setLista] = useState(false); // la bienvenida ya se quitó
  const [i, setI] = useState(0);
  const [rotas, setRotas] = useState<string[]>([]); // imágenes que no cargan: sale la portada
  const pedido = useRef(false);
  const yaSalieron = useRef(new Set<string>()); // en esta pestaña no se repiten aunque marcarVistos tarde

  // Añade los popups que no han salido ya (ni, si son «por sesión», en esta pestaña)
  const anadir = (r: TarjetaPopup[] | { error: string }) => {
    if (!Array.isArray(r)) return; // { error }: no se enseña nada
    const nuevos = quitarVistosEnSesion(r, deSesion).filter((t) => !yaSalieron.current.has(t.id));
    if (!nuevos.length) return;
    nuevos.forEach((t) => yaSalieron.current.add(t.id));
    setExtras((e) => [...e, ...nuevos]);
  };

  useEffect(() => {
    const fin = () => setLista(true);
    window.addEventListener(FIN_BIENVENIDA, fin);
    const tope = setTimeout(fin, 5000); // por si la bienvenida no avisa (como mucho dura 4 s)
    if (!pedido.current) {
      pedido.current = true;
      if (rol === "ceo") reporteAlEntrar().then((r) => r && !esError(r) && setContenido(delReporte(r, avisos)));
      else if (rol !== "director") mensajesAlEntrar().then((r) => r && !esError(r) && setContenido(deMensajes(r)));
      popupsParaMi(false).then(anadir, () => {});
    }
    return () => {
      window.removeEventListener(FIN_BIENVENIDA, fin);
      clearTimeout(tope);
    };
  }, [rol, nombre, avisos]);

  // Una consulta ligera por minuto, solo con la pestaña a la vista (oculta, no pide nada)
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") popupsParaMi(true).then(anadir, () => {});
    }, CADA_MS);
    return () => clearInterval(t);
  }, []);

  const tarjetas: Tarjeta[] = [
    ...extras.map((x): Tarjeta => ({ etiqueta: "AVISO", titulo: x.titulo, texto: x.texto, imagen: x.imagen, boton: x.boton })),
    ...(contenido?.tarjetas ?? []),
  ];
  if (!tarjetas.length || !lista) return null;
  const filas = contenido?.filas ?? [];
  const cerrar = () => {
    const vistos = extras;
    setContenido(null);
    setExtras([]);
    setI(0);
    for (const x of vistos) {
      if (x.frecuencia !== "sesion") continue;
      try {
        sessionStorage.setItem(CLAVE_SESION(x.id), "1");
      } catch {
        // sin sessionStorage: puede volver a salir en esta sesión
      }
    }
    const de = (o: TarjetaPopup["origen"]) => vistos.filter((x) => x.origen === o).map((x) => x.id);
    if (vistos.length) void marcarVistos(de("popup"), de("aviso")).catch(() => {});
  };
  const t = tarjetas[i] ?? tarjetas[0];
  const varias = tarjetas.length > 1;
  const pendientes = tarjetas.length + filas.filter((f) => f.rojo).length;
  const imagen = t.imagen && !rotas.includes(t.imagen) ? t.imagen : null;

  return (
    <Modal
      titulo={`Bienvenido ${nombre}`}
      onCerrar={cerrar}
      claseVentana="ventana-entrada flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden p-0 entra-seccion"
      cabecera={
        <div className="flex items-start justify-between px-6 pb-2 pt-5">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Bienvenido <span className="text-primario">{nombre}</span></h2>
            <p className="mt-1 text-sm text-texto-2">
              Tienes <span className="rounded-full bg-primario px-2 text-xs font-bold text-white">{pendientes}</span> {pendientes === 1 ? "mensaje nuevo" : "mensajes nuevos"}
            </p>
          </div>
          <button onClick={cerrar} className="rounded-md p-1 text-texto-3 hover:bg-panel-2" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>
      }
    >
      <div className={`grid gap-5 overflow-y-auto px-6 py-3 ${filas.length ? "md:grid-cols-[1.1fr_1fr]" : ""}`}>
        <section className="flex flex-col overflow-hidden rounded-2xl border border-borde" aria-live="polite" aria-label="Mensajes para ti">
          {imagen ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen de fuera (https) que pone Administración
            <img src={imagen} alt="" className="aspect-video w-full object-cover" onError={() => setRotas((r) => [...r, imagen])} />
          ) : (
            <PortadaMarca className="aspect-video" />
          )}
          <div className="p-4">
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wider ${COLOR_ETIQUETA[t.etiqueta]}`}>● {t.etiqueta}</span>
            <h3 className="mt-2 text-lg font-semibold">{t.titulo}</h3>
            <p className="mt-1 whitespace-pre-line text-texto-2">{t.texto}</p>
            {t.boton &&
              (t.boton.enlace.startsWith("/") ? (
                <Link href={t.boton.enlace} onClick={cerrar} className="btn btn-secundario mt-3 inline-flex items-center gap-2">{t.boton.texto} <ArrowRight className="h-4 w-4" /></Link>
              ) : (
                <a href={t.boton.enlace} target="_blank" rel="noopener noreferrer" className="btn btn-secundario mt-3 inline-flex items-center gap-2">{t.boton.texto} <ArrowRight className="h-4 w-4" /></a>
              ))}
          </div>
          {varias && (
            <div className="mt-auto flex items-center justify-end gap-2 px-4 pb-3 text-sm text-texto-3">
              <button className="btn p-1.5" aria-label="Anterior" onClick={() => setI((i - 1 + tarjetas.length) % tarjetas.length)}><ChevronLeft className="h-4 w-4" /></button>
              <span>{Math.min(i, tarjetas.length - 1) + 1} / {tarjetas.length}</span>
              <button className="btn p-1.5" aria-label="Siguiente" onClick={() => setI((i + 1) % tarjetas.length)}><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
        </section>
        {contenido && filas.length > 0 && (
        <section aria-label={contenido.titulo}>
          <div className="mb-2 text-[11px] font-bold tracking-[0.08em] text-texto-3">{contenido.titulo}</div>
          <ul className="space-y-2">
            {filas.map((f) => (
              <li key={f.texto} className="flex items-center gap-3 rounded-xl border border-borde p-3">
                <span className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${f.rojo ? "bg-mal-suave text-mal" : "bg-primario-suave text-primario"}`}><Bell className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <div className="font-medium">{f.texto}</div>
                  <div className="text-sm text-texto-3">{f.detalle}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
        )}
      </div>
      <div className="flex justify-end border-t border-borde px-6 py-3">
        <button onClick={cerrar} className="btn btn-primario inline-flex items-center gap-2">Entrar <ArrowRight className="h-4 w-4" /></button>
      </div>
    </Modal>
  );
}
