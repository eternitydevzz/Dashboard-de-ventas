"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, ClipboardList, Copy, Lightbulb, MessageSquare, Search, ShieldQuestion, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toasts";
import { PanelFicha, useFicha } from "@/components/ficha-cualificacion";
import { guardarMarcasGuion } from "@/app/(panel)/guiones/acciones";
import { rellenar, type Guion, type Marcas } from "@/lib/guiones";
import type { Respuesta } from "@/lib/tipos";

export type ResultadoGuion = { clave: string; texto: string; icono: ReactNode };

// Logo de WhatsApp en su verde (lucide no trae logos de marca)
const LogoWsp = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="#25D366" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

// Ventana del guion (C5, plan Callers 7c.3; maqueta aprobada el 7 nov). Cabecera con el teléfono y «Grabar» (C10);
// a la izquierda los pasos (uno abierto, cada uno con sus casillas); a la derecha Form · Cualificación · Objeciones
// (Form abierta); abajo los 9 resultados y «Siguiente». Sin contador total del checklist ni aviso de grabación (decidido).
// La ficha de cualificación (C6) se guarda antes de cualquier botón; si falla, el botón no sigue y sale «Reintentar».
// Un resultado no cierra el guion: lo aplica (los que piden datos abren su ventana encima) y se queda marcado.
// «Siguiente» pide antes un resultado para este lead (decidido), guarda y abre el guion del siguiente de la lista.
export function GuionLlamada({
  leadId,
  nombreLead,
  telefono,
  miNombre,
  guion,
  respuestas = [],
  resultados,
  actual,
  grabador,
  onResultado,
  onSiguiente,
  onCerrar,
}: {
  leadId: string;
  nombreLead: string;
  telefono: string | null;
  miNombre: string;
  guion: Guion;
  respuestas?: Respuesta[];
  resultados: ResultadoGuion[];
  actual?: string; // columna en la que está el lead ahora (su botón se ve marcado)
  grabador?: ReactNode; // C10: «Grabar» con su contador
  onResultado: (clave: string) => void;
  onSiguiente?: () => void;
  onCerrar: () => void;
}) {
  const toast = useToast();
  const [marcas, setMarcas] = useState<Marcas>({});
  const [paso, setPaso] = useState(guion.pasos[0]?.id ?? "");
  const [busca, setBusca] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [lado, setLado] = useState<"form" | "ficha" | "objeciones">("form");
  const [aviso, setAviso] = useState("");
  const pulsado = useRef<string | null>(null); // último resultado pulsado en esta ventana
  const ficha = useFicha(leadId);
  const datos = { nombre: nombreLead.split(" ")[0], "tu nombre": miNombre };
  const telWsp = (telefono ?? "").replace(/[^\d]/g, ""); // como en acciones-lead: wa.me quiere solo dígitos
  const objeciones = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return guion.objeciones.filter((o) => !t || o.objecion.toLowerCase().includes(t) || o.respuesta.toLowerCase().includes(t));
  }, [busca, guion.objeciones]);

  function marcar(pasoId: string, i: number) {
    setMarcas((m) => {
      const ya = new Set(m[pasoId] ?? []);
      if (ya.has(i)) ya.delete(i);
      else ya.add(i);
      return { ...m, [pasoId]: [...ya] };
    });
  }

  // Antes de seguir, la ficha tiene que estar guardada (7c.2)
  async function conFichaGuardada(siguiente: () => void) {
    setAviso("");
    if (await ficha.guardar()) return siguiente();
    setLado("ficha");
    setAviso("No se pudo guardar la ficha de cualificación. Pulsa «Reintentar» y vuelve a probar.");
  }

  // F11 (plan Callers): las casillas se guardan al salir del guion con el resultado que de verdad quedó (la columna
  // actual si coincide con el último pulsado), no al pulsar un botón cuya ventana se puede cancelar después
  function guardarMarcas() {
    const quedo = pulsado.current && actual === pulsado.current ? actual : null;
    if (!Object.keys(marcas).length && !quedo) return;
    void guardarMarcasGuion(leadId, marcas, quedo).then((r) => {
      if (r && typeof r === "object" && "error" in r && r.error) toast(String(r.error), "error");
    });
  }

  const cerrar = () => void conFichaGuardada(() => (guardarMarcas(), onCerrar()));
  const tab = (v: typeof lado, t: string, Icono: typeof Search) => (
    <button key={v} type="button" role="tab" aria-selected={lado === v} onClick={() => { setLado(v); void ficha.guardar(); }} className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-xs font-semibold ${lado === v ? "bg-primario-boton text-white shadow-[0_4px_14px_-6px_rgb(43_89_209/0.7)]" : "text-texto-2 hover:text-primario"}`}>
      <Icono className="h-3.5 w-3.5" /> {t}
    </button>
  );

  return (
    <Modal
      titulo={`Guion · ${nombreLead}`}
      onCerrar={cerrar}
      claseFondo="p-0 sm:p-6"
      claseVentana="flex h-dvh w-full flex-col [--panel:#ffffff]! dark:[--panel:#121c3a]! overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-[920px] sm:rounded-[20px]"
      cabecera={
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-borde px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-semibold">Guion · {nombreLead}</h2>
            <div className="mt-0.5 flex items-center gap-2">
              <b className="whitespace-nowrap text-lg tabular-nums">{telefono ?? "Sin teléfono"}</b>
              {telefono && (
                <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-borde bg-panel-2 px-2 py-1 text-xs font-semibold text-texto-2 hover:text-texto" onClick={() => void navigator.clipboard?.writeText(telefono).then(() => toast("Número copiado"))} aria-label="Copiar número">
                  <Copy className="h-3.5 w-3.5" /><span className="hidden sm:inline">Copiar número</span>
                </button>
              )}
            </div>
          </div>
          {(grabador || telWsp) && (
            <div className="order-3 flex flex-wrap items-center gap-2 sm:order-none">
              {telWsp && (
                <a href={`https://wa.me/${telWsp}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-[#25D366] bg-[#25D366]/10 px-3 py-1.5 text-[12.5px] font-bold text-ok-texto hover:bg-[#25D366]/20">
                  <LogoWsp /> Abrir en wsp
                </a>
              )}
              {grabador}
            </div>
          )}
          <button type="button" onClick={cerrar} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-borde bg-panel-2 text-texto-2 hover:text-texto" aria-label="Cerrar el guion"><X className="h-4 w-4" /></button>
        </header>
      }
    >
      <div className="grid min-h-0 flex-1 items-start gap-4 overflow-y-auto overscroll-contain p-3 sm:p-5 md:grid-cols-[minmax(0,1fr)_330px]">
        <ol className="space-y-2">
          {guion.pasos.map((p, i) => {
            const activo = p.id === paso;
            const marcados = new Set(marcas[p.id] ?? []);
            const completo = p.checklist.length > 0 && marcados.size === p.checklist.length;
            return (
              <li key={p.id} className={`rounded-2xl border transition ${activo ? "border-primario bg-panel shadow-[0_0_0_1px_var(--primario)]" : "border-borde bg-panel-2"}`}>
                <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold" onClick={() => setPaso(activo ? "" : p.id)} aria-expanded={activo}>
                  <span className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-xs font-bold ${completo ? "bg-ok text-white" : activo ? "bg-primario-boton text-white" : "border border-borde bg-panel text-texto-2"}`}>
                    {completo ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="flex-1">{p.titulo}</span>
                  {p.checklist.length > 0 && <span className={`text-xs tabular-nums ${completo ? "text-ok-texto" : "text-texto-3"}`}>{marcados.size}/{p.checklist.length}</span>}
                </button>
                {activo && (
                  <div className="space-y-2 px-3 pb-3 sm:pl-12">
                    {p.texto && <p className="whitespace-pre-line rounded-xl bg-primario-suave px-3 py-2 text-sm leading-relaxed">{rellenar(p.texto, datos)}</p>}
                    {p.checklist.map((c, j) => (
                      <label key={j} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={marcados.has(j)} onChange={() => marcar(p.id, j)} />
                        <span>{c}</span>
                      </label>
                    ))}
                    {p.pistas.map((x, j) => (
                      <p key={j} className="flex gap-1.5 text-xs text-texto-2"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-oro-texto" />{x}</p>
                    ))}
                    {i < guion.pasos.length - 1 && (
                      <button type="button" className="mt-1 inline-flex items-center gap-1.5 rounded-xl border border-borde bg-panel px-2.5 py-1.5 text-xs font-semibold hover:border-borde-fuerte" onClick={() => setPaso(guion.pasos[i + 1].id)}>
                        Siguiente paso <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {/* Cristian (7 nov, tras verlo en la app): todo el lateral (Form · Cualificación · Objeciones) en un recuadro azul
            clarito, y la pestaña elegida remarcada en azul */}
        <div className="space-y-2 rounded-2xl border border-primario/25 bg-primario-suave p-3 md:sticky md:top-0">
          <div className="flex gap-1 rounded-xl border border-primario/20 bg-panel p-1" role="tablist" aria-label="Ayudas del guion">
            {tab("form", "Form", MessageSquare)}
            {tab("ficha", "Cualificación", ClipboardList)}
            {tab("objeciones", "Objeciones", ShieldQuestion)}
          </div>
          {lado === "form" && (
            <div role="tabpanel">
              <p className="titulo-seccion mb-2 !text-primario">Lo que respondió en el formulario</p>
              {respuestas.length === 0 ? (
                <p className="py-4 text-center text-xs text-texto-3">Este lead no tiene respuestas de formulario.</p>
              ) : (
                <dl className="space-y-2">
                  {respuestas.map((r) => (
                    <div key={r.pregunta} className="rounded-xl border border-borde bg-panel px-3 py-2">
                      <dt className="text-xs text-texto-3">{r.pregunta}</dt>
                      <dd className="mt-0.5 text-sm font-semibold">{r.respuesta || <span className="font-normal text-texto-3">Sin responder</span>}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
          {lado === "ficha" && <div role="tabpanel"><PanelFicha ficha={ficha} /></div>}
          {lado === "objeciones" && (
            <div role="tabpanel" className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} className="campo pl-9" placeholder="Busca lo que te dice…" aria-label="Buscar objeción" />
              </div>
              {objeciones.length === 0 && <p className="py-4 text-center text-xs text-texto-3">No hay ninguna con eso.</p>}
              {objeciones.map((o) => (
                <button key={o.id} type="button" className={`block w-full rounded-xl border bg-panel px-3 py-2 text-left text-sm font-semibold ${abierta === o.id ? "border-primario" : "border-borde hover:border-borde-fuerte"}`} onClick={() => setAbierta(abierta === o.id ? null : o.id)} aria-expanded={abierta === o.id}>
                  «{o.objecion}»
                  {abierta === o.id && <span className="mt-1.5 block whitespace-pre-line text-xs font-normal leading-relaxed text-texto-2">{rellenar(o.respuesta, datos)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-borde px-3 pb-3 pt-2.5 sm:px-5">
        {aviso && <p className="mb-2 rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal" role="alert">{aviso}</p>}
        <p className="titulo-seccion mb-2">¿Cómo ha ido?</p>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
          {resultados.map((r) => {
            const marcado = actual === r.clave;
            return (
              <button
                key={r.clave}
                type="button"
                aria-current={marcado ? "true" : undefined}
                className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-1.5 text-center text-[11px] font-semibold leading-tight sm:min-h-9 sm:flex-row sm:justify-start sm:gap-2 sm:px-2.5 sm:text-left sm:text-xs ${marcado ? "border-primario bg-primario-suave text-primario" : "border-borde bg-panel hover:border-borde-fuerte"}`}
                onClick={() => void conFichaGuardada(() => { pulsado.current = r.clave; onResultado(r.clave); })}
              >
                {r.icono} {r.texto}
              </button>
            );
          })}
          {onSiguiente && (
            <button
              type="button"
              className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl bg-primario-boton px-2 text-[11px] font-semibold text-white shadow-[0_6px_20px_-8px_rgb(43_89_209/0.6)] hover:bg-primario-2 sm:min-h-9 sm:flex-row sm:text-xs"
              title="Guarda los datos de este lead y abre el siguiente de la lista"
              onClick={() => {
                if (!pulsado.current) return setAviso("Antes de pasar al siguiente, marca cómo ha ido con este lead.");
                void conFichaGuardada(() => (guardarMarcas(), onSiguiente()));
              }}
            >
              Siguiente <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </footer>
    </Modal>
  );
}
