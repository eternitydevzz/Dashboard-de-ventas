"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RotateCw } from "lucide-react";
import { CAMPOS_FICHA, fichaAlLeer, limpiarFicha, mismaFicha, type CampoFicha, type Ficha } from "@/lib/ficha-cualificacion";
import { guardarFicha, leerFicha } from "@/app/(panel)/caller/ficha-acciones";

// C6 (plan Callers, 7 nov; 7c.2): la ficha se guarda SIEMPRE, sin botón «Guardar»:
// 1) unos segundos después de dejar de escribir; 2) antes de cualquier botón del guion (si falla, el botón no sigue y
// sale «Reintentar»); 3) al cerrar el guion; 4) al salir de la página o cerrar la pestaña (sendBeacon a
// /api/cualificacion). Mientras no está en la base, hay una copia en este navegador (localStorage), por lead.
const ESPERA = 1500;
const clave = (leadId: string) => `ficha-cualificacion:${leadId}`;
type Estado = "cargando" | "listo" | "guardando" | "guardado" | "error" | "sinLeer"; // sinLeer: falló la lectura

function leerCopia(leadId: string): Ficha | null {
  try {
    const t = localStorage.getItem(clave(leadId));
    return t ? limpiarFicha(JSON.parse(t)) : null;
  } catch {
    return null;
  }
}
function escribirCopia(leadId: string, f: Ficha | null) {
  try {
    if (f) localStorage.setItem(clave(leadId), JSON.stringify(f));
    else localStorage.removeItem(clave(leadId));
  } catch {
    // sin almacenamiento (modo privado): queda el guardado normal
  }
}

export function useFicha(leadId: string) {
  const [campos, setCampos] = useState<Ficha>({});
  const [estado, setEstado] = useState<Estado>("cargando");
  const guardada = useRef<Ficha>({}); // lo que ya está en la base
  const actual = useRef<Ficha>({});
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cargada = useRef(false);
  const [intento, setIntento] = useState(0); // «Reintentar» tras una lectura fallida
  const deLead = useRef(leadId);

  const guardar = useCallback(async (): Promise<boolean> => {
    if (reloj.current) clearTimeout(reloj.current);
    // Sin leer la base no se guarda nunca (pisaría la ficha que hubiera); si hay algo escrito, el botón no sigue
    if (!cargada.current) return mismaFicha(actual.current, {});
    const f = actual.current;
    if (mismaFicha(f, guardada.current)) return true;
    setEstado("guardando");
    try {
      const r = await guardarFicha(leadId, f);
      if (r && typeof r === "object" && "error" in r) throw new Error(String(r.error));
      guardada.current = f;
      if (mismaFicha(actual.current, f)) escribirCopia(leadId, null);
      setEstado("guardado");
      return true;
    } catch {
      setEstado("error");
      return false;
    }
  }, [leadId]);

  // Al abrir: lo de la base y, si quedó una copia sin guardar en este navegador, esa (y se guarda)
  useEffect(() => {
    let vivo = true;
    cargada.current = false;
    if (deLead.current !== leadId) {
      deLead.current = leadId;
      actual.current = {}; // lo escrito es de otro lead
    }
    // Si la lectura falla (error de la base, red o un despliegue a mitad de sesión): aviso y «Reintentar», sin
    // «Cargando…» para siempre y sin dar la ficha por leída (antes salía vacía y al guardar pisaba la de la base)
    const fallo = () => vivo && setEstado("sinLeer");
    void leerFicha(leadId).then((r) => {
      if (!vivo) return;
      if (!r || typeof r !== "object" || "error" in r) return void fallo();
      const base = r as Ficha;
      const copia = leerCopia(leadId);
      guardada.current = base;
      actual.current = fichaAlLeer(base, copia, actual.current);
      setCampos(actual.current);
      cargada.current = true;
      setEstado("listo");
      if (!mismaFicha(actual.current, base)) void guardar();
    }, fallo);
    return () => {
      vivo = false;
    };
  }, [leadId, guardar, intento]);

  // Al salir de la página o cerrar la pestaña (o pasar a otra app en el móvil): envío que sobrevive al cierre
  useEffect(() => {
    const salir = () => {
      if (!cargada.current || mismaFicha(actual.current, guardada.current)) return;
      const cuerpo = new Blob([JSON.stringify(actual.current)], { type: "text/plain" });
      const ok = navigator.sendBeacon?.(`/api/cualificacion/${leadId}`, cuerpo);
      if (!ok) void fetch(`/api/cualificacion/${leadId}`, { method: "POST", body: cuerpo, keepalive: true }).catch(() => {});
    };
    const oculta = () => document.visibilityState === "hidden" && salir();
    window.addEventListener("pagehide", salir);
    document.addEventListener("visibilitychange", oculta);
    return () => {
      window.removeEventListener("pagehide", salir);
      document.removeEventListener("visibilitychange", oculta);
      salir(); // se desmonta (cambio de sección dentro de la app): tampoco se pierde
    };
  }, [leadId]);

  const cambiar = (k: CampoFicha, v: string) => {
    const f = { ...actual.current, [k]: v };
    actual.current = f;
    setCampos(f);
    if (!cargada.current) return; // sin leer: solo en memoria (una copia a medias pisaría la base al volver a entrar)
    escribirCopia(leadId, f);
    if (estado !== "error") setEstado("listo");
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => void guardar(), ESPERA);
  };

  const releer = () => {
    setEstado("cargando");
    setIntento((n) => n + 1);
  };

  return { campos, estado, cambiar, guardar, releer };
}

export function PanelFicha({ ficha }: { ficha: ReturnType<typeof useFicha> }) {
  const { campos, estado, cambiar, guardar, releer } = ficha;
  // El recuadro azul clarito lo pone el lateral entero del guion (Cristian, 7 nov); aquí, los campos en blanco
  return (
    <div className="space-y-2">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="titulo-seccion !text-primario">Ficha de cualificación</span>
        <span className="text-xs text-texto-3" aria-live="polite">
          {estado === "cargando" && "Cargando…"}
          {estado === "guardando" && "Guardando…"}
          {estado === "guardado" && <span className="inline-flex items-center gap-1 text-ok"><Check className="h-3.5 w-3.5" /> Guardado</span>}
          {estado === "error" && (
            <button type="button" className="inline-flex items-center gap-1 font-medium text-mal hover:underline" onClick={() => void guardar()}>
              <RotateCw className="h-3.5 w-3.5" /> No se guardó · Reintentar
            </button>
          )}
          {estado === "sinLeer" && (
            <button type="button" className="inline-flex items-center gap-1 font-medium text-mal hover:underline" onClick={releer}>
              <RotateCw className="h-3.5 w-3.5" /> No se pudo cargar (no se guarda) · Reintentar
            </button>
          )}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {CAMPOS_FICHA.map((c) => {
          const id = `ficha-${c.k}`;
          return (
            <div key={c.k} className={c.largo ? "col-span-2" : ""}>
              <label htmlFor={id} className="etiqueta-campo">{c.t}</label>
              {c.largo ? (
                <textarea id={id} rows={2} className="campo resize-y !bg-panel py-1.5" value={campos[c.k] ?? ""} disabled={estado === "cargando"} onChange={(e) => cambiar(c.k, e.target.value)} placeholder={c.k === "nota" ? "Lo que quieras apuntar de esta llamada…" : ""} />
              ) : (
                <input id={id} className="campo !bg-panel py-1.5" value={campos[c.k] ?? ""} disabled={estado === "cargando"} onChange={(e) => cambiar(c.k, e.target.value)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
