"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCw, User } from "lucide-react";
import { huecosAgendaRotacion } from "@/app/(panel)/leads/agenda";
import { nombreZona } from "@/lib/zona-persona";

type Dia = { ymd: string; horas: { t: string; v: string }[] }; // t: lo que se ve; v: lo que se envía
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["L", "M", "X", "J", "V", "S", "D"];

// «Agendado» del caller como la maqueta (plan Callers 7c.3; Cristian, 7 nov): un calendario con los días que tienen
// hueco y, al elegir uno, las horas libres del closer de la rotación (su horario y sus citas). Deja en el formulario
// `fecha` = «AAAA-MM-DDTHH:MM» en la hora del proyecto; el servidor vuelve a comprobar que sigue libre al guardar.
// N2: días y horas se ven en la zona de quien agenda (su «Mi perfil»).
export function CalendarioAgenda({ leadId }: { leadId?: string }) {
  const [datos, setDatos] = useState<{ closer: string; sinHorario: boolean; dias: Dia[]; zona: string } | null>(null);
  const [error, setError] = useState("");
  const [dia, setDia] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null); // el valor en hora del proyecto
  const [mes, setMes] = useState<string | null>(null); // «AAAA-MM» que se ve
  const [fallo, setFallo] = useState(false); // falló la red: «Reintentar» en vez de buscar para siempre
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    void huecosAgendaRotacion(leadId).then(
      (r) => {
        if (!vivo) return;
        if (!r || typeof r !== "object") return void setFallo(true);
        if ("error" in r) return setError(String(r.error));
        setDatos(r);
        setMes(r.dias[0]?.ymd.slice(0, 7) ?? null);
      },
      () => vivo && setFallo(true),
    );
    return () => {
      vivo = false;
    };
  }, [leadId, intento]);

  const conHueco = useMemo(() => new Map((datos?.dias ?? []).map((d) => [d.ymd, d.horas])), [datos]);
  const meses = useMemo(() => [...new Set((datos?.dias ?? []).map((d) => d.ymd.slice(0, 7)))], [datos]);
  const zona = datos?.zona ?? "UTC";
  const hoy = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date()), [zona]);

  if (error) return <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{error}</p>;
  if (fallo)
    return (
      <p className="py-6 text-center text-sm">
        <button type="button" className="inline-flex items-center gap-1 font-medium text-mal hover:underline" onClick={() => (setFallo(false), setIntento((n) => n + 1))}>
          <RotateCw className="h-3.5 w-3.5" /> No se pudo cargar · Reintentar
        </button>
      </p>
    );
  if (!datos) return <p className="py-6 text-center text-sm text-texto-3">Buscando las horas libres…</p>;
  if (!datos.dias.length)
    return <p className="rounded-lg bg-aviso-suave px-3 py-2 text-sm text-aviso-texto">{datos.sinHorario ? `${datos.closer} no tiene horario puesto: pídele que lo ponga en «Mi perfil».` : `${datos.closer} no tiene horas libres en las próximas 3 semanas.`}</p>;

  const [y, m] = (mes ?? meses[0]).split("-").map(Number);
  const primero = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
  const enMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const i = meses.indexOf(mes ?? meses[0]);
  const ymd = (d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      <input type="hidden" name="fecha" value={dia && hora ? hora : ""} required />
      <div className="flex items-center justify-between">
        <b>{MESES[m - 1]} {y}</b>
        <div className="flex gap-1">
          <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border border-borde bg-panel-2 text-texto-2 disabled:opacity-40" disabled={i <= 0} onClick={() => setMes(meses[i - 1])} aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border border-borde bg-panel-2 text-texto-2 disabled:opacity-40" disabled={i >= meses.length - 1} onClick={() => setMes(meses[i + 1])} aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DIAS.map((d) => <span key={d} className="pb-0.5 text-center text-[10.5px] font-bold text-texto-3">{d}</span>)}
        {Array.from({ length: primero }, (_, k) => <i key={`v${k}`} />)}
        {Array.from({ length: enMes }, (_, k) => {
          const f = ymd(k + 1);
          const libre = conHueco.has(f);
          const on = dia === f;
          return (
            <button
              key={f}
              type="button"
              disabled={!libre}
              aria-pressed={on}
              aria-label={`${k + 1} de ${MESES[m - 1].toLowerCase()}${f === hoy ? ", hoy" : ""}${libre ? "" : ", sin horas libres"}`}
              onClick={() => (setDia(f), setHora(null))}
              className={`relative rounded-lg border py-2 text-[12.5px] font-semibold tabular-nums transition-colors ${on ? "border-transparent bg-primario-boton text-white" : libre ? "border-borde bg-panel-2 hover:border-primario" : "cursor-not-allowed border-transparent font-normal text-texto-3"}`}
            >
              {k + 1}
              {f === hoy && <span className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${on ? "bg-white" : "bg-primario"}`} />}
            </button>
          );
        })}
      </div>
      <div>
        <span className="etiqueta-campo">Hora de {nombreZona(zona)}</span>
        {!dia ? (
          <p className="text-xs text-texto-3">Elige un día para ver sus horas libres.</p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {(conHueco.get(dia) ?? []).map((h) => (
              <button key={h.v} type="button" aria-pressed={hora === h.v} onClick={() => setHora(h.v)} className={`rounded-lg border py-2 text-[12.5px] font-semibold tabular-nums ${hora === h.v ? "border-transparent bg-primario-boton text-white" : "border-borde bg-panel-2 hover:border-primario"}`}>{h.t}</button>
            ))}
          </div>
        )}
      </div>
      <p className="flex gap-2 rounded-xl border border-borde bg-panel-2 px-3 py-2.5 text-xs text-texto-2">
        <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-texto-3" />
        <span><b>Closer:</b> lo pone la app con la rotación ({datos.closer}). Solo salen sus horas libres.</span>
      </p>
    </div>
  );
}
