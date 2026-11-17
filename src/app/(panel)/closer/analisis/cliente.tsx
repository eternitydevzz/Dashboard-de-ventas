"use client";

import { Fragment, useState, useTransition, type ReactNode } from "react";
import { sinVaciar } from "@/components/sin-vaciar";
import { useRouter } from "next/navigation";
import { Settings2, Sparkles, RefreshCw, Check, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { useAccion } from "@/components/acciones-lead";
import { useToast } from "@/components/toasts";
import { exigirOk } from "@/lib/resultado-cliente";
import { AGENTES, type Agente, type ConfigAgentes } from "@/lib/ia-agentes";
import { aceptarAutocompletado, analizarPendientesAhora, evaluarManual, guardarConfigIa, reanalizar, rechazarAutocompletado } from "./acciones";
import { confirmar } from "@/components/dialogos";
import { Desplegable } from "@/components/eleccion";

// Texto de la IA con viñetas y **negritas**, sin meter HTML (React lo escapa todo)
export function TextoIa({ texto }: { texto: string }) {
  const negritas = (s: string): ReactNode[] => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
  const lineas = texto.split("\n").map((l) => l.trimEnd()).filter((l, i, a) => l || (i > 0 && a[i - 1]));
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lineas.map((l, i) =>
        /^\s*[-*•]\s+/.test(l) ? <div key={i} className="flex gap-2 pl-1"><span className="text-oro">•</span><span>{negritas(l.replace(/^\s*[-*•]\s+/, ""))}</span></div> : /^#+\s/.test(l) ? <div key={i} className="pt-1 font-semibold">{negritas(l.replace(/^#+\s/, ""))}</div> : l ? <p key={i}>{negritas(l)}</p> : <div key={i} className="h-1" />
      )}
    </div>
  );
}

export function AnalizarPendientes({ clave }: { clave: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  return (
    <button className="btn-secundario border-oro/40 text-oro" disabled={cargando || !clave} title={clave ? "Analiza las grabaciones conciliadas que aún no tienen análisis" : "Falta la clave de Claude"} onClick={() => iniciar(async () => { try { const r = (await exigirOk(analizarPendientesAhora())) as { nuevas: number }; toast(r.nuevas ? `${r.nuevas} llamadas en cola para analizar` : "Analizando lo que quedaba en cola"); router.refresh(); } catch (e) { toast(e instanceof Error ? e.message : "Falló", "error"); } })}>
      <Sparkles className="h-4 w-4" /> {cargando ? "Poniendo en cola…" : "Analizar pendientes"}
    </button>
  );
}

export function Reanalizar({ id }: { id: string }) {
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <span className="inline-flex flex-col items-end">
      <button className="btn-secundario" disabled={pendiente} onClick={() => void confirmar("¿Volver a analizar esta llamada? Gasta una nueva petición a Claude.").then((ok) => ok && ejecutar(() => reanalizar(id), "En cola: recarga en un minuto"))}><RefreshCw className="h-4 w-4" /> Re-analizar</button>
      {error && <span className="text-xs text-mal">{error}</span>}
    </span>
  );
}

export function Autocompletado({ id, estado }: { id: string; estado: string | null }) {
  const { pendiente, error, ejecutar } = useAccion();
  const router = useRouter();
  if (estado === "aceptado") return <Insignia texto="Aplicado a la cita" tono="ok" />;
  if (estado === "rechazado") return <Insignia texto="Descartado" tono="neutro" />;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-primario" disabled={pendiente} onClick={() => ejecutar(async () => { const r = await aceptarAutocompletado(id); const x = r as { irAVenta?: string | null } | { error: string }; if (x && "irAVenta" in x && x.irAVenta) router.push(`/leads/${x.irAVenta}`); return r; }, "Cierre aplicado")}><Check className="h-4 w-4" /> Confirmar</button>
      <button className="btn-secundario" disabled={pendiente} onClick={() => ejecutar(() => rechazarAutocompletado(id), "Descartado")}><X className="h-4 w-4" /> No es así</button>
      <span className="text-xs text-texto-3">Si propone «Cerrada», te lleva a la ficha para registrar la venta.</span>
      {error && <p className="w-full text-sm text-mal">{error}</p>}
    </div>
  );
}
function Insignia({ texto, tono }: { texto: string; tono: "ok" | "neutro" }) {
  return <span className={`chip ${tono === "ok" ? "bg-ok-suave text-ok" : "bg-panel-2 text-texto-2"}`}>{texto}</span>;
}

