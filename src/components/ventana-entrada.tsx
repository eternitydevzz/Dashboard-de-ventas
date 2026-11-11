"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bell, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { PortadaMarca } from "@/components/portada-marca";
import { FIN_BIENVENIDA } from "@/components/bienvenida";
import { esError } from "@/lib/resultado";
import { mensajesAlEntrar, reporteAlEntrar } from "@/app/(panel)/avisos-acciones";
import type { AvisoCeo } from "@/lib/avisos-ceo";
import type { ClaveMensaje, NumerosCaller, NumerosCloser } from "@/lib/mensajes-entrada";
import type { Rol } from "@/lib/tipos";

// Ventana al entrar (Cristian, 11 nov 2026; maqueta docs/maqueta-bienvenida.html). Sale cuando se quita la bienvenida.
// Callers y closers: sus mensajes (motivación, grabar, felicitaciones) y sus números. CEO: el reporte de ayer (antes
// components/reporte-dia.tsx) y sus avisos. Director: nada. Portada: la M de Maestria sobre azul (Cristian: sin fotos de IA).
type Etiqueta = "MOTIVACIÓN" | "RECUERDA" | "¡FELICIDADES!" | "AYER";
type Tarjeta = { etiqueta: Etiqueta; titulo: string; texto: string };

// Textos de Cristian (11 nov), en «tú»; los de los hitos que no escribió él son de Claude (revisados en la maqueta)
const TEXTOS: Record<ClaveMensaje, (n: string) => Tarjeta> = {
  motivacion: (n) => ({ etiqueta: "MOTIVACIÓN", titulo: `Buenos días, ${n}`, texto: "Hoy estás un paso más cerca de cumplir tus objetivos. Recuerda: si lo puedes soñar, lo puedes lograr. ¡Dios te bendiga hoy!" }),
  grabacion: () => ({ etiqueta: "RECUERDA", titulo: "Graba tus llamadas", texto: "Recuerda grabar tus llamadas para que podamos estudiarlas en equipo y seguir mejorando día a día." }),
  ll100: (n) => ({ etiqueta: "¡FELICIDADES!", titulo: "¡100 llamadas hoy!", texto: `Vas a un ritmo increíble, ${n}. Cada llamada te acerca a la siguiente agenda. ¡Sigue así!` }),
  ll150: (n) => ({ etiqueta: "¡FELICIDADES!", titulo: "¡150 llamadas hoy!", texto: `Eres un ejemplo para todo el equipo, ${n}. Gracias por tu esfuerzo de hoy.` }),
  ag1: () => ({ etiqueta: "¡FELICIDADES!", titulo: "¡Tu primera agenda de la semana!", texto: "Así se empieza. Vamos a por la siguiente." }),
  ag3: (n) => ({ etiqueta: "¡FELICIDADES!", titulo: "¡3 agendas esta semana!", texto: `Vas por muy buen camino, ${n}. El equipo lo nota.` }),
  ag5: () => ({ etiqueta: "¡FELICIDADES!", titulo: "¡5 agendas esta semana!", texto: "Felicidades por tus 5 agendas de la semana. El equipo está muy contento con tu trabajo." }),
  venta_agenda: () => ({ etiqueta: "¡FELICIDADES!", titulo: "¡Venta cerrada!", texto: "Se acaba de cerrar una venta que agendaste tú. El equipo está muy contento con tu trabajo." }),
  cag3: (n) => ({ etiqueta: "¡FELICIDADES!", titulo: "¡3 agendas esta semana!", texto: `Prepárate bien, ${n}: cada llamada es una oportunidad de cerrar.` }),
  cag10: (n) => ({ etiqueta: "¡FELICIDADES!", titulo: "¡10 agendas esta semana!", texto: `Tu agenda está llena, ${n}. El equipo confía en ti.` }),
  v1: () => ({ etiqueta: "¡FELICIDADES!", titulo: "¡Nueva venta!", texto: "¡Felicidades por tu nueva venta! El equipo está muy contento con tu trabajo." }),
  v3: (n) => ({ etiqueta: "¡FELICIDADES!", titulo: "¡3 ventas este mes!", texto: `Estás imparable, ${n}. ¡Enhorabuena!` }),
  v5: (n) => ({ etiqueta: "¡FELICIDADES!", titulo: "¡5 ventas este mes!", texto: `Eres de los mejores del equipo, ${n}. ¡Enhorabuena!` }),
};
const COLOR_ETIQUETA: Record<Etiqueta, string> = {
  "MOTIVACIÓN": "bg-ok-suave text-ok-texto",
  RECUERDA: "bg-aviso-suave text-aviso-texto",
  "¡FELICIDADES!": "bg-primario-suave text-primario",
  AYER: "bg-primario-suave text-primario",
};

