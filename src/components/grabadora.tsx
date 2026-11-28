"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Square } from "lucide-react";
import { useToast } from "@/components/toasts";
import { exigirOk } from "@/lib/resultado-cliente";
import { AVISO_FIN_SEG, ESPERA_INDICE_MS, conTiempo, duracionTexto, extDeTipo, quedanAviso } from "@/lib/grabaciones";
import { anotarFalloGrabadora, guardarGrabacion, prepararSubidaGrabacion } from "@/app/(panel)/grabaciones/acciones";
import { hacerBuscable } from "@/lib/webm-buscable";

// Al registro de errores (avisos del CEO); si no se puede apuntar, no molesta a quien graba
const anotar = (texto: string) => void anotarFalloGrabadora(texto).catch(() => {});

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
  avisarFin: () => void; // al pulsar un resultado o «Siguiente»: aviso de 30 s y, sin «Saltar aviso», se para
};
const Contexto = createContext<Grabadora | null>(null);
export const useGrabadora = () => useContext(Contexto);

const TIPOS = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];

export function ProveedorGrabadora({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [grabando, setGrabando] = useState<Estado>(null);
  const [segundos, setSegundos] = useState(0);
  const [subiendo, setSubiendo] = useState(0); // cuántas se están subiendo (puede haber dos: la anterior y la nueva)
  const rec = useRef<MediaRecorder | null>(null);
  const deLead = useRef<string | null>(null); // lead de la grabación en curso
  const iniciando = useRef(false); // S4-7: mientras sale el permiso del micrófono, un 2.º «empezar» no hace nada
  const [finAviso, setFinAviso] = useState<number | null>(null);
  const [quedan, setQuedan] = useState(AVISO_FIN_SEG);

  useEffect(() => {
    if (finAviso === null) return;
    const t = setInterval(() => {
      const q = quedanAviso(finAviso, Date.now());
      setQuedan(q);
      if (q > 0) return;
      setFinAviso(null);
      rec.current?.stop();
    }, 500);
    return () => clearInterval(t);
  }, [finAviso]);

  // A4-06: si la grabadora se quita (p. ej. al cerrar sesión), el micrófono no se queda abierto
  useEffect(() => () => rec.current?.stream.getTracks().forEach((t) => t.stop()), []);

  useEffect(() => {
    if (!grabando) return;
    const t = setInterval(() => setSegundos(Math.floor((Date.now() - grabando.desde) / 1000)), 1000);
    return () => clearInterval(t);
  }, [grabando]);

  // «¿Salir? La grabación se perderá»: mientras graba y también mientras sube (21 nov, auditoría: cerrar o recargar
  // durante la subida la perdía sin aviso y sin descargarla)
  const ocupada = !!grabando || subiendo > 0;
  useEffect(() => {
    if (!ocupada) return;
    const salir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", salir);
    return () => window.removeEventListener("beforeunload", salir);
  }, [ocupada]);

  const subir = useCallback(
    async (grabado: Blob, tipo: string, leadId: string, seg: number) => {
      const ext = extDeTipo(tipo) ?? "webm";
      setSubiendo((n) => n + 1);
      if (!grabado.size) anotar(`Grabación vacía (0 bytes, ${seg} s): el micrófono no mandó sonido`);
      // con índice, para poder saltar al escucharla (si falla o tarda demasiado, la original)
      const conIndice = await conTiempo(hacerBuscable(grabado), ESPERA_INDICE_MS);
      if (!conIndice) anotar(`Poner el índice tardó más de ${ESPERA_INDICE_MS / 1000} s (${Math.round(grabado.size / 1024)} KB): se sube la original`);
      const blob = conIndice ?? grabado;
      try {
        const { ruta, url } = await exigirOk(prepararSubidaGrabacion(ext));
        const r = await fetch(url, { method: "PUT", headers: { "content-type": tipo.split(";")[0], "x-upsert": "false" }, body: blob });
        if (!r.ok) throw new Error(r.status === 413 ? "La grabación pesa más de 50 MB." : "No se pudo subir la grabación.");
        await exigirOk(guardarGrabacion(leadId, ruta, seg));
        toast("Grabación guardada en «Grabaciones»");
      } catch (e) {
        anotar(`No se pudo subir (${seg} s, ${Math.round(blob.size / 1024)} KB): ${e instanceof Error ? e.message : String(e)}. Se descargó en su ordenador.`);
        // No se pierde: se descarga en el ordenador para subirla después
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `grabacion-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}`;
        a.click();
        toast(`${e instanceof Error ? e.message : "No se pudo guardar"} Se ha descargado en tu ordenador.`, "error");
      } finally {
        setSubiendo((n) => n - 1);
      }
    },
    [toast]
  );

  const empezar = useCallback(
    async (leadId: string, nombre: string) => {
      if (iniciando.current || (rec.current && deLead.current === leadId)) return;
      // 21 nov (auditoría): Grabar en otro lead (p. ej. durante los 30 s del aviso) para y guarda la anterior y empieza
      // la nueva. Antes el botón quedaba bloqueado y la llamada siguiente no se grababa
      if (rec.current) {
        const anterior = rec.current;
        rec.current = null;
        setFinAviso(null);
        anterior.stop();
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        anotar("Este navegador no puede grabar");
        return void toast("Este navegador no puede grabar. Usa Chrome en el ordenador.", "error");
      }
      let stream: MediaStream;
      iniciando.current = true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        // NotAllowedError = sin permiso; NotFoundError = no hay micrófono; NotReadableError = otra app lo está usando
        anotar(`No se pudo abrir el micrófono: ${e instanceof Error ? `${e.name} ${e.message}` : String(e)}`);
        return void toast("Sin permiso para el micrófono: dale permiso en el candado de la barra de direcciones.", "error");
      } finally {
        iniciando.current = false; // rec.current se pone justo debajo, sin otro await entre medias
      }
      const tipo = TIPOS.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      // 64 kbps basta para voz: ~28 MB por hora, frente a ~184 kbps sin fijarlo (39 min = 54 MB, más que el tope de 50 MB)
      const m = new MediaRecorder(stream, { audioBitsPerSecond: 64_000, ...(tipo ? { mimeType: tipo } : {}) });
      const desde = Date.now();
      m.onerror = (e) => anotar(`La grabadora falló mientras grababa: ${(e as Event & { error?: Error }).error?.message ?? "sin detalle"}`);
      const suyos: Blob[] = []; // los trozos de esta grabación (si empieza otra, no se mezclan)
      m.ondataavailable = (e) => e.data.size && suyos.push(e.data);
      m.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const real = m.mimeType || tipo || "audio/webm";
        const blob = new Blob(suyos, { type: real.split(";")[0] });
        if (rec.current === m) rec.current = null;
        if (!rec.current) {
          // si ya hay otra en marcha (Grabar en otro lead), su estado no se toca
          setFinAviso(null);
          setGrabando((g) => (g?.desde === desde ? null : g));
        }
        void subir(blob, real, leadId, Math.round((Date.now() - desde) / 1000));
      };
      m.start(1000); // un trozo por segundo: si algo falla, se pierde poco
      rec.current = m;
      deLead.current = leadId;
      setSegundos(0);
      setGrabando({ leadId, nombre, desde });
    },
    [subir, toast]
  );

  const parar = useCallback(() => rec.current?.stop(), []);
  const avisarFin = useCallback(() => {
    if (!rec.current) return;
    setQuedan(AVISO_FIN_SEG);
    setFinAviso((f) => f ?? Date.now() + AVISO_FIN_SEG * 1000);
  }, []);

  return (
    <Contexto.Provider value={{ grabando, segundos, subiendo: subiendo > 0, empezar, parar, avisarFin }}>
      {children}
      {/* Mientras graba, siempre a la vista (también con el guion cerrado o en otra sección) */}
      {grabando && (
        <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full border border-mal/40 bg-mal-suave px-4 py-2 text-sm font-semibold text-mal shadow-lg" role="status">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-mal" />
          Grabando a {grabando.nombre} · <span className="tabular-nums">{duracionTexto(segundos)}</span>
          <button type="button" onClick={parar} className="inline-flex items-center gap-1 rounded-full bg-mal px-3 py-1 text-xs text-white"><Square className="h-3 w-3" /> Parar y guardar</button>
          {finAviso !== null && (
            <span role="alert" className="flex items-center gap-2 border-l border-mal/40 pl-3">
              Se para en <span className="tabular-nums">{quedan} s</span>
              <button type="button" onClick={() => setFinAviso(null)} className="rounded-full border border-mal px-3 py-1 text-xs">Saltar aviso</button>
            </span>
          )}
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
        aria-pressed={esEste}
        title={otro ? `Para y guarda la grabación de ${g.grabando!.nombre} y empieza esta` : "Graba el micrófono de tu ordenador. Pon el móvil en altavoz para que se oiga al lead."}
        onClick={() => (esEste ? g.parar() : void g.empezar(leadId, nombre))}
        className={`inline-flex items-center gap-2 rounded-xl border border-mal bg-mal-suave px-3 py-1.5 text-[12.5px] font-bold text-mal disabled:opacity-50 ${esEste ? "shadow-[0_0_0_4px_color-mix(in_srgb,var(--mal)_22%,transparent)]" : ""}`}
      >
        <span className={`h-2.5 w-2.5 rounded-full bg-mal ${esEste ? "animate-pulse" : ""}`} />
        {esEste ? "Parar y guardar" : otro ? `Empezar a grabar (para la de ${g.grabando!.nombre})` : g.subiendo ? "Empezar a grabar · guardando la anterior…" : "Empezar a grabar"}
      </button>
      <span className={`min-w-11 text-[15px] font-bold tabular-nums ${esEste ? "text-mal" : "text-texto-3"}`}>{duracionTexto(esEste ? g.segundos : 0)}</span>
    </div>
  );
}
