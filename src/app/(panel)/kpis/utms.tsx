"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cargandoDatos } from "@/lib/pantalla-lista";
import { exigirOk } from "@/lib/resultado-cliente";
import { Desplegable } from "@/components/eleccion";
import { Seccion } from "@/components/ui";
import { CAMPOS_UTM, filtrarUtms, totalesPor, type Clave, type FilaUtm, type FiltroUtm } from "@/lib/utms";
import { cargarUtmsPestana } from "./acciones";
import { GeneradorEnlaces } from "./generador-enlaces";

const FILAS_MAX = 200; // shortcut: la tabla enseña las 200 primeras (los totales cuentan todas); paginar si hace falta
const FILTROS: { c: Clave; t: string }[] = [{ c: "landing", t: "Landing" }, ...CAMPOS_UTM.map((c) => ({ c, t: c })), { c: "etiqueta", t: "Etiqueta" }];
const TOTALES: { c: Clave; t: string }[] = [{ c: "utm_source", t: "Por utm_source" }, { c: "utm_campaign", t: "Por campaña" }, { c: "etiqueta", t: "Por etiqueta" }];
const VACIO: FiltroUtm = { desde: null, hasta: null, landing: "", etiqueta: "", utm_source: "", utm_medium: "", utm_campaign: "", utm_content: "", utm_term: "" };

// B1 (plan GHL): KPIs → «UTMs» (solo jefes). Carga como «Leads» (después de pintar) y todo lo demás se calcula aquí.
export function PestanaUtms({ barra, desde, hasta }: { barra: React.ReactNode; desde: number | null; hasta: number | null }) {
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

  if (!filas)
    return (
      <>
        <div className="tarjeta px-4">{barra}</div>
        {error ? <p className="text-sm text-mal">{error}</p> : <p className="animate-pulse text-sm text-texto-3" aria-busy="true" data-datos-pendientes="">Cargando los leads…</p>}
      </>
    );
  return (
    <div className="space-y-5">
      <GeneradorEnlaces />
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
      <div className="grid gap-4 lg:grid-cols-3">
        {TOTALES.map(({ c, t }) => (
          <Seccion key={c} titulo={t}>
            <table className="tabla">
              <tbody>
                {totalesPor(visibles, c).map((x) => <tr key={x.t}><td>{x.t}</td><td className="text-right tabular-nums">{x.n}</td></tr>)}
              </tbody>
            </table>
          </Seccion>
        ))}
      </div>
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
