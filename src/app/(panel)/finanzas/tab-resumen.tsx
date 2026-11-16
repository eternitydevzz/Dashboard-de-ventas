import { DollarSign, Wallet, PiggyBank, Megaphone, Hourglass, Receipt, TrendingUp } from "lucide-react";
import { resumenFinanzas, cambio } from "@/lib/finanzas";
import { diaEnZona } from "@/lib/llamadas";
import { rangoNav } from "@/lib/periodos";
import { dinero, hoyEnZona, type Rango, pct } from "@/lib/formato";
import { Kpi, Seccion } from "@/components/ui";
import type { Proyecto } from "@/lib/tipos";
import type { DatosFinanzas } from "./cargar";
import { Categorias } from "./cliente";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function TabResumen({ d, rango, proyecto }: { d: DatosFinanzas; rango: Rango; proyecto: Proyecto }) {
  const zona = proyecto.zona_horaria;
  const r = resumenFinanzas(d, rango, zona);
  const prev = rango.previo ? resumenFinanzas(d, rango.previo, zona) : null;
  const $ = (n: number) => dinero(n, proyecto);
  // Sin datos en el periodo anterior no se enseña un «+100 %» engañoso
  const vs = (a: number, b: number | undefined) => (prev && b ? cambio(a, b) : undefined);
  // Equivalencia en la otra moneda (cambio puesto a mano en «Divisas»)
  const otra = d.porUsd ? (proyecto.moneda === "EUR" ? { m: "USD" as const, f: 1 / d.porUsd } : { m: "EUR" as const, f: d.porUsd }) : null;
  const enOtra = (n: number) => (otra ? `≈ ${dinero(n * otra.f, { moneda: otra.m })}` : undefined);
  const totalCash = r.deDonde.ventaNueva + r.deDonde.cuotas + r.deDonde.backend;
  const meses = Array.from({ length: 6 }, (_, i) => {
    const rm = rangoNav("mes", i - 5, zona);
    const x = resumenFinanzas(d, rm, zona);
    const ymd = diaEnZona(rm.desde!.toISOString(), zona);
    return { t: `${MESES[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(2, 4)}`, facturacion: x.facturacion, cash: x.cash, egresos: x.egresosProfit, profit: x.profit };
  });

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titulo="Facturación" valor={$(r.facturacion)} icono={Receipt} cambio={vs(r.facturacion, prev?.facturacion)} detalle={enOtra(r.facturacion) ?? "vs. periodo anterior"} />
        <Kpi titulo="Cash collected" valor={$(r.cash)} icono={Wallet} tono="ok" destacado cambio={vs(r.cash, prev?.cash)} detalle={enOtra(r.cash) ?? (r.devuelto ? `neto de ${$(r.devuelto)} devueltos` : "vs. periodo anterior")} />
        <Kpi titulo="Profit (caja)" valor={$(r.profit)} icono={PiggyBank} tono={r.profit < 0 ? "mal" : "primario"} cambio={vs(r.profit, prev?.profit)} detalle={enOtra(r.profit) ?? "cash + ingresos extra − gastos"} />
        <Kpi titulo="ROAS" valor={r.roas === null ? "—" : `${r.roas.toLocaleString("es-ES")}x`} icono={Megaphone} tono="morado" detalle={r.roas === null ? "sin gastos en el periodo" : `por cada ${dinero(1, proyecto)} gastado`} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi titulo="Cuentas por cobrar" valor={$(r.porCobrar ?? 0)} icono={Hourglass} tono="aviso" detalle="plazos por vencer y vencidos (hoy)" />
        <Kpi titulo="Gastos en profit/ROAS" valor={$(r.egresosProfit)} icono={DollarSign} tono="mal" detalle={r.egresos !== r.egresosProfit ? `de ${$(r.egresos)} de gastos en total` : "todos los gastos del periodo"} />
        <Kpi titulo="Ingresos extra" valor={$(r.ingresosExtra)} icono={TrendingUp} tono="ok" detalle="fuera de las ventas" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="De dónde viene el cash" acciones={<Categorias tipo="egreso" categorias={d.categorias} />}>
          {totalCash === 0 ? (
            <p className="py-6 text-center text-sm text-texto-3">No ha entrado dinero en este periodo.</p>
          ) : (
            <div className="space-y-3">
              {[
                ["Venta nueva", r.deDonde.ventaNueva, "lo cobrado el día de la venta"],
                ["Cuotas y restos", r.deDonde.cuotas, "cobros posteriores de ventas"],
                ["Back-end", r.deDonde.backend, "programas marcados «back-end offer»"],
              ].map(([t, v, ayuda]) => (
                <div key={t as string}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{t} <span className="text-xs text-texto-3">· {ayuda}</span></span>
                    <span className="font-medium tabular-nums">{$(v as number)} <span className="text-xs text-texto-3">{pct(Math.round(((v as number) / totalCash) * 100))}</span></span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-panel-2"><div className="h-2 rounded-full bg-primario" style={{ width: `${Math.round(((v as number) / totalCash) * 100)}%` }} /></div>
                </div>
              ))}
              {r.devuelto > 0 && <p className="text-xs text-texto-3">Menos {$(r.devuelto)} de devoluciones = {$(r.cash)} de cash collected.</p>}
            </div>
          )}
        </Seccion>
        <Seccion titulo="Cobros por día">
          <MapaCobros porDia={r.porDia} rango={rango} zona={zona} moneda={$} />
        </Seccion>
      </div>

      <Seccion titulo="Últimos 6 meses">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["Facturación", "facturacion"],
              ["Cash collected", "cash"],
              ["Gastos (profit)", "egresos"],
              ["Profit", "profit"],
            ] as const
          ).map(([t, k]) => <MiniBarras key={k} titulo={t} puntos={meses.map((m) => ({ t: m.t, v: m[k] }))} moneda={$} />)}
        </div>
      </Seccion>
    </>
  );
}

