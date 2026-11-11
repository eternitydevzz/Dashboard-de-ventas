// Workflows 4b (docs/plan-workflows.md; boceto glass aprobado por Cristian el 7 nov 2026): Administración → Workflows.
// Solo lectura: la lista, el lienzo (cajas de arriba abajo, ramas una al lado de otra; en el móvil, una debajo de otra) y
// el historial de los últimos 50 leads. Sin JavaScript en el navegador: se elige el workflow con un enlace (?wf=).
import Link from "next/link";
import { AlertTriangle, Check, Clock, FlaskConical, GitBranch, MoveRight, Pencil, RefreshCw, Tag, Target, User, Wrench, X, Zap } from "lucide-react";
import { Kpi } from "@/components/ui";
import { BorrarWorkflow } from "./entradas-workflow";
import type { Paso, Disparador } from "@/lib/workflows";
import { coincidenTexto, condicionTexto, describirPaso, disparadorTexto, estadoEjecucion, pasosDelRegistro, verboCoincide, type Icono, type Nombres, type Tono } from "@/lib/workflows-vista";
import type { ResumenWorkflow } from "@/lib/workflows-motor";
import { fechaHora } from "@/lib/formato";
import type { Proyecto } from "@/lib/tipos";
import { NuevoWorkflowCita } from "./workflows-editor";

export type WorkflowFila = { id: string; nombre: string; disparador: Disparador; pasos: Paso[]; modo: string; encendido: boolean; version: number };
export type EjecucionFila = { id: string; estado: string; coincide: boolean | null; creado_en: string; siguiente_en: string; registro: { tipo?: string; pasos?: string[]; hora?: string; diferencias?: string[] }[]; quien: string };

const ICONOS: Record<Icono, { C: typeof Zap; color: string }> = {
  rayo: { C: Zap, color: "from-[#5b78ff] to-[#2341c8]" },
  reloj: { C: Clock, color: "from-[#9aa3b8] to-[#5d6679]" },
  persona: { C: User, color: "from-[#ffb35c] to-[#e46a00]" },
  etiqueta: { C: Tag, color: "from-[#ff8ab5] to-[#d63a78]" },
  diana: { C: Target, color: "from-[#4ade80] to-[#0e7a45]" },
  rama: { C: GitBranch, color: "from-[#a78bfa] to-[#6d28d9]" },
  mover: { C: MoveRight, color: "from-[#5ec8ff] to-[#0b72c4]" },
};
function Cuadro({ icono, chico }: { icono: Icono; chico?: boolean }) {
  const { C, color } = ICONOS[icono];
  return (
    <span aria-hidden className={`grid flex-none place-items-center bg-gradient-to-b text-white shadow-sm ${color} ${chico ? "h-8 w-8 rounded-[10px]" : "h-9 w-9 rounded-[11px]"}`}>
      <C className="h-[18px] w-[18px]" strokeWidth={2.2} />
    </span>
  );
}

