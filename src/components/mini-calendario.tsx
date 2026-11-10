"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
const HORAS = Array.from({ length: 30 }, (_, k) => `${String(8 + Math.floor(k / 2)).padStart(2, "0")}:${k % 2 ? "30" : "00"}`); // 08:00 a 22:30

// «Llamar luego» (Cristian, 10 nov 2026): minicalendario opcional para decir cuándo volver a llamar. Días desde hoy
// (en la hora del navegador del caller) y una hora cada media hora. Deja `name` = «AAAA-MM-DDTHH:MM» o vacío.
export function MiniCalendario({ name }: { name: string }) {
  const ahora = new Date();
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
  const [mes, setMes] = useState({ y: ahora.getFullYear(), m: ahora.getMonth() + 1 });
  const [dia, setDia] = useState<string | null>(null);
  const [hora, setHora] = useState("10:00");

  const { y, m } = mes;
  const primero = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
  const enMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ymd = (d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const esMesActual = y === ahora.getFullYear() && m === ahora.getMonth() + 1;
  const mover = (paso: number) => setMes(({ y, m }) => ({ y: y + Math.floor((m - 1 + paso) / 12), m: ((m - 1 + paso + 12) % 12) + 1 }));

  return (
    <div className="space-y-2">
      <span className="etiqueta-campo">¿Cuándo le llamas? (opcional)</span>
      <input type="hidden" name={name} value={dia ? `${dia}T${hora}` : ""} />
      <div className="flex items-center justify-between">
        <b className="text-sm">{MESES[m - 1]} {y}</b>
        <div className="flex gap-1">
          <button type="button" className="grid h-7 w-7 place-items-center rounded-lg border border-borde bg-panel-2 text-texto-2 disabled:opacity-40" disabled={esMesActual} onClick={() => mover(-1)} aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" className="grid h-7 w-7 place-items-center rounded-lg border border-borde bg-panel-2 text-texto-2" onClick={() => mover(1)} aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DIAS.map((d) => <span key={d} className="text-center text-[10.5px] font-bold text-texto-3">{d}</span>)}
        {Array.from({ length: primero }, (_, k) => <i key={`v${k}`} />)}
        {Array.from({ length: enMes }, (_, k) => {
          const f = ymd(k + 1);
          const pasado = f < hoy;
          const on = dia === f;
          return (
            <button
              key={f}
              type="button"
              disabled={pasado}
              aria-pressed={on}
              aria-label={`${k + 1} de ${MESES[m - 1].toLowerCase()}${f === hoy ? ", hoy" : ""}`}
              onClick={() => setDia(on ? null : f)}
              className={`relative rounded-lg border py-1.5 text-[12px] font-semibold tabular-nums transition-colors ${on ? "border-transparent bg-primario-boton text-white" : pasado ? "cursor-not-allowed border-transparent font-normal text-texto-3" : "border-borde bg-panel-2 hover:border-primario"}`}
            >
              {k + 1}
              {f === hoy && <span className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${on ? "bg-white" : "bg-primario"}`} />}
            </button>
          );
        })}
      </div>
      {dia && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-texto-2">Hora</span>
          <select className="campo w-auto py-1.5" value={hora} onChange={(e) => setHora(e.target.value)}>
            {HORAS.map((h) => <option key={h}>{h}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