// Un gráfico de barras pequeño por medida (mismas escalas de tiempo, cada uno con su eje)
function MiniBarras({ titulo, puntos, moneda }: { titulo: string; puntos: { t: string; v: number }[]; moneda: (n: number) => string }) {
  const max = Math.max(1, ...puntos.map((p) => Math.abs(p.v)));
  const hayNegativos = puntos.some((p) => p.v < 0);
  const H = 90;
  const base = hayNegativos ? H / 2 : H;
  const alto = hayNegativos ? H / 2 - 4 : H - 4;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium">{titulo}</span>
        <span className="text-xs tabular-nums text-texto-3">{moneda(puntos[puntos.length - 1].v)} este mes</span>
      </div>
      <svg viewBox={`0 0 180 ${H + 14}`} className="w-full" role="img" aria-label={`${titulo} de los últimos 6 meses`}>
        <line x1="0" x2="180" y1={base} y2={base} stroke="var(--borde)" />
        {puntos.map((p, i) => {
          const h = Math.max(p.v ? 2 : 0, (Math.abs(p.v) / max) * alto);
          const x = 6 + i * 29;
          return (
            <g key={p.t}>
              <rect x={x} y={p.v >= 0 ? base - h : base} width="20" height={h} rx="3" fill="var(--primario)" opacity={i === puntos.length - 1 ? 1 : 0.55}>
                <title>{`${p.t}: ${moneda(p.v)}`}</title>
              </rect>
              <rect x={x - 3} y="0" width="26" height={H} fill="transparent"><title>{`${p.t}: ${moneda(p.v)}`}</title></rect>
              <text x={x + 10} y={H + 12} textAnchor="middle" fontSize="9" fill="var(--texto-3)">{p.t.split(" ")[0]}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Un cuadro por día, más oscuro cuanto más se cobró (una sola tinta)
function MapaCobros({ porDia, rango, zona, moneda }: { porDia: Map<string, number>; rango: Rango; zona: string; moneda: (n: number) => string }) {
  const desde = diaEnZona(rango.desde!.toISOString(), zona);
  const ultimo = diaEnZona(new Date(rango.hasta!.getTime() - 1).toISOString(), zona);
  const dias: string[] = [];
  for (let t = new Date(`${desde}T12:00:00Z`); dias.length < 400; t.setUTCDate(t.getUTCDate() + 1)) {
    const ymd = t.toISOString().slice(0, 10);
    if (ymd > ultimo) break;
    dias.push(ymd);
  }
  if (dias.length > 62) {
    return <p className="py-6 text-center text-sm text-texto-3">Elige Día, Semana o Mes para ver el mapa de cobros día a día.</p>;
  }
  const max = Math.max(1, ...dias.map((x) => porDia.get(x) ?? 0));
  const hoy = hoyEnZona(zona);
  const hueco = (new Date(`${dias[0]}T12:00:00Z`).getUTCDay() + 6) % 7;
  const total = dias.reduce((s, x) => s + (porDia.get(x) ?? 0), 0);
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-texto-3">
        {["L", "M", "X", "J", "V", "S", "D"].map((x) => <div key={x}>{x}</div>)}
        {Array.from({ length: hueco }, (_, i) => <div key={`h${i}`} />)}
        {dias.map((x) => {
          const v = porDia.get(x) ?? 0;
          return (
            <div key={x} title={`${Number(x.slice(8))}/${Number(x.slice(5, 7))}: ${moneda(v)}`} className={`flex aspect-square items-center justify-center rounded-md text-[11px] ${x === hoy ? "ring-1 ring-primario" : ""} ${v ? "text-white" : "bg-panel-2 text-texto-3"}`} style={v ? { background: `color-mix(in oklab, var(--primario) ${Math.round(35 + (v / max) * 65)}%, var(--panel))` } : undefined}>
              {Number(x.slice(8))}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-texto-3">Más oscuro = más cobrado. Total: {moneda(total)}. Pasa el ratón por un día para ver la cifra.</p>
    </div>
  );
}
