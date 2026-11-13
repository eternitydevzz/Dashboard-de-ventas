"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cargandoDatos } from "@/lib/pantalla-lista";
import { exigirOk } from "@/lib/resultado-cliente";
import { Desplegable } from "@/components/eleccion";
import { CalendarCheck, Euro, Link2, Link2Off, Users } from "lucide-react";
import { Kpi, Seccion } from "@/components/ui";
import { AnilloPartes } from "@/components/anillo-partes";
import { Barras } from "@/components/barras";
import { EmbudoVidrio } from "@/components/embudo-vidrio";
import { embudo } from "@/lib/leads-cifras";
import { CAMPOS_UTM, SIN_DATO, corteGrafico, etiquetasPico, filtrarUtms, porDiaUtm, rankingCampanas, totalesPor, type Clave, type FilaUtm, type FiltroUtm } from "@/lib/utms";
import { cargarUtmsPestana } from "./acciones";
import { GeneradorEnlaces } from "./generador-enlaces";
import type { TablaCanales } from "@/lib/canal";

const FILAS_MAX = 200; // shortcut: la tabla enseña las 200 primeras (los totales cuentan todas); paginar si hace falta
const FILTROS: { c: Clave; t: string }[] = [{ c: "landing", t: "Landing" }, ...CAMPOS_UTM.map((c) => ({ c, t: c })), { c: "etiqueta", t: "Etiqueta" }];
const TOTALES: { c: Clave; t: string }[] = [{ c: "utm_source", t: "Por utm_source" }, { c: "utm_campaign", t: "Por campaña" }, { c: "etiqueta", t: "Por etiqueta" }];
const PCT = (a: number, b: number) => (b ? `${(Math.round((a / b) * 1000) / 10).toLocaleString("es-ES")} %` : "—");

// Línea de leads por día. Si un día aplasta al resto (corteGrafico), el gráfico se corta y ese día lleva su número en
// una etiqueta (decisión de Cristian, 11 nov 2026, por el pico del 26/10). SVG puro con los colores de la app.
function LineaDias({ puntos }: { puntos: { d: string; n: number }[] }) {
  if (puntos.length < 2) return <p className="py-6 text-sm text-texto-3">{puntos.length ? `${puntos[0].n} leads el ${puntos[0].d}.` : "Todavía no hay leads en estas fechas."}</p>;
  const w = 760, h = 200, p = 28;
  const corte = corteGrafico(puntos.map((x) => x.n));
  const tope = corte ?? Math.max(1, ...puntos.map((x) => x.n));
  const sx = (w - 2 * p) / (puntos.length - 1);
  const xy = puntos.map((x, i) => [p + i * sx, h - p - (Math.min(x.n, tope) / tope) * (h - 2 * p - 8)] as const);
  const d = xy.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ");
  const cada = Math.max(1, Math.ceil(puntos.length / 7));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Leads por día">
      <defs>
        <linearGradient id="utm-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--primario)" stopOpacity=".35" /><stop offset="1" stopColor="var(--primario)" stopOpacity="0" /></linearGradient>
      </defs>
      {[0.5, 1].map((f) => <line key={f} x1={p} x2={w - p} y1={h - p - f * (h - 2 * p - 8)} y2={h - p - f * (h - 2 * p - 8)} stroke="var(--borde)" strokeDasharray="3 4" />)}
      <text x={p} y={12} fontSize="10" fill="var(--texto-3)">{corte ? `cortado en ${tope}` : `máx. ${tope}`}</text>
      <path d={`${d} L${xy[xy.length - 1][0]} ${h - p} L${p} ${h - p} Z`} fill="url(#utm-area)" />
      <path d={d} fill="none" stroke="var(--primario)" strokeWidth="2.5" strokeLinejoin="round" />
      {xy.map((q, i) => (
        <circle key={i} cx={q[0]} cy={q[1]} r={puntos.length > 60 ? 1.5 : 3} fill="var(--primario)"><title>{`${puntos[i].d}: ${puntos[i].n} leads`}</title></circle>
      ))}
      {corte !== null && etiquetasPico(xy.map((q) => q[0]), puntos.map((x) => x.n), corte).map((e) => {
        const ancho = 12 + e.texto.length * 6;
        return (
          <g key={e.x}>
            <rect x={e.x - ancho / 2} y={p - 14} width={ancho} height="16" rx="5" fill="var(--primario)" />
            <text x={e.x} y={p - 2} fontSize="10" fontWeight="700" textAnchor="middle" fill="#fff">{e.texto}</text>
          </g>
        );
      })}
      {/* La última fecha siempre; la anterior de la regla, solo si no se monta encima (visto en producción el 11 nov: «09/1110/11») */}
      {puntos.map((x, i) => ((i % cada === 0 && puntos.length - 1 - i >= cada) || i === puntos.length - 1 ? <text key={`t${i}`} x={p + i * sx} y={h - 8} fontSize="10" textAnchor="middle" fill="var(--texto-3)">{x.d}</text> : null))}
    </svg>
  );
}
const VACIO: FiltroUtm = { desde: null, hasta: null, landing: "", etiqueta: "", utm_source: "", utm_medium: "", utm_campaign: "", utm_content: "", utm_term: "" };

