"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RotateCw } from "lucide-react";
import { CAMPOS_FICHA, limpiarFicha, mismaFicha, type CampoFicha, type Ficha } from "@/lib/ficha-cualificacion";
import { guardarFicha, leerFicha } from "@/app/(panel)/caller/ficha-acciones";

// C6 (plan Callers, 7 nov; 7c.2): la ficha se guarda SIEMPRE, sin botón «Guardar»:
// 1) unos segundos después de dejar de escribir; 2) antes de cualquier botón del guion (si falla, el botón no sigue y
// sale «Reintentar»); 3) al cerrar el guion; 4) al salir de la página o cerrar la pestaña (sendBeacon a
// /api/cualificacion). Mientras no está en la base, hay una copia en este navegador (localStorage), por lead.
const ESPERA = 1500;
const clave = (leadId: string) => `ficha-cualificacion:${leadId}`;
type Estado = "cargando" | "listo" | "guardando" | "guardado" | "error";

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

  const guardar = useCallback(async (): Promise<boolean> => {
    if (reloj.current) clearTimeout(reloj.current);
    if (!cargada.current) return true; // aún no se ha leído: no se pisa lo que haya en la base
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
    void leerFicha(leadId).then((r) => {
      if (!vivo) return;
      const base = r && typeof r === "object" && !("error" in r) ? (r as Ficha) : {};
      if (r && typeof r === "object" && "error" in r) setEstado("error");
      const copia = leerCopia(leadId);
      guardada.current = base;
      actual.current = copia ?? base;
      setCampos(actual.current);
      cargada.current = true;
      if (!(r && typeof r === "object" && "error" in r)) setEstado("listo");
      if (copia && !mismaFicha(copia, base)) void guardar();
    });
    return () => {
      vivo = false;
    };
  }, [leadId, guardar]);

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
    escribirCopia(leadId, f);
    if (estado !== "error") setEstado("listo");
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => void guardar(), ESPERA);
  };

  return { campos, estado, cambiar, guardar };
}

export function PanelFicha({ ficha }: { ficha: ReturnType<typeof useFicha> }) {
  const { campos, estado, cambiar, guardar } = ficha;
  // Cristian (7 nov, tras verla en la app): toda la ficha dentro de un recuadro azul clarito, para remarcarla
  return (
    <div className="space-y-2 rounded-2xl border border-primario/25 bg-primario-suave p-3">
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
