"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Square } from "lucide-react";
import { useToast } from "@/components/toasts";
import { exigirOk } from "@/lib/resultado-cliente";
import { duracionTexto, extDeTipo } from "@/lib/grabaciones";
import { guardarGrabacion, prepararSubidaGrabacion } from "@/app/(panel)/grabaciones/acciones";

// C10 (plan Callers, 7 nov; 7b.3 punto 4): la grabadora vive en el marco de la app, no en la ventana del guion: cerrar
// el guion o cambiar de sección no corta la grabación, y avisa antes de salir de la página. La grabación queda unida
// al lead con el que empezó. Graba el micrófono del ordenador (con el móvil en altavoz se oye también al lead).
type Estado = { leadId: string; nombre: string; desde: number } | null;
type Grabadora = {
  grabando: Estado;
  segundos: number;
  subiendo: boolean;
  empezar: (leadId: string, nombre: string) => Promise<void>;
  parar: () => void;
};
const Contexto = createContext<Grabadora | null>(null);
export const useGrabadora = () => useContext(Contexto);

const TIPOS = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];

export function ProveedorGrabadora({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [grabando, setGrabando] = useState<Estado>(null);
  const [segundos, setSegundos] = useState(0);
  const [subiendo, setSubiendo] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);

  useEffect(() => {
    if (!grabando) return;
    const t = setInterval(() => setSegundos(Math.floor((Date.now() - grabando.desde) / 1000)), 1000);
    const salir = (e: BeforeUnloadEvent) => e.preventDefault(); // «¿Salir? La grabación se perderá»
    window.addEventListener("beforeunload", salir);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", salir);
    };
  }, [grabando]);

  const subir = useCallback(
    async (blob: Blob, tipo: string, leadId: string, seg: number) => {
      const ext = extDeTipo(tipo) ?? "webm";
      setSubiendo(true);
      try {
        const { ruta, url } = await exigirOk(prepararSubidaGrabacion(ext));
        const r = await fetch(url, { method: "PUT", headers: { "content-type": tipo.split(";")[0], "x-upsert": "false" }, body: blob });
        if (!r.ok) throw new Error(r.status === 413 ? "La grabación pesa más de 50 MB." : "No se pudo subir la grabación.");
        await exigirOk(guardarGrabacion(leadId, ruta, seg));
        toast("Grabación guardada en «Grabaciones»");
      } catch (e) {
        // No se pierde: se descarga en el ordenador para subirla después
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `grabacion-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}`;
        a.click();
        toast(`${e instanceof Error ? e.message : "No se pudo guardar"} Se ha descargado en tu ordenador.`, "error");
      } finally {
        setSubiendo(false);
      }
    },
    [toast]
  );

  const empezar = useCallback(
    async (leadId: string, nombre: string) => {
      if (rec.current) return;
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return void toast("Este navegador no puede grabar. Usa Chrome en el ordenador.", "error");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        return void toast("Sin permiso para el micrófono: dale permiso en el candado de la barra de direcciones.", "error");
      }
      const tipo = TIPOS.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const m = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      trozos.current = [];
      const desde = Date.now();
      m.ondataavailable = (e) => e.data.size && trozos.current.push(e.data);
      m.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const real = m.mimeType || tipo || "audio/webm";
        const blob = new Blob(trozos.current, { type: real.split(";")[0] });
        rec.current = null;
        setGrabando(null);
        void subir(blob, real, leadId, Math.round((Date.now() - desde) / 1000));
      };
      m.start(1000); // un trozo por segundo: si algo falla, se pierde poco
      rec.current = m;
      setSegundos(0);
      setGrabando({ leadId, nombre, desde });
    },
    [subir, toast]
  );

  const parar = useCallback(() => rec.current?.stop(), []);

  return (
    <Contexto.Provider value={{ grabando, segundos, subiendo, empezar, parar }}>
      {children}
      {/* Mientras graba, siempre a la vista (también con el guion cerrado o en otra sección) */}
      {grabando && (
        <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full border border-mal/40 bg-mal-suave px-4 py-2 text-sm font-semibold text-mal shadow-lg" role="status">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-mal" />
          Grabando a {grabando.nombre} · <span className="tabular-nums">{duracionTexto(segundos)}</span>
          <button type="button" onClick={parar} className="inline-flex items-center gap-1 rounded-full bg-mal px-3 py-1 text-xs text-white"><Square className="h-3 w-3" /> Parar y guardar</button>
        </div>
      )}
    </Contexto.Provider>
  );
}

// Botón «Grabar» con su contador, en la cabecera del guion (7c.3): rojo mientras graba
export function BotonGrabar({ leadId, nombre }: { leadId: string; nombre: string }) {
  const g = useGrabadora();
  if (!g) return null;
  const esEste = g.grabando?.leadId === leadId;
  const otro = g.grabando && !esEste;
  return (
    <div className={`flex items-center gap-2 rounded-xl py-1 pl-1 pr-2.5 transition-colors ${esEste ? "bg-mal-suave" : ""}`}>
      <button
        type="button"
        disabled={!!otro || g.subiendo}
        aria-pressed={esEste}
        title="Graba el micrófono de tu ordenador. Pon el móvil en altavoz para que se oiga al lead."
        onClick={() => (esEste ? g.parar() : void g.empezar(leadId, nombre))}
        className={`inline-flex items-center gap-2 rounded-xl border border-mal bg-mal-suave px-3 py-1.5 text-[12.5px] font-bold text-mal disabled:opacity-50 ${esEste ? "shadow-[0_0_0_4px_color-mix(in_srgb,var(--mal)_22%,transparent)]" : ""}`}
      >
        <span className={`h-2.5 w-2.5 rounded-full bg-mal ${esEste ? "animate-pulse" : ""}`} />
        {g.subiendo ? "Guardando…" : esEste ? "Parar y guardar" : otro ? `Grabando a ${g.grabando!.nombre}` : "Empezar a grabar"}
      </button>
      <span className={`min-w-11 text-[15px] font-bold tabular-nums ${esEste ? "text-mal" : "text-texto-3"}`}>{duracionTexto(esEste ? g.segundos : 0)}</span>
    </div>
  );
}