// B1 (plan GHL): KPIs → «UTMs» (solo jefes). Carga como «Leads» (después de pintar) y todo lo demás se calcula aquí.
export function PestanaUtms({ barra, desde, hasta, canales, zona }: { barra: React.ReactNode; desde: number | null; hasta: number | null; canales: TablaCanales; zona: string }) {
  const [filas, setFilas] = useState<FilaUtm[] | null>(null);
  const [error, setError] = useState("");
  const etiquetaUrl = useSearchParams().get("etiqueta") ?? ""; // B4: cada etiqueta enlaza a /kpis?vista=utms&etiqueta=…
  const [f, setF] = useState({ ...VACIO, etiqueta: etiquetaUrl });
  const [vista, setVista] = useState(etiquetaUrl);
  if (vista !== etiquetaUrl) {
    // otro clic en una etiqueta con la pestaña ya abierta: el filtro sigue a la dirección
    setVista(etiquetaUrl);
    setF({ ...f, etiqueta: etiquetaUrl });
  }
  useEffect(() => {
    let vivo = true;
    const listo = cargandoDatos();
    exigirOk(cargarUtmsPestana())
      .then((d) => vivo && setFilas(d as FilaUtm[]))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudieron cargar los leads."))
      .finally(listo);
    return () => {
      vivo = false;
      listo();
    };
  }, []);
  const filtro = useMemo(() => ({ ...f, desde, hasta }), [f, desde, hasta]);
  const visibles = useMemo(() => (filas ? filtrarUtms(filas, filtro) : []), [filas, filtro]);
  const [fuenteEmbudo, setFuenteEmbudo] = useState("");
  const dias = useMemo(() => porDiaUtm(visibles, desde, hasta, zona), [visibles, desde, hasta, zona]);

  if (!filas)
    return (
      <>
        <div className="tarjeta px-4">{barra}</div>
        {error ? <p className="text-sm text-mal">{error}</p> : <p className="animate-pulse text-sm text-texto-3" role="status" data-datos-pendientes="">Cargando los leads…</p>}
      </>
    );
  // Rediseño (maqueta v1, Cristian 11 nov 2026): «Sin dato» aparte (casi ningún lead tiene UTM) y gráficos
  const sinUtm = visibles.filter((x) => !x.utm_source).length;
  const conUtm = visibles.length - sinUtm;
  const pasos = embudo(visibles);
  const de = (t: string) => pasos.find((x) => x.t === t)?.n ?? 0;
  const fuentes = totalesPor(visibles, "utm_source").filter((x) => x.t !== SIN_DATO);
  const fuente = fuentes.some((x) => x.t === fuenteEmbudo) ? fuenteEmbudo : "";
  const pasosFuente = embudo(fuente ? visibles.filter((x) => x.utm_source === fuente) : visibles).map((x) => ({ t: x.t, n: x.n }));
  const campanas = rankingCampanas(visibles, 8);
  return (
    <div className="space-y-5">
      <div className="tarjeta space-y-3 px-4 pb-3.5">
        {barra}
        <div className="flex flex-wrap gap-2">
          {FILTROS.map(({ c, t }) => (
            <Desplegable key={c} aria-label={t} value={f[c]} onChange={(e) => setF({ ...f, [c]: e.target.value })} className="campo min-w-0 flex-1 sm:w-44 sm:flex-none">
              <option value="">{t}: todas</option>
              {totalesPor(filas, c).map((x) => <option key={x.t} value={x.t}>{`${x.t} (${x.n})`}</option>)}
            </Desplegable>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Kpi compacto titulo="Leads" valor={visibles.length.toLocaleString("es-ES")} icono={Users} detalle="con estos filtros" />
        <Kpi compacto titulo="Con UTM" valor={conUtm.toLocaleString("es-ES")} icono={Link2} tono="ok" detalle={`${PCT(conUtm, visibles.length)} del total`} />
        <Kpi compacto titulo="Sin UTM" valor={sinUtm.toLocaleString("es-ES")} icono={Link2Off} tono="aviso" detalle="se cuentan aparte" />
        <Kpi compacto titulo="Agendan" valor={de("Agendan").toLocaleString("es-ES")} icono={CalendarCheck} tono="oro" detalle={PCT(de("Agendan"), visibles.length)} />
        <Kpi compacto titulo="Compran" valor={de("Compran").toLocaleString("es-ES")} icono={Euro} tono="ok" detalle={PCT(de("Compran"), visibles.length)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">{/* min-w-0: los nombres largos no empujan la tarjeta en el móvil (11 nov) */}
        {TOTALES.map(({ c, t }) => (
          <Seccion key={c}>
            <AnilloPartes titulo={c === "etiqueta" ? "Por etiqueta (un lead puede tener varias)" : t} partes={totalesPor(visibles, c).filter((x) => x.t !== SIN_DATO)} centro={c === "etiqueta" ? String(totalesPor(visibles, c).filter((x) => x.t !== SIN_DATO).length) : undefined} />
          </Seccion>
        ))}
      </div>
      <Seccion titulo={`Leads por día · ${dias.reduce((s, x) => s + x.n, 0).toLocaleString("es-ES")} en total`}>
        <LineaDias puntos={dias} />
      </Seccion>
      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Embudo por utm_source">
          <Desplegable aria-label="Fuente del embudo" value={fuente} onChange={(e) => setFuenteEmbudo(e.target.value)} className="campo mb-3 w-full sm:w-56">
            <option value="">Todas las fuentes</option>
            {fuentes.map((x) => <option key={x.t} value={x.t}>{`${x.t} (${x.n})`}</option>)}
          </Desplegable>
          <EmbudoVidrio pasos={pasosFuente} />
        </Seccion>
        <Seccion titulo="Ranking de campañas">
          {campanas.length ? <Barras titulo="Leads por utm_campaign (sin «Sin dato»)" filas={campanas} numero /> : <p className="text-sm text-texto-3">Ningún lead de estas fechas tiene campaña.</p>}
        </Seccion>
      </div>
      <GeneradorEnlaces canales={canales} />
      <Seccion titulo={`Leads (${visibles.length})`}>
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr><th>Lead</th><th>Landing</th>{CAMPOS_UTM.map((c) => <th key={c}>{c}</th>)}<th>Etiquetas</th></tr>
            </thead>
            <tbody>
              {visibles.slice(0, FILAS_MAX).map((x) => (
                <tr key={x.id}>
                  <td><Link href={`/leads/${x.id}`} className="hover:underline">{x.nombre || "Sin nombre"}</Link></td>
                  <td>{x.landing}</td>
                  {CAMPOS_UTM.map((c) => <td key={c}>{x[c]}</td>)}
                  <td>{x.etiquetas.map((e, i) => <span key={e}>{i > 0 && ", "}<Link href={`/kpis?vista=utms&etiqueta=${encodeURIComponent(e)}`} className="hover:underline">{e}</Link></span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibles.length > FILAS_MAX && <p className="mt-2 text-xs text-texto-3">Se enseñan los primeros {FILAS_MAX}; filtra para ver el resto.</p>}
      </Seccion>
    </div>
  );
}
