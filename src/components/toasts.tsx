"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { apuntarDeshacer, esAtajoDeshacer, esCampoDeTexto, sacarDeshacer, type PasoDeshacer } from "@/lib/deshacer";

// Avisos flotantes abajo a la derecha. Se quedan 5 s (los errores y los que se pueden deshacer, 8 s) y se pueden cerrar.
// «cargando» (C14): sin el ✓ de hecho; quien lo saca lo quita al llegar la respuesta (C5, useQuitarToast).
// «deshacer» (N2): botón «Deshacer» y, además, Ctrl+Z / Cmd+Z (lib/deshacer.ts) mientras no se use.
type Tipo = "ok" | "error" | "cargando";
type Toast = { id: number; texto: string; tipo: Tipo; paso?: PasoDeshacer };
type Opciones = { deshacer?: PasoDeshacer };
type Mostrar = (texto: string, tipo?: Tipo, opciones?: Opciones) => number;
const Contexto = createContext<{ mostrar: Mostrar; quitar: (id: number) => void }>({ mostrar: () => 0, quitar: () => {} });

export function useToast() {
  return useContext(Contexto).mostrar;
}

export function useQuitarToast() {
  return useContext(Contexto).quitar;
}

export function ProveedorToasts({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const quitar = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const mostrar = useCallback<Mostrar>(
    (texto, tipo = "ok", opciones) => {
      const id = Date.now() + Math.random();
      const paso = opciones?.deshacer;
      if (paso) apuntarDeshacer(paso);
      setToasts((t) => [...t.slice(-3), { id, texto, tipo, paso }]);
      setTimeout(() => quitar(id), tipo === "error" || paso ? 8000 : tipo === "cargando" ? 15000 : 5000);
      return id;
    },
    [quitar]
  );
  const deshacer = useCallback((paso?: PasoDeshacer) => {
    const hecho = sacarDeshacer(paso);
    if (!hecho) return false;
    setToasts((t) => t.filter((x) => x.paso !== hecho));
    void hecho.deshacer();
    return true;
  }, []);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (!esAtajoDeshacer(e) || esCampoDeTexto(e.target)) return; // en un campo, el deshacer del texto
      if (deshacer()) e.preventDefault();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [deshacer]);

  return (
    <Contexto value={{ mostrar, quitar }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tipo === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-panel ${
              t.tipo === "error" ? "border-mal/40 bg-mal-suave text-mal" : t.tipo === "ok" ? "vidrio border-ok/30 text-texto" : "vidrio border-borde text-texto"
            }`}
          >
            {t.tipo === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
            ) : t.tipo === "cargando" ? (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-texto-3" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="flex-1">{t.texto}</span>
            {t.paso && (
              <button onClick={() => deshacer(t.paso)} className="rounded px-1.5 text-xs font-semibold text-primario hover:underline" title="También con Ctrl+Z / Cmd+Z">
                Deshacer
              </button>
            )}
            <button onClick={() => quitar(t.id)} className="rounded p-0.5 text-texto-3 hover:text-texto" aria-label="Cerrar aviso">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Contexto>
  );
}
