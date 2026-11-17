"use client";

import { useState } from "react";
import { useAccion } from "@/components/acciones-lead";
import { Seccion } from "@/components/ui";
import type { ConfigReporte, MercadoReporte, ParteReporte } from "@/lib/tipos";
import { guardarConfigReporte } from "./acciones-reporte";

// Fase C (reporte diario): en pantalla nunca «Latam»; el mercado «latam» es el equipo de USA.
const NOMBRE: Record<MercadoReporte, string> = { es: "España", latam: "USA" };
// Las zonas son las de ZONA_REPORTE (lib/reporte-config.ts, que no se puede importar aquí: lee la base)
const ZONA_TEXTO: Record<MercadoReporte, string> = { es: "hora de Madrid", latam: "hora de Nueva York" };
const PARTES: { v: ParteReporte; t: string }[] = [
  { v: "por_persona", t: "Por persona" },
  { v: "totales_dia", t: "Totales del día" },
  { v: "totales_mes", t: "Totales del mes" },
  { v: "va_mal", t: "Lo que va mal" },
  { v: "objetivos", t: "Objetivos" },
];
const HORAS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

// Uno por línea (los emails también separados por comas o espacios; los WhatsApp pueden llevar espacios dentro)
const lineas = (texto: string, separador: RegExp) => texto.split(separador).map((x) => x.trim()).filter(Boolean);

function FormReporte({ inicial }: { inicial: ConfigReporte }) {
  const { mercado } = inicial;
  const [activo, setActivo] = useState(inicial.activo);
  const [hora, setHora] = useState(inicial.hora);
  const [emails, setEmails] = useState(inicial.emails.join("\n"));
  const [whatsapps, setWhatsapps] = useState(inicial.whatsapps.join("\n"));
  const [partes, setPartes] = useState<ParteReporte[]>(inicial.partes);
  const { pendiente, error, ejecutar } = useAccion();
  const id = (campo: string) => `reporte-${mercado}-${campo}`;
  const cambiarParte = (p: ParteReporte, si: boolean) => setPartes(si ? [...partes, p] : partes.filter((x) => x !== p));
  const guardar = () =>
    ejecutar(
      () => guardarConfigReporte(mercado, { activo, hora, emails: lineas(emails, /[\s,;]+/), whatsapps: lineas(whatsapps, /[\n,;]+/), partes }),
      `Reporte de ${NOMBRE[mercado]} guardado`
    );

  return (
    <Seccion titulo={`Reporte de ${NOMBRE[mercado]}`}>
      <div className="space-y-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="interruptor" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          {activo ? "Encendido: se manda cada día" : "Apagado: no se manda"}
        </label>
        <div>
          <label htmlFor={id("hora")} className="mb-1 block font-medium">Hora de envío</label>
          <div className="flex items-center gap-2">
            <select id={id("hora")} className="campo w-28" value={hora} onChange={(e) => setHora(e.target.value)}>
              {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="text-xs text-texto-3">{ZONA_TEXTO[mercado]}</span>
          </div>
        </div>
        <div>
          <label htmlFor={id("emails")} className="mb-1 block font-medium">Emails (uno por línea, de 1 a 10)</label>
          <textarea id={id("emails")} className="campo min-h-20 w-full" value={emails} onChange={(e) => setEmails(e.target.value)} />
        </div>
        <div>
          <label htmlFor={id("whatsapps")} className="mb-1 block font-medium">WhatsApp (uno por línea, con «+» y el prefijo; hasta 10)</label>
          <textarea id={id("whatsapps")} className="campo min-h-16 w-full" value={whatsapps} placeholder="+34600111222" onChange={(e) => setWhatsapps(e.target.value)} />
          <p className="mt-1 text-xs text-aviso-texto">Se mandará cuando esté la Fase D.</p>
        </div>
        <fieldset>
          <legend className="mb-1 font-medium">Qué lleva</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {PARTES.map((p) => (
              <label key={p.v} className="flex items-center gap-1.5">
                <input type="checkbox" className="accent-[var(--primario)]" checked={partes.includes(p.v)} onChange={(e) => cambiarParte(p.v, e.target.checked)} />
                {p.t}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="text-xs text-mal">{error}</p>}
        <button type="button" className="btn-primario" disabled={pendiente} onClick={guardar}>
          {pendiente ? "Guardando…" : `Guardar reporte de ${NOMBRE[mercado]}`}
        </button>
      </div>
    </Seccion>
  );
}

// La pestaña «Reporte» de Administración: el reporte diario de cada mercado (España y USA)
export function PantallaReporte({ configs }: { configs: Record<MercadoReporte, ConfigReporte> }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-texto-2">El reporte diario de ventas que se manda solo, uno para el equipo de España y otro para el de USA. Cada uno con su hora, a quién le llega y qué partes lleva.</p>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {(["es", "latam"] as const).map((m) => (
          <FormReporte key={`${m}-${JSON.stringify(configs[m])}`} inicial={configs[m]} />
        ))}
      </div>
    </div>
  );
}