type Contenido = { tarjetas: Tarjeta[]; titulo: string; filas: { texto: string; detalle: string; rojo?: boolean }[] };

function deMensajes(nombre: string, r: { rol: Rol; mensajes: ClaveMensaje[]; numeros: NumerosCaller | NumerosCloser }): Contenido {
  const tarjetas = r.mensajes.map((k) => TEXTOS[k](nombre));
  const n = r.numeros;
  const filas = "llamadasHoy" in n
    ? [{ texto: `${n.llamadasHoy} llamadas hoy`, detalle: n.llamadasHoy < 50 ? `Te faltan ${50 - n.llamadasHoy} para las 50` : "Objetivo de 50 cumplido" }, { texto: `${n.agendasSemana} agendas esta semana`, detalle: "Mis leads" }]
    : [{ texto: `${n.agendasSemana} llamadas esta semana`, detalle: "Mis agendas" }, { texto: `${n.ventasMes} ventas este mes`, detalle: "Mis ventas" }];
  return { tarjetas, titulo: "TUS NÚMEROS", filas };
}

function delReporte(r: { dia: string; leads: number; agendas: number }, avisos: AvisoCeo[]): Contenido {
  const [a, m, d] = r.dia.split("-");
  return {
    tarjetas: [{ etiqueta: "AYER", titulo: `Ayer, ${d}/${m}/${a}`, texto: `Entraron ${r.leads} leads y se agendaron ${r.agendas} citas.` }],
    titulo: "AVISOS",
    filas: avisos.length ? avisos.map((x) => ({ texto: x.texto, detalle: "Administración", rojo: true })) : [{ texto: "Sin avisos pendientes", detalle: "Todo en orden" }],
  };
}

export function VentanaEntrada({ rol, nombre, avisos = [] }: { rol: Rol; nombre: string; avisos?: AvisoCeo[] }) {
  const [contenido, setContenido] = useState<Contenido | null>(null);
  const [lista, setLista] = useState(false); // la bienvenida ya se quitó
  const [i, setI] = useState(0);
  const pedido = useRef(false);

  useEffect(() => {
    const fin = () => setLista(true);
    window.addEventListener(FIN_BIENVENIDA, fin);
    const tope = setTimeout(fin, 5000); // por si la bienvenida no avisa (como mucho dura 4 s)
    if (!pedido.current && rol !== "director") {
      pedido.current = true;
      if (rol === "ceo") reporteAlEntrar().then((r) => r && !esError(r) && setContenido(delReporte(r, avisos)));
      else mensajesAlEntrar().then((r) => r && !esError(r) && setContenido(deMensajes(nombre, r)));
    }
    return () => {
      window.removeEventListener(FIN_BIENVENIDA, fin);
      clearTimeout(tope);
    };
  }, [rol, nombre, avisos]);

  if (!contenido || !lista) return null;
  const cerrar = () => setContenido(null);
  const t = contenido.tarjetas[i] ?? contenido.tarjetas[0];
  const varias = contenido.tarjetas.length > 1;
  const pendientes = contenido.tarjetas.length + contenido.filas.filter((f) => f.rojo).length;

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
      <div className="grid gap-5 overflow-y-auto px-6 py-3 md:grid-cols-[1.1fr_1fr]">
        <section className="flex flex-col overflow-hidden rounded-2xl border border-borde" aria-live="polite" aria-label="Mensajes para ti">
          <PortadaMarca className="aspect-video" />
          <div className="p-4">
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wider ${COLOR_ETIQUETA[t.etiqueta]}`}>● {t.etiqueta}</span>
            <h3 className="mt-2 text-lg font-semibold">{t.titulo}</h3>
            <p className="mt-1 text-texto-2">{t.texto}</p>
          </div>
          {varias && (
            <div className="mt-auto flex items-center justify-end gap-2 px-4 pb-3 text-sm text-texto-3">
              <button className="btn p-1.5" aria-label="Anterior" onClick={() => setI((i - 1 + contenido.tarjetas.length) % contenido.tarjetas.length)}><ChevronLeft className="h-4 w-4" /></button>
              <span>{i + 1} / {contenido.tarjetas.length}</span>
              <button className="btn p-1.5" aria-label="Siguiente" onClick={() => setI((i + 1) % contenido.tarjetas.length)}><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
        </section>
        <section aria-label={contenido.titulo}>
          <div className="mb-2 text-[11px] font-bold tracking-[0.08em] text-texto-3">{contenido.titulo}</div>
          <ul className="space-y-2">
            {contenido.filas.map((f) => (
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
      </div>
      <div className="flex justify-end border-t border-borde px-6 py-3">
        <button onClick={cerrar} className="btn btn-primario inline-flex items-center gap-2">Entrar <ArrowRight className="h-4 w-4" /></button>
      </div>
    </Modal>
  );
}