const TONOS: Record<Tono, string> = { ok: "bg-ok-suave text-ok", mal: "bg-mal-suave text-mal", espera: "bg-panel-2 text-texto-2 ring-1 ring-borde", neutro: "bg-panel-2 text-texto-3 ring-1 ring-borde" };
function Chip({ tono, children }: { tono: Tono | "prueba"; children: React.ReactNode }) {
  const c = tono === "prueba" ? "bg-aviso-suave text-aviso" : TONOS[tono];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c}`}>{children}</span>;
}
function ChipModo({ w, r }: { w: WorkflowFila; r?: ResumenWorkflow }) {
  if (!w.encendido) return <Chip tono="neutro">Parado</Chip>;
  if (w.modo === "real") return <Chip tono="ok"><Zap className="h-3 w-3" /> Real · manda a GHL</Chip>;
  // Cita: en prueba no se compara con nada (B3); se cuentan las citas que han pasado. Etiqueta (A3): igual, con leads
  if (w.disparador.tipo === "etiqueta") return <Chip tono="prueba"><FlaskConical className="h-3 w-3" /> En prueba · {r?.total ? `${r.total} ${r.total === 1 ? "lead" : "leads"}` : "esperando el primer lead"}</Chip>;
  if (w.disparador.tipo === "cita") return <Chip tono="prueba"><FlaskConical className="h-3 w-3" /> En prueba · {r?.total ? `${r.total} ${r.total === 1 ? "cita" : "citas"}` : "esperando la primera cita"}</Chip>;
  const hechos = (r?.coinciden ?? 0) + (r?.no_coinciden ?? 0);
  return <Chip tono="prueba"><FlaskConical className="h-3 w-3" /> En prueba · {hechos ? coincidenTexto(r?.coinciden ?? 0, hechos) : "esperando el primer lead"}</Chip>;
}

// ---------- Lienzo ----------
const Une = () => <span aria-hidden className="relative block h-6 w-0.5 bg-primario/30 after:absolute after:-bottom-1 after:left-1/2 after:h-2 after:w-2 after:-translate-x-1/2 after:rounded-full after:border-2 after:border-primario/45 after:bg-panel" />;
function Nodo({ icono, clave, titulo, detalle, disparador }: { icono: Icono; clave: string; titulo: string; detalle?: string | null; disparador?: boolean }) {
  return (
    <div className={`vidrio flex w-full max-w-[300px] items-center gap-3 rounded-[18px] border px-3.5 py-3 shadow-[0_10px_28px_rgb(15_23_42/0.08)] ${disparador ? "border-primario/35 ring-4 ring-primario/10" : "border-borde"}`}>
      <Cuadro icono={icono} chico />
      <div className="min-w-0">
        <div className="text-[11.5px] font-semibold text-texto-3">{clave}</div>
        <div className="break-words text-sm font-semibold leading-snug">{titulo}</div>
        {detalle && <div className="break-words text-xs text-texto-3">{detalle}</div>}
      </div>
    </div>
  );
}
function Pasos({ pasos, n }: { pasos: Paso[]; n: Nombres }) {
  return (
    <>
      {pasos.map((p) => {
        const c = describirPaso(p, n);
        if (p.tipo !== "rama")
          return (
            <div key={p.id} className="flex w-full flex-col items-center">
              <Une />
              <Nodo {...c} />
            </div>
          );
        const caminos = [...p.caminos.map((x) => ({ etiqueta: condicionTexto(x.condicion), pasos: x.pasos, no: false })), { etiqueta: "si no", pasos: p.si_no, no: true }];
        return (
          <div key={p.id} className="flex w-full flex-col items-center">
            <Une />
            <Nodo {...c} />
            <div className="relative mt-0 flex w-full flex-col items-center gap-4 sm:mt-5 sm:flex-row sm:items-start sm:justify-center sm:before:absolute sm:before:-top-5 sm:before:left-[16%] sm:before:right-[16%] sm:before:h-5 sm:before:rounded-t-2xl sm:before:border-2 sm:before:border-b-0 sm:before:border-primario/25">
              {caminos.map((cm, i) => (
                <div key={i} className="flex w-full min-w-0 max-w-[300px] flex-1 flex-col items-center">
                  <Une />
                  <span className={`mb-2.5 whitespace-nowrap rounded-full border border-borde bg-panel px-3 py-1 text-xs font-semibold shadow-sm ${cm.no ? "text-texto-3" : "text-primario"}`}>{cm.etiqueta}</span>
                  {cm.pasos.length ? <Pasos pasos={cm.pasos} n={n} /> : <span className="text-xs text-texto-3">Nada</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function VistaWorkflows({
  workflows,
  resumen,
  elegido,
  ejecuciones,
  nombres,
  proyecto,
  editor,
}: {
  workflows: WorkflowFila[];
  resumen: Map<string, ResumenWorkflow>;
  elegido: WorkflowFila | null;
  ejecuciones: EjecucionFila[];
  nombres: Nombres;
  proyecto: Pick<Proyecto, "zona_horaria">;
  editor?: React.ReactNode; // 4c: el editor, en lugar del lienzo de solo lectura
}) {
  if (!workflows.length)
    return (
      <section className="tarjeta p-6 text-sm text-texto-2">
        <p className="font-semibold text-texto">Todavía no hay workflows.</p>
        <p className="mt-1">Los de una Entrada se crean con «Probar como workflow» en su tarjeta (pestaña Entradas). Los de cita o de etiqueta, aquí:</p>
        <div className="mt-3"><NuevoWorkflowCita /></div>
      </section>
    );
  const r = elegido ? resumen.get(elegido.id) : undefined;
  const disp = elegido ? disparadorTexto(elegido.disparador, nombres) : null;
  // Rediseño (maqueta v1, Cristian 11 nov 2026): el resumen de todos arriba
  const suma = (c: keyof ResumenWorkflow) => workflows.reduce((s, w) => s + (resumen.get(w.id)?.[c] ?? 0), 0);
  const parados = workflows.filter((w) => !w.encendido).length;
  return (
    <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <Kpi compacto titulo="Workflows" valor={String(workflows.length)} icono={Zap} detalle={parados ? `${parados} ${parados === 1 ? "parado" : "parados"}` : "todos en marcha"} />
      <Kpi compacto titulo="En real" valor={String(workflows.filter((w) => w.encendido && w.modo === "real").length)} icono={Check} tono="ok" detalle="mandan a GHL" />
      <Kpi compacto titulo="En prueba" valor={String(workflows.filter((w) => w.encendido && w.modo === "prueba").length)} icono={FlaskConical} tono="aviso" detalle="sin tocar GHL" />
      <Kpi compacto titulo="Leads procesados" valor={suma("total").toLocaleString("es-ES")} icono={RefreshCw} detalle={`${suma("esperando")} esperando`} />
      <Kpi compacto titulo="Con error" valor={String(suma("errores"))} icono={AlertTriangle} tono="mal" detalle={suma("errores") ? "revisar" : "todo en orden"} />
    </div>
    <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="tarjeta min-w-0 p-4 sm:p-5">
        <div className="mb-3 text-xs font-semibold text-texto-3">Workflows · {workflows.length}</div>
        <nav className="space-y-1">
          {workflows.map((w) => {
            const rw = resumen.get(w.id);
            return (
              // Rediseño (maqueta v1): la tarjeta abre el workflow; la llave lo edita y la «×» lo elimina (pregunta 2 veces)
              <div key={w.id} className={`relative rounded-[18px] p-3 transition-colors ${elegido?.id === w.id ? "bg-panel shadow-[0_6px_20px_rgb(35_65_200/0.10)] ring-1 ring-primario/40" : "hover:bg-panel-2"} ${w.encendido ? "" : "opacity-60"}`}>
                <div className="flex items-start gap-2">
                  <Link href={`/admin?tab=workflows&wf=${w.id}`} aria-current={elegido?.id === w.id ? "page" : undefined} className="min-w-0 flex-1 after:absolute after:inset-0 after:rounded-[18px]">
                    <div className="break-words text-sm font-semibold">{w.nombre}</div>
                    <div className="break-words text-xs text-texto-3">{w.disparador.tipo === "entrada" ? `Llega un lead a «${nombres.entradas[w.disparador.entrada_id] ?? "Entrada borrada"}»` : disparadorTexto(w.disparador, nombres).titulo}</div>
                  </Link>
                  <span className="relative z-10 flex shrink-0 items-center gap-1">
                    <Link href={`/admin?tab=workflows&wf=${w.id}&editar=1`} className="btn-secundario px-1.5 py-1 text-texto-2 hover:text-primario" aria-label={`Editar ${w.nombre}`} title="Editar el workflow"><Wrench className="h-3.5 w-3.5" /></Link>
                    <BorrarWorkflow id={w.id} nombre={w.nombre} esperando={rw?.esperando ?? 0} />
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {w.pasos.map((p, i) => {
                    const { C, color } = ICONOS[describirPaso(p, nombres).icono];
                    return (
                      <span key={p.id} className="flex items-center gap-1">
                        {i > 0 && <span aria-hidden className="text-[10px] text-texto-3">›</span>}
                        <span title={describirPaso(p, nombres).titulo} className={`grid h-6 w-6 place-items-center rounded-[7px] bg-gradient-to-b text-white ${color}`}><C className="h-3.5 w-3.5" strokeWidth={2.2} /></span>
                      </span>
                    );
                  })}
                  {!w.pasos.length && <span className="text-xs text-texto-3">Sin pasos</span>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <ChipModo w={w} r={rw} />
                  <span className="text-xs tabular-nums text-texto-3">{(rw?.total ?? 0).toLocaleString("es-ES")} leads · {rw?.errores ?? 0} con error · {rw?.esperando ?? 0} esperando</span>
                </div>
              </div>
            );
          })}
        </nav>
        <div className="mt-4 border-t border-borde pt-3"><NuevoWorkflowCita /></div>
        <p className="mt-3 px-1 text-xs leading-relaxed text-texto-3">Los de una Entrada se crean con «Probar como workflow» en su tarjeta. Encender, parar y pasar a real: con «Editar».</p>
      </aside>

      {elegido && disp && (
        <div className="grid min-w-0 gap-5">
          {editor ?? (
          <section className="tarjeta min-w-0 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words text-xl font-semibold tracking-tight">{elegido.nombre}</h2>
                <p className="text-sm text-texto-3">
                  {!elegido.encendido ? "Parado: no recibe leads" : elegido.disparador.tipo !== "entrada" ? (elegido.modo === "real" ? `Real: manda a GHL con cada ${elegido.disparador.tipo === "cita" ? "cita" : "lead"}` : "En prueba: apunta lo que haría, sin tocar GHL") : elegido.modo === "real" ? "Real: manda a GHL en lugar de «Qué hacer en GHL»" : "En prueba: calcula lo que haría y lo compara con lo de hoy, sin tocar GHL"}
                </p>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                {[
                  [r?.total ?? 0, "leads"],
                  [elegido.modo === "real" || elegido.disparador.tipo !== "entrada" ? (r?.errores ?? 0) : (r?.coinciden ?? 0), elegido.modo === "real" || elegido.disparador.tipo !== "entrada" ? "con error" : verboCoincide(r?.coinciden ?? 0)],
                  [r?.esperando ?? 0, "esperando"],
                ].map(([v, t]) => (
                  <div key={t as string} className="min-w-0 flex-1 rounded-2xl border border-borde bg-panel-2 px-3.5 py-2 sm:min-w-24 sm:flex-none">
                    <div className="text-xl font-semibold tabular-nums tracking-tight">{v}</div>
                    <div className="text-[11.5px] text-texto-3">{t}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-center rounded-[20px] border border-borde bg-panel-2 bg-[radial-gradient(rgb(15_23_42/0.10)_1px,transparent_1.2px)] [background-size:18px_18px] px-3 pb-8 pt-7">
              <Nodo icono="rayo" clave="Cuando" titulo={disp.titulo} detalle={disp.detalle} disparador />
              <Pasos pasos={elegido.pasos} n={nombres} />
            </div>
            <div className="mt-4 flex justify-end">
              <Link href={`/admin?tab=workflows&wf=${elegido.id}&editar=1`} className="btn-primario"><Pencil className="h-4 w-4" /> Editar</Link>
            </div>
          </section>
          )}

          <section className="tarjeta min-w-0 p-4 sm:p-5">
            <div className="mb-1 text-xs font-semibold text-texto-3">Historial · últimos 50 leads</div>
            {!ejecuciones.length ? (
              <p className="py-3 text-sm text-texto-3">Todavía no ha pasado ningún lead por este workflow.</p>
            ) : (
              <ul>
                {ejecuciones.map((e) => {
                  const est = estadoEjecucion(e);
                  const pasos = pasosDelRegistro(e.registro, proyecto.zona_horaria);
                  const dif = [...(e.registro ?? [])].reverse().find((x) => x.tipo === "comparacion")?.diferencias ?? [];
                  const ini = (e.quien.match(/[a-záéíóúñ]/gi) ?? ["?"]).slice(0, 2).join("").toUpperCase();
                  return (
                    <li key={e.id} className="flex flex-wrap items-start gap-3 border-t border-borde py-3 first:border-t-0">
                      <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-full bg-primario-suave text-xs font-semibold text-primario">{ini}</span>
                      <div className="min-w-0 flex-1">
                        <div className="break-all text-sm font-semibold">{e.quien}</div>
                        <div className="text-xs tabular-nums text-texto-3">
                          Llegó el {fechaHora(e.creado_en, proyecto)}
                          {e.estado === "esperando" && <> · siguiente paso: {fechaHora(e.siguiente_en, proyecto)}</>}
                        </div>
                        {pasos.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {pasos.map((p, i) => <span key={i} className="rounded-lg bg-panel-2 px-2 py-0.5 text-[11.5px] tabular-nums text-texto-2 ring-1 ring-borde">{p.hora} {p.texto}</span>)}
                          </div>
                        )}
                        {dif.length > 0 && <p className="mt-2 rounded-xl bg-mal-suave px-3 py-2 text-xs text-mal">{dif.join(" · ")}</p>}
                      </div>
                      <Chip tono={est.tono}>{est.tono === "ok" ? <Check className="h-3 w-3" /> : est.tono === "mal" ? <X className="h-3 w-3" /> : <Clock className="h-3 w-3" />} {est.texto}</Chip>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
    </div>
  );
}
