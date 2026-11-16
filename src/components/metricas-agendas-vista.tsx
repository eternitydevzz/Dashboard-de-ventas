import Link from "next/link";
import { Star, Undo2, Hourglass, Target, Ticket } from "lucide-react";
import { pct } from "@/lib/formato";
import { Kpi, Seccion, Anillo } from "@/components/ui";
import { Embudo } from "@/components/embudo";
import type { MetricasAgendas } from "@/lib/metricas-agendas";

// Métricas de las agendas de los closers (13 oct 2026: se fusionan en KPIs → «Por persona»; antes, Agendas → Métricas).
// `enlaceCloser`: a dónde lleva el nombre de cada closer en la comparativa.
export function IndividualAgendas({ m, moneda: $ }: { m: MetricasAgendas; moneda: (n: number) => string }) {
  // Fase 5: el mismo embudo dibujado que en KPIs
  const pasos = [
    { t: "Agendadas", n: m.agendadas, d: "Citas del periodo" },
    { t: "Asistencias", n: m.asistencias, d: "Citas a las que vino el lead" },
    { t: "Cerradas", n: m.cerradas, d: "Citas cerradas con venta" },
  ];
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Seccion titulo="Embudo de conversión">
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-ok/30 bg-ok-suave p-3">
            <div className="text-xl font-semibold tabular-nums">{$(m.cash)}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ok">Cash collected</div>
            <div className="text-[11px] text-texto-3">cobrado, neto de devoluciones</div>
          </div>
          <div className="rounded-lg border border-oro/30 bg-oro-suave p-3">
            <div className="text-xl font-semibold tabular-nums">{$(m.facturacion)}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-oro">Facturación</div>
            <div className="text-[11px] text-texto-3">contratos cerrados</div>
          </div>
        </div>
        <Embudo titulo="Embudo de conversión" pasos={pasos} />
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-2">
          <span>Perdidas <b>{m.perdidas}</b></span>
          <span>No-show <b>{m.noShow}</b></span>
          <span>Reagendadas <b>{m.reagendadas}</b></span>
          <span>Canceladas <b>{m.canceladas}</b></span>
          <span>No califica <b>{m.noCalifica}</b></span>
        </div>
        <p className="mt-2 text-xs text-texto-3">Tasa de cierre <b className="text-texto">{pct(m.pctCierre)}</b> sobre asistencias</p>
      </Seccion>

      <div className="space-y-5">
        {/* Compactas y de 3 en 3 (Cristian, 26 oct): de 6 en una fila, los títulos se pisaban con el icono */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi compacto titulo="% cierre / asist." valor={`${pct(m.pctCierre)}`} icono={Target} tono="ok" detalle={`Call/close ${pct(m.pctCallClose)}`} />
          <Kpi compacto titulo="Ticket medio" valor={$(m.ticketMedio)} icono={Ticket} tono="oro" detalle="por venta cerrada" />
          <Kpi compacto titulo="Calificados 4★+" valor={m.calificados} icono={Star} tono="morado" detalle={`${m.con5} con 5★`} />
          <Kpi compacto titulo="Media estrellas" valor={m.mediaEstrellasCloser ?? "—"} icono={Star} tono="oro" detalle={`del closer · caller ${m.mediaEstrellasCaller ?? "—"}`} />
          <Kpi compacto titulo="Pendientes" valor={m.pendientes} icono={Hourglass} tono="aviso" detalle={`${m.perdidas} perd. · ${m.canceladas} canc.`} />
          <Kpi compacto titulo="Devoluciones" valor={m.devoluciones} icono={Undo2} tono="mal" detalle={`${pct(m.pctDevoluciones)} de las ventas · ${$(m.devuelto)}`} />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Seccion titulo="Agendas por fuente">
            <Barras titulo="Por pipeline" filas={m.porPipeline} />
            <div className="mt-5"><Barras titulo="Por UTM (utm_source)" filas={m.porUtm} /></div>
          </Seccion>
          <Seccion titulo="% Cierre">
            <div className="flex items-center gap-4">
              <Anillo valor={m.pctCierre} color="var(--ok)" tamano={92} />
              <ul className="flex-1 space-y-1 text-sm">
                {[["Cerradas", m.cerradas], ["Perdidas", m.perdidas], ["En seguimiento", m.seguimiento], ["No-show", m.noShow], ["Reagendadas", m.reagendadas], ["Canceladas", m.canceladas]].map(([t, n]) => (
                  <li key={t} className="flex justify-between"><span className="text-texto-2">{t}</span><b className="tabular-nums">{n}</b></li>
                ))}
              </ul>
            </div>
            <dl className="mt-4 divide-y divide-borde border-t border-borde text-sm">
              {[["Tasa de asistencia", `${pct(m.tasaAsistencia)}`], ["Tasa de cancelación", `${pct(m.tasaCancelacion)}`], ["Calificados 4★+", m.calificados], ["Ticket medio", $(m.ticketMedio)], ["Media de estrellas (closer)", m.mediaEstrellasCloser ?? "—"]].map(([t, v]) => (
                <div key={t} className="flex justify-between py-1.5"><dt className="text-texto-2">{t}</dt><dd className="font-medium tabular-nums">{v}</dd></div>
              ))}
            </dl>
          </Seccion>
        </div>
      </div>
    </div>
  );
}