export function EvaluarManual({ id, nota, texto }: { id: string; nota: number | null; texto: string }) {
  const { pendiente, error, ejecutar } = useAccion();
  const [n, setN] = useState(nota ? String(nota) : "");
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={sinVaciar((fd) => ejecutar(() => evaluarManual(id, Number(n), String(fd.get("t") ?? "")), "Evaluación guardada"))}>
      <Desplegable value={n} onChange={(e) => setN(e.target.value)} className="campo w-auto py-1" aria-label="Nota de 1 a 10"><option value="">Nota…</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</Desplegable>
      <input name="t" defaultValue={texto} className="campo w-56 py-1" placeholder="Comentario (opcional)" aria-label="Comentario" />
      <button className="btn-secundario px-2 py-1 text-xs" disabled={pendiente || !n}>Guardar</button>
      {nota !== null && <span className="text-xs text-ok">Evaluada</span>}
      {error && <span className="text-xs text-mal">{error}</span>}
    </form>
  );
}

// Configurar IA en 4 pasos: 1 alcance (general o un programa) · 2 contexto del negocio · 3 agentes · 4 revisión
type Config = { producto_id: string | null; contexto: string | null; agentes: ConfigAgentes };
export function ConfigurarIa({ configs, productos }: { configs: Config[]; productos: { id: string; nombre: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState(1);
  const [alcance, setAlcance] = useState<string>("");
  const de = (a: string) => configs.find((c) => (c.producto_id ?? "") === a);
  const [contexto, setContexto] = useState("");
  const [agentes, setAgentes] = useState<ConfigAgentes>({});
  const { pendiente, error, ejecutar } = useAccion();
  const elegir = (a: string) => {
    setAlcance(a);
    setContexto(de(a)?.contexto ?? "");
    setAgentes(de(a)?.agentes ?? {});
  };
  const cambiar = (v: Agente, x: { activo?: boolean; instrucciones?: string | null }) => setAgentes((s) => ({ ...s, [v]: { ...s[v], ...x } }));
  const nombreAlcance = alcance ? productos.find((p) => p.id === alcance)?.nombre ?? "Programa" : "General";
  const personalizados = AGENTES.filter((a) => agentes[a.v]?.instrucciones?.trim());
  const apagados = AGENTES.filter((a) => agentes[a.v]?.activo === false);
  const PASOS = ["Alcance", "Contexto", "Agentes", "Revisión"];
  return (
    <>
      <button className="btn-secundario" onClick={() => { elegir(""); setPaso(1); setAbierto(true); }}><Settings2 className="h-4 w-4" /> Configurar IA</button>
      {abierto && (
        <Modal titulo="Configurar el análisis IA" onCerrar={() => setAbierto(false)} ancho="max-w-2xl">
          <div className="space-y-4 text-sm">
            <div className="flex gap-1">{PASOS.map((t, i) => <button key={t} onClick={() => setPaso(i + 1)} className={`flex-1 rounded-md px-2 py-1.5 text-xs ${paso === i + 1 ? "bg-primario text-white" : paso > i + 1 ? "bg-ok-suave text-ok" : "bg-panel-2 text-texto-2"}`}>{i + 1}. {t}</button>)}</div>
            {paso === 1 && (
              <div className="space-y-2">
                <p className="text-texto-2">¿Para qué llamadas es esta configuración? La de un programa manda sobre la general.</p>
                {[{ id: "", nombre: "General (todas las llamadas)" }, ...productos].map((p) => (
                  <label key={p.id || "g"} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 ${alcance === p.id ? "border-ok bg-ok-suave" : "border-borde"}`}>
                    <input type="radio" className="sr-only" checked={alcance === p.id} onChange={() => elegir(p.id)} /> {p.nombre} {de(p.id) && <span className="text-xs text-ok">· configurado</span>}
                  </label>
                ))}
              </div>
            )}
            {paso === 2 && (
              <div className="space-y-2">
                <label className="etiqueta-campo" htmlFor="ia-contexto">Contexto del negocio · {nombreAlcance}</label>
                <textarea id="ia-contexto" rows={9} value={contexto} onChange={(e) => setContexto(e.target.value)} className="campo" placeholder="Qué vendéis, a quién, precio, objeciones típicas, cómo es una buena llamada…" />
                <p className="text-xs text-texto-3">{alcance ? "Si lo dejas vacío, se usa el de la configuración general." : "Lo leerá la IA en cada análisis."}</p>
              </div>
            )}
            {paso === 3 && (
              <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {AGENTES.map((a) => {
                  const x = agentes[a.v] ?? {};
                  const propio = x.instrucciones !== undefined && x.instrucciones !== null;
                  return (
                    <div key={a.v} className={`rounded-lg border border-borde p-3 ${x.activo === false ? "opacity-60" : ""}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex flex-1 items-center gap-2 font-medium"><input type="checkbox" className="interruptor" checked={x.activo !== false} onChange={(e) => cambiar(a.v, { activo: e.target.checked })} /> {a.t}</label>
                        <div className="flex rounded-md bg-panel-2 p-0.5 text-xs">
                          <button type="button" onClick={() => cambiar(a.v, { instrucciones: null })} className={`rounded px-2 py-1 ${!propio ? "bg-primario text-white" : "text-texto-2"}`}>Predeterminado</button>
                          <button type="button" onClick={() => cambiar(a.v, { instrucciones: x.instrucciones ?? a.d })} className={`rounded px-2 py-1 ${propio ? "bg-primario text-white" : "text-texto-2"}`}>Personalizar</button>
                        </div>
                      </div>
                      {propio ? <textarea rows={3} value={x.instrucciones ?? ""} onChange={(e) => cambiar(a.v, { instrucciones: e.target.value })} className="campo mt-2" aria-label={`Instrucciones de ${a.t}`} /> : <p className="mt-1 text-xs text-texto-3">{a.d}</p>}
                    </div>
                  );
                })}
              </div>
            )}
            {paso === 4 && (
              <dl className="space-y-2 rounded-lg border border-borde p-3">
                <div className="flex justify-between gap-4"><dt className="text-texto-2">Alcance</dt><dd className="font-medium">{nombreAlcance}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-texto-2">Contexto del negocio</dt><dd>{contexto.trim() ? `${contexto.trim().slice(0, 60)}${contexto.trim().length > 60 ? "…" : ""}` : "sin definir"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-texto-2">Agentes activos</dt><dd>{AGENTES.length - apagados.length} de {AGENTES.length}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-texto-2">Personalizados</dt><dd>{personalizados.length ? personalizados.map((a) => a.t).join(", ") : "ninguno"}</dd></div>
                <p className="pt-2 text-xs text-texto-3">Los cambios valen para los <b>próximos análisis</b>; las llamadas ya analizadas no cambian solas (usa «Re-analizar» en cada una).</p>
              </dl>
            )}
            {error && <p className="text-mal">{error}</p>}
            <div className="flex justify-between gap-2">
              <button className="btn-secundario" disabled={paso === 1} onClick={() => setPaso(paso - 1)}>Atrás</button>
              {paso < 4 ? <button className="btn-primario" onClick={() => setPaso(paso + 1)}>Continuar</button> : <button className="btn-primario" disabled={pendiente} onClick={() => ejecutar(async () => { const r = await guardarConfigIa(alcance || null, contexto, agentes); if (!(r && typeof r === "object" && "error" in r)) setAbierto(false); return r; }, "Configuración guardada")}><Check className="h-4 w-4" /> Guardar</button>}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
