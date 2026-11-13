"use client";

import { useState, useSyncExternalStore } from "react";
import { Plus, X, Copy } from "lucide-react";
import { useAccion } from "@/components/acciones-lead";
import { NOMBRES_DIAS, PLANTILLAS, deplantilla, horaEnOtraZona, type Horario, type Tramo } from "@/lib/horarios";
import { guardarHorario } from "@/app/(panel)/perfil/acciones";
import { nombreZona } from "@/lib/zona-persona";

type Semana = Record<number, Tramo[]>;
type Fechas = Record<string, Tramo[]>;
const NOMBRE_ZONA: Record<string, string> = { "America/New_York": "Nueva York", "Europe/Madrid": "Madrid" };
// El campo de hora no admite «24:00»: se enseña como 23:59
const aCampo = (hm: string) => (hm === "24:00" ? "23:59" : hm);
// La zona de quien mira (la de su ordenador o móvil) solo se sabe en el navegador; en el servidor, null
const sinCambios = () => () => {};
const zonaDelAparato = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};
const hoyYmd = () => new Date().toISOString().slice(0, 10);

// Horario como los calendarios de GHL (bloque 1 de 1.0): varios tramos por día (los huecos son los descansos)
// y fechas sueltas (libre o con otro horario) que mandan sobre la semana. Siempre en la hora del proyecto,
// con la hora de quien mira al lado (la de su ordenador o móvil) si es distinta.
// - Con `perfilId`: botón «Guardar horario» (Mi perfil y Administración).
// - Con `campo`: escribe el horario en un campo oculto de un formulario (onboarding).
// - N2: con `zonaVer` (la zona que eligió el caller o closer en «Mi perfil»), «tu hora» es la de esa zona y no la del aparato.
export function EditorHorario({ inicial, zona, perfilId, campo, plantillas = false, zonaVer }: { inicial: Horario; zona: string; perfilId?: string; campo?: string; plantillas?: boolean; zonaVer?: string | null }) {
  const [semana, setSemana] = useState<Semana>(inicial?.semana ?? {});
  const [fechas, setFechas] = useState<Fechas>(inicial?.fechas ?? {});
  const zonaAparato = useSyncExternalStore(sinCambios, zonaDelAparato, () => null);
  const zonaLocal = zonaVer || zonaAparato;
  const [nuevaFecha, setNuevaFecha] = useState("");
  const { pendiente, error, ejecutar } = useAccion();

  const horario = { semana, fechas };
  const hayTramos = Object.values(semana).some((t) => t.length);
  const ref = hoyYmd();
  const local = (hm: string, ymd = ref) => (zonaLocal ? horaEnOtraZona(hm, ymd, zona, zonaLocal) : null);

  const ponDia = (d: number, t: Tramo[]) => setSemana((s) => ({ ...s, [d]: t }));
  const ponFecha = (f: string, t: Tramo[]) => setFechas((s) => ({ ...s, [f]: t }));
  const quitaFecha = (f: string) => setFechas((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== f)));
  const usarPlantilla = (v: string) => {
    const h = deplantilla(v);
    if (h) setSemana(h.semana);
  };
  const copiarLaV = (d: number) => setSemana((s) => ({ ...s, ...Object.fromEntries([1, 2, 3, 4, 5].map((x) => [x, (s[d] ?? []).map((t) => ({ ...t }))])) }));

  return (
    <div className="space-y-4">
      <p className="text-xs text-texto-3">
        Horas de <b className="text-texto-2">{NOMBRE_ZONA[zona] ?? zona}</b> (la hora del proyecto)
        {zonaLocal && zonaLocal !== zona && local("12:00") && <> · al lado, en gris, <b className="text-texto-2">tu hora</b> ({nombreZona(zonaLocal)})</>}. Los huecos entre tramos son los descansos.
      </p>

      {plantillas && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Horarios rápidos">
          {PLANTILLAS.map((p) => (
            <button key={p.v} type="button" className="btn-secundario px-3 py-1.5 text-xs" onClick={() => usarPlantilla(p.v)}>{p.t}</button>
          ))}
          <span className="self-center text-xs text-texto-3">de lunes a viernes; luego ajústalo como quieras</span>
        </div>
      )}

      <div className="space-y-1.5">
        {NOMBRES_DIAS.map((nombre, i) => {
          const d = i + 1;
          const tramos = semana[d] ?? [];
          return (
            <div key={d} className="flex flex-wrap items-start gap-2 rounded-lg border border-borde bg-panel-2 px-3 py-2 text-sm">
              <span className="w-24 pt-1.5 font-medium">{nombre}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {!tramos.length && <span className="pt-1.5 text-texto-3">Libre</span>}
                {tramos.map((t, k) => (
                  <FilaTramo key={k} tramo={t} local={local} onCambio={(n) => ponDia(d, tramos.map((x, j) => (j === k ? n : x)))} onQuitar={() => ponDia(d, tramos.filter((_, j) => j !== k))} etiqueta={`${nombre}, tramo ${k + 1}`} />
                ))}
              </div>
              <div className="flex gap-1">
                <button type="button" className="rounded p-1.5 text-texto-3 hover:bg-panel hover:text-texto" onClick={() => ponDia(d, [...tramos, siguienteTramo(tramos)])} aria-label={`Añadir tramo el ${nombre}`} title="Añadir tramo"><Plus className="h-4 w-4" /></button>
                {tramos.length > 0 && d <= 5 && (
                  <button type="button" className="rounded p-1.5 text-texto-3 hover:bg-panel hover:text-texto" onClick={() => copiarLaV(d)} aria-label={`Copiar el ${nombre} de lunes a viernes`} title="Copiar este día de lunes a viernes"><Copy className="h-4 w-4" /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <div className="etiqueta-campo">Días sueltos (vacaciones, festivos, un día con otro horario)</div>
        {Object.keys(fechas).sort().map((f) => (
          <div key={f} className="flex flex-wrap items-start gap-2 rounded-lg border border-borde bg-panel-2 px-3 py-2 text-sm">
            <span className="w-24 pt-1.5 font-medium">{new Date(`${f}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {!fechas[f].length && <span className="pt-1.5 text-texto-3">Libre todo el día</span>}
              {fechas[f].map((t, k) => (
                <FilaTramo key={k} tramo={t} local={(hm) => local(hm, f)} onCambio={(n) => ponFecha(f, fechas[f].map((x, j) => (j === k ? n : x)))} onQuitar={() => ponFecha(f, fechas[f].filter((_, j) => j !== k))} etiqueta={`${f}, tramo ${k + 1}`} />
              ))}
            </div>
            <div className="flex gap-1">
              <button type="button" className="rounded p-1.5 text-texto-3 hover:bg-panel hover:text-texto" onClick={() => ponFecha(f, [...fechas[f], siguienteTramo(fechas[f])])} aria-label={`Añadir tramo el ${f}`} title="Trabajar ese día con otro horario"><Plus className="h-4 w-4" /></button>
              <button type="button" className="rounded p-1.5 text-texto-3 hover:bg-panel hover:text-mal" onClick={() => quitaFecha(f)} aria-label={`Quitar el día ${f}`} title="Quitar este día"><X className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={nuevaFecha} min={ref} onChange={(e) => setNuevaFecha(e.target.value)} className="campo w-auto py-1" aria-label="Fecha suelta" />
          <button type="button" className="btn-secundario px-3 py-1.5 text-xs" disabled={!nuevaFecha || !!fechas[nuevaFecha]} onClick={() => { ponFecha(nuevaFecha, []); setNuevaFecha(""); }}>Añadir día libre</button>
          <span className="text-xs text-texto-3">Luego, con «+», puedes ponerle otro horario a ese día.</span>
        </div>
      </div>

      {campo && <input type="hidden" name={campo} value={JSON.stringify(horario)} />}
      {!hayTramos && <p className="text-xs text-aviso">Pon al menos un tramo en algún día.</p>}
      {perfilId && (
        <button type="button" className="btn-primario" disabled={pendiente || !hayTramos} onClick={() => ejecutar(() => guardarHorario(perfilId, horario), "Horario guardado")}>Guardar horario</button>
      )}
      {error && <p className="text-xs text-mal">{error}</p>}
    </div>
  );
}

// Un tramo nuevo empieza una hora después del último (o a las 9:00)
function siguienteTramo(tramos: Tramo[]): Tramo {
  const ultimo = tramos[tramos.length - 1];
  if (!ultimo) return { desde: "09:00", hasta: "13:00" };
  const h = Math.min(22, Number(ultimo.hasta.slice(0, 2)) + 1);
  return { desde: `${String(h).padStart(2, "0")}:00`, hasta: `${String(h + 1).padStart(2, "0")}:00` };
}

function FilaTramo({ tramo, local, onCambio, onQuitar, etiqueta }: { tramo: Tramo; local: (hm: string) => string | null; onCambio: (t: Tramo) => void; onQuitar: () => void; etiqueta: string }) {
  const ld = local(tramo.desde);
  const lh = local(tramo.hasta);
  const mal = tramo.desde >= tramo.hasta;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="time" value={aCampo(tramo.desde)} onChange={(e) => onCambio({ ...tramo, desde: e.target.value })} className={`campo w-auto py-1 ${mal ? "border-mal" : ""}`} aria-label={`${etiqueta}: desde`} />
      <span className="text-texto-3">a</span>
      <input type="time" value={aCampo(tramo.hasta)} onChange={(e) => onCambio({ ...tramo, hasta: e.target.value })} className={`campo w-auto py-1 ${mal ? "border-mal" : ""}`} aria-label={`${etiqueta}: hasta`} />
      <button type="button" className="rounded p-1 text-texto-3 hover:bg-panel hover:text-mal" onClick={onQuitar} aria-label={`Quitar ${etiqueta}`}><X className="h-3.5 w-3.5" /></button>
      {ld && lh && <span className="text-xs text-texto-3">{ld}–{lh} tu hora</span>}
      {mal && <span className="text-xs text-mal">La hora de inicio va antes que la de fin</span>}
    </div>
  );
}
