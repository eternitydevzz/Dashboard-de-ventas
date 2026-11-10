"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { BookOpen, Maximize2, Upload } from "lucide-react";
import { Modal } from "@/components/modal";
import { BarraDeslizable } from "@/components/barra-deslizable";
import { useToast } from "@/components/toasts";
import { subirDelFormulario } from "@/lib/subir-cliente";
import { exigirOk } from "@/lib/resultado-cliente";
import { fechaHora } from "@/lib/formato";
import type { Proyecto } from "@/lib/tipos";
import { guardarManual, prepararSubidaManual } from "./acciones";

export type ManualFila = { id: string; titulo: string; actualizado_en: string; por: string | null };

// Cristian (7 nov, tras verlo en la app): el manual ocupa todo el ancho y el alto; arriba, un botón por manual
// para cambiar de uno a otro (antes, una lista a la izquierda que le quitaba sitio al .html)
export function VisorManuales({ manuales, elegido, editor, zona }: { manuales: ManualFila[]; elegido: ManualFila; editor: boolean; zona: Proyecto["zona_horaria"] }) {
  const src = `/api/manuales/${elegido.id}?v=${encodeURIComponent(elegido.actualizado_en)}`; // ?v=: al cambiarlo, no sale el viejo
  return (
    <section className="tarjeta flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-borde px-3 py-2.5 sm:px-4">
        <BarraDeslizable role="navigation" className="flex min-w-0 flex-1 gap-1.5" aria-label="Manuales">
          {manuales.map((m) => {
            const on = m.id === elegido.id;
            return (
              <Link key={m.id} href={`/manuales?m=${m.id}`} aria-current={on ? "page" : undefined} title={`Actualizado el ${fechaHora(m.actualizado_en, { zona_horaria: zona })}${m.por ? ` · por ${m.por}` : ""}`} className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${on ? "border-transparent bg-primario-boton text-white shadow-[0_6px_20px_-8px_rgb(43_89_209/0.6)]" : "border-borde bg-panel-2 text-texto-2 hover:border-borde-fuerte hover:text-texto"}`}>
                <BookOpen className="h-4 w-4" /> {m.titulo}
              </Link>
            );
          })}
        </BarraDeslizable>
        <a href={src} target="_blank" rel="noreferrer" className="btn-secundario px-2.5 py-1.5 text-xs"><Maximize2 className="h-3.5 w-3.5" /> Pantalla completa</a>
        {editor && <SubirManual cambiar={elegido} />}
      </div>
      {/* Aislado: sin allow-same-origin, el manual no puede leer la sesión ni tocar la app (lib/csp.ts, CSP_VISOR) */}
      <iframe key={src} src={src} title={elegido.titulo} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" className="h-[calc(100dvh-210px)] min-h-[480px] w-full bg-white" />
    </section>
  );
}

// «Subir manual (.html)» (nuevo) o «Cambiar este manual» (el .html nuevo sustituye al anterior)
export function SubirManual({ cambiar }: { cambiar?: ManualFila }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState("");
  const [enviando, iniciar] = useTransition();
  const toast = useToast();
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError("");
    iniciar(async () => {
      try {
        await subirDelFormulario(fd, "archivo", "text/html", prepararSubidaManual);
        await exigirOk(guardarManual(fd));
        toast(cambiar ? "Manual cambiado" : "Manual subido");
        setAbierto(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo subir el manual.");
      }
    });
  };
  return (
    <>
      <button type="button" className={cambiar ? "btn-secundario px-2.5 py-1 text-xs" : "btn-primario"} onClick={() => setAbierto(true)}>
        <Upload className={cambiar ? "h-3.5 w-3.5" : "h-4 w-4"} /> {cambiar ? "Cambiar este manual" : "Subir manual (.html)"}
      </button>
      {abierto && (
        <Modal titulo={cambiar ? `Cambiar «${cambiar.titulo}»` : "Subir manual"} onCerrar={() => setAbierto(false)}>
          <form onSubmit={enviar} className="space-y-3">
            {cambiar && <input type="hidden" name="id" value={cambiar.id} />}
            <label className="block"><span className="etiqueta-campo">Título</span><input name="titulo" required maxLength={80} defaultValue={cambiar?.titulo ?? ""} className="campo" placeholder="Manual general" /></label>
            <label className="block"><span className="etiqueta-campo">Archivo .html</span><input name="archivo" type="file" accept=".html,text/html" required className="campo" /></label>
            {cambiar && <p className="text-xs text-texto-3">El archivo nuevo sustituye al anterior para todo el equipo.</p>}
            {error && <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{error}</p>}
            <button className="btn-primario w-full" disabled={enviando}>{enviando ? "Subiendo…" : cambiar ? "Cambiar" : "Subir"}</button>
          </form>
        </Modal>
      )}
    </>
  );
}