function Barras({ titulo, filas }: { titulo: string; filas: { nombre: string; n: number }[] }) {
  const total = filas.reduce((s, f) => s + f.n, 0);
  const max = Math.max(...filas.map((f) => f.n), 1);
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-texto-2">{titulo}</div>
      {filas.length === 0 ? (
        <p className="text-sm text-texto-3">Sin agendas en este periodo.</p>
      ) : (
        <ul className="space-y-2">
          {filas.slice(0, 8).map((f) => (
            <li key={f.nombre} title={`${f.nombre}: ${f.n} (${pct(Math.round((f.n / total) * 100))})`}>
              <div className="flex justify-between text-sm"><span className="truncate">{f.nombre}</span><span className="tabular-nums text-texto-2">{f.n}</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-panel-2"><div className="h-full rounded-full bg-primario" style={{ width: `${Math.round((f.n / max) * 100)}%` }} /></div>
            </li>
          ))}
          {filas.length > 8 && <li className="text-xs text-texto-3">+ {filas.length - 8} fuentes más</li>}
        </ul>
      )}
    </div>
  );
}

export function ComparativaAgendas({ filas, moneda: $, enlaceCloser = (id) => `/kpis?vista=personas&closer=${id}` }: { filas: { c: { id: string; nombre: string }; m: MetricasAgendas }[]; moneda: (n: number) => string; enlaceCloser?: (id: string) => string }) {
  const cols: [string, (m: MetricasAgendas) => string | number][] = [
    ["Agendadas", (m) => m.agendadas],
    ["Asistencias", (m) => m.asistencias],
    ["Cerradas", (m) => m.cerradas],
    ["% cierre", (m) => `${pct(m.pctCierre)}`],
    ["No-show", (m) => m.noShow],
    ["Facturación", (m) => $(m.facturacion)],
    ["Cash", (m) => $(m.cash)],
    ["Ticket medio", (m) => $(m.ticketMedio)],
    ["4★+", (m) => m.calificados],
    ["Media ★", (m) => m.mediaEstrellasCloser ?? "—"],
    ["Devol.", (m) => m.devoluciones],
  ];
  return (
    <Seccion titulo="Comparativa de closers">
      {filas.length === 0 ? (
        <p className="text-sm text-texto-3">No hay closers en este proyecto.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="tabla">
            <thead><tr><th>Closer</th>{cols.map(([t]) => <th key={t} className="text-right">{t}</th>)}</tr></thead>
            <tbody>
              {filas.map(({ c, m }) => (
                <tr key={c.id}>
                  <td className="font-medium"><Link href={enlaceCloser(c.id)} className="hover:text-primario">{c.nombre}</Link></td>
                  {cols.map(([t, f]) => <td key={t} className="text-right tabular-nums">{f(m)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Seccion>
  );
}
