"use client";

import { sinVaciar } from "@/components/sin-vaciar";
import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { enviarReporte } from "./acciones";
import { tasasCloser, type Pregunta } from "@/lib/reportes";
import { Modal } from "@/components/modal";

// S2-15 (17 nov): `hoy` es el día del proyecto (lo pasa la página); con el del aparato, en España de madrugada salía
// «mañana» y el servidor respondía «Fecha no válida»
type Props = { rol: "caller" | "closer"; hoy: string; sugeridos: Record<string, number>; preguntas: Pregunta[]; yaEnviadoHoy?: boolean };

// A4-10 (17 nov): el contenido va en su propio componente, que se monta de nuevo cada vez que se abre la ventana
// (como un `key` nuevo): antes, tras enviar, el ✓ se quedaba y al volver a abrir no salía el formulario
export function NuevoReporte(props: Props) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button className="btn-primario" onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Crear nuevo reporte</button>
      {abierto && (
        <Modal titulo="Reporte de fin de día" onCerrar={() => setAbierto(false)} ancho="max-w-xl">
          <VentanaReporte {...props} onCerrar={() => setAbierto(false)} />
        </Modal>
      )}
    </>
  );
}

export function VentanaReporte({ rol, hoy, sugeridos, preguntas, yaEnviadoHoy = false, onCerrar }: Props & { onCerrar: () => void }) {
  const [paso, setPaso] = useState(0);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");
  const [estado, accion, enviando] = useActionState(enviarReporte, null as null | { ok?: string; error?: string });
  const numeros = preguntas.filter((p) => p.tipo === "numero");
  const textos = preguntas.filter((p) => p.tipo === "texto");

  return estado?.ok ? (
      <div className="space-y-4 py-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ok-suave text-2xl text-ok">✓</div>
        <p className="font-medium">{estado.ok}</p>
        <button className="btn-secundario" onClick={onCerrar}>Cerrar</button>
      </div>
    ) : (
      <form
        onSubmit={(e) => { setAviso(""); sinVaciar(accion)(e); }}
        // A4-05 (17 nov): el navegador bloqueaba el envío por un campo de un paso escondido y no se veía nada.
        // Ahora se abre ese paso y se dice qué campo y por qué.
        onInvalidCapture={(e) => {
          const campo = e.target as HTMLInputElement;
          setPaso(Number(campo.closest<HTMLElement>("[data-paso]")?.dataset.paso ?? paso));
          setAviso(`«${campo.labels?.[0]?.textContent ?? campo.name}»: ${campo.validationMessage}`);
        }}
        className="space-y-4"
      >
        <div className="flex gap-1.5">{[0, 1].map((i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= paso ? "bg-primario" : "bg-borde"}`} />)}</div>
        {aviso && <p role="alert" className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{aviso}</p>}
        {/* Decisión de Cristian (17 nov): se puede volver a enviar (sustituye al anterior), pero avisado */}
        {yaEnviadoHoy && <p className="rounded-lg bg-oro-suave px-3 py-2 text-sm text-oro-texto">Ya enviaste el de hoy. Si lo envías otra vez, sustituye al anterior.</p>}
        <div data-paso="0" className={paso === 0 ? "space-y-4" : "hidden"}>
          <div>
            <label className="etiqueta-campo" htmlFor="formulario-dia">Día</label>
            <input id="formulario-dia" type="date" name="fecha" defaultValue={hoy} max={hoy} className="campo" />
          </div>
          <p className="text-xs text-texto-3">Hemos rellenado los números con lo que registraste hoy en el panel. Corrígelos si hace falta.</p>
          <div className="grid grid-cols-2 gap-3">
            {numeros.map((p) => (
              <div key={p.clave} className={p.destacada ? "col-span-2 rounded-lg border border-oro/40 bg-oro-suave p-3" : ""}>
                <label className="etiqueta-campo" htmlFor={`rep-${p.clave}`}>{p.texto}</label>
                <input id={`rep-${p.clave}`}
                  name={p.clave}
                  type="number"
                  min={0}
                  step={1}
                  required
                  defaultValue={sugeridos[p.clave] ?? 0}
                  onChange={(e) => setValores((v) => ({ ...v, [p.clave]: e.target.value }))}
                  className="campo text-lg font-semibold tabular-nums"
                />
                {p.ayuda && <p className="mt-1 text-xs text-texto-3">{p.ayuda}</p>}
              </div>
            ))}
          </div>
          {rol === "closer" && (() => {
            const t = tasasCloser({ ...Object.fromEntries(numeros.map((p) => [p.clave, sugeridos[p.clave] ?? 0])), ...valores });
            return (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-borde bg-panel-2 p-3 text-center">
                <div><div className="text-xl font-semibold text-primario">{t.agendamiento}</div><div className="text-[11px] uppercase tracking-wider text-texto-3">Tasa de agendamiento</div></div>
                <div><div className="text-xl font-semibold text-ok">{t.cierre}</div><div className="text-[11px] uppercase tracking-wider text-texto-3">Tasa de cierre</div></div>
              </div>
            );
          })()}
          <button
            type="button"
            className="btn-primario w-full"
            onClick={(e) => {
              // Se comprueban los números aquí, con el paso a la vista (el primero mal salta en onInvalidCapture)
              const campos = e.currentTarget.parentElement!.querySelectorAll("input");
              if ([...campos].every((c) => c.checkValidity())) { setAviso(""); setPaso(1); }
            }}
          >Siguiente →</button>
        </div>
        <div data-paso="1" className={paso === 1 ? "space-y-4" : "hidden"}>
          {textos.map((p) => (
            <div key={p.clave}>
              <label className="etiqueta-campo" htmlFor={`rep-${p.clave}`}>{p.texto}</label>
              <textarea id={`rep-${p.clave}`} name={p.clave} rows={3} required className="campo" />
              {p.ayuda && <p className="mt-1 text-xs text-texto-3">{p.ayuda}</p>}
            </div>
          ))}
          {estado?.error && <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{estado.error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-secundario" onClick={() => setPaso(0)}>← Atrás</button>
            <button className="btn-primario flex-1" disabled={enviando}>{enviando ? "Enviando…" : "Enviar mi reporte ✓"}</button>
          </div>
        </div>
      </form>
  );
}
