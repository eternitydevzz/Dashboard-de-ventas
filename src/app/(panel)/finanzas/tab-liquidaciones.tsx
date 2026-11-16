import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/datos";
import { dinero, hoyEnZona, ETIQUETA_ROL, pct } from "@/lib/formato";
import { Insignia, Seccion } from "@/components/ui";
import type { LineaL } from "@/lib/finanzas";
import type { Perfil, Proyecto } from "@/lib/tipos";
import type { DatosFinanzas } from "./cargar";
import { CalcularComisiones, PagarLiquidacion } from "./cliente";
import { Chips } from "./tab-ventas";

type SP = Record<string, string | string[] | undefined>;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const moverMes = (mes: string, n: number) => {
  const d = new Date(`${mes}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
type Liq = { id: string; perfil_id: string; mes: string; base_facturado: number; base_cobrado: number; comision_facturado: number; comision_cobrado: number; detalle: LineaL[]; tramo: { base: number; pct: number } | null; estado: "pendiente" | "pagada"; pagada_en: string | null; calculada_en: string };

export async function TabLiquidaciones({ d, proyecto, sp, yo, deLaMoneda }: { d: DatosFinanzas; proyecto: Proyecto; sp: SP; yo: Perfil; deLaMoneda: (perfilId: string) => boolean }) {
  const $ = (n: number) => dinero(n, proyecto, 2);
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : hoyEnZona(proyecto.zona_horaria).slice(0, 7);
  const estado = typeof sp.estado === "string" ? sp.estado : "";
  const { data, error } = await db().from("liquidaciones").select("*").eq("proyecto_id", proyecto.id).eq("mes", mes);
  // S2-16: si la base falla, error.tsx (antes salía «No hay comisiones» e invitaba a «Calcular»)
  if (error) throw new Error(`No se pudieron leer las liquidaciones: ${error.message}`);
  // A2-03: cada persona en la moneda de su mercado (filtro € / $)
  const todas = ((data ?? []) as Liq[]).filter((l) => deLaMoneda(l.perfil_id)).map((l) => ({ ...l, base_facturado: Number(l.base_facturado), base_cobrado: Number(l.base_cobrado), comision_facturado: Number(l.comision_facturado), comision_cobrado: Number(l.comision_cobrado) }));
  const lista = todas.filter((l) => (estado === "pagados" ? l.estado === "pagada" : estado === "todos" ? true : l.estado === "pendiente")).sort((a, b) => b.comision_cobrado - a.comision_cobrado);
  const suma = (e: string) => todas.filter((l) => l.estado === e).reduce((s, l) => s + l.comision_cobrado, 0);
  const cuentas = d.cuentas.map((c) => ({ id: c.id, nombre: c.nombre }));
  const enlaceMes = (m: string) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    p.set("mes", m);
    return `/finanzas?${p}`;
  };
  const nombreMes = `${MESES[Number(mes.slice(5)) - 1]} ${mes.slice(0, 4)}`;

  return (
    <>
      <div className="tarjeta flex flex-wrap items-center gap-3 p-2.5">
        <div className="flex items-center rounded-lg border border-borde bg-panel">
          <Link href={enlaceMes(moverMes(mes, -1))} className="p-2 text-texto-2 hover:text-texto" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-36 px-1 text-center text-sm font-medium first-letter:uppercase">{nombreMes}</span>
          <Link href={enlaceMes(moverMes(mes, 1))} className="p-2 text-texto-2 hover:text-texto" aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></Link>
        </div>
        <Chips sp={sp} nombre="estado" opciones={[["", "Pendientes"], ["pagados", "Pagados"], ["todos", "Todos"]]} />
        <div className="ml-auto"><CalcularComisiones mes={mes} /></div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="tarjeta p-4"><div className="titulo-seccion">Por pagar</div><div className="mt-2 text-2xl font-semibold tabular-nums text-aviso">{$(suma("pendiente"))}</div></div>
        <div className="tarjeta p-4"><div className="titulo-seccion">Pagado</div><div className="mt-2 text-2xl font-semibold tabular-nums text-ok">{$(suma("pagada"))}</div></div>
        <div className="tarjeta p-4"><div className="titulo-seccion">Personas</div><div className="mt-2 text-2xl font-semibold tabular-nums">{todas.length}</div></div>
      </div>
      <Seccion titulo={`Comisiones de ${nombreMes}`}>
        {lista.length === 0 ? (
          <p className="py-6 text-center text-sm text-texto-3">{todas.length ? "Nada en este filtro." : "No hay comisiones en este mes. Si acaban de entrar ventas o cobros, pulsa «Calcular comisiones a todos». Callers y closers cobran por tramos (Administración → Comisiones); el resto, si tiene un % puesto (en Equipo o en el programa)."}</p>
        ) : (
          <div className="space-y-3">
            {lista.map((l) => {
              const p = d.persona.get(l.perfil_id);
              return (
                <div key={l.id} className="rounded-xl border border-borde">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                    <span className="min-w-40 font-medium">{p?.nombre ?? "Persona dada de baja"} <span className="text-xs text-texto-3">{p ? ETIQUETA_ROL[p.rol] : ""}</span></span>
                    <span className="text-xs text-texto-3">Sobre facturado <b className="tabular-nums text-texto-2">{$(l.comision_facturado)}</b> <span className="tabular-nums">(de {$(l.base_facturado)})</span></span>
                    <span className="text-xs text-texto-3">Sobre cobrado <b className="text-base tabular-nums text-texto">{$(l.comision_cobrado)}</b> <span className="tabular-nums">(de {$(l.base_cobrado)})</span></span>
                    {/* Bloque 4: el tramo que alcanzó en el mes */}
                    {l.tramo && <Insignia tono="oro">Tramo {pct(l.tramo.pct)} · {$(l.tramo.base)} facturados en el mes</Insignia>}
                    <span className="ml-auto flex items-center gap-2">
                      <Insignia tono={l.estado === "pagada" ? "ok" : "aviso"}>{l.estado === "pagada" ? "Pagada" : "Pendiente"}</Insignia>
                      {/* Nadie paga ni desmarca la suya, salvo el CEO (arreglo 2) */}
                      {yo.rol !== "ceo" && l.perfil_id === yo.id ? <span className="text-xs text-texto-3">La tuya la marca otra persona</span> : <PagarLiquidacion id={l.id} pagada={l.estado === "pagada"} cuentas={cuentas} />}
                    </span>
                  </div>
                  <details className="border-t border-borde">
                  <summary className="cursor-pointer px-3 py-2 text-xs text-primario">Ver de dónde sale ({l.detalle.length})</summary>
                  <div className="overflow-x-auto">
                    <table className="tabla">
                      <thead><tr><th>Cliente</th><th>Programa</th><th>Por</th><th className="text-right">%</th><th className="text-right">Facturado</th><th className="text-right">Cobrado en el mes</th><th className="text-right">Comisión (cobrado)</th></tr></thead>
                      <tbody>
                        {l.detalle.map((x, i) => (
                          <tr key={`${x.venta_id}-${x.tipo}-${i}`}>
                            <td><Link href={`/leads/${x.lead_id}`} className="hover:text-primario">{d.leads.get(x.lead_id)?.nombre ?? "—"}</Link></td>
                            <td className="text-texto-2">{d.producto.get(x.producto_id ?? "") ?? "—"}</td>
                            <td>{x.tipo === "agenda" ? "Agenda cerrada" : "Venta"}</td>
                            <td className="text-right tabular-nums">{pct(x.pct)}{x.tramo && <span className="text-xs text-texto-3"> tramo</span>}</td>
                            <td className="text-right tabular-nums">{$(x.facturado)}</td>
                            <td className="text-right tabular-nums">{$(x.cobrado)}</td>
                            <td className="text-right font-medium tabular-nums">{$(x.com_cobrado)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </details>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-texto-3">Se paga la comisión <b>sobre lo cobrado en el mes</b>; la de «sobre facturado» es para que la veas. El caller cobra su % de agenda cuando el closer cierra la cita que él agendó. Las devoluciones no descuentan lo ya pagado. «Calcular» rehace las pendientes del mes; las pagadas no se tocan. Al marcar «Pagada» se crea el gasto en «Comisiones».</p>
      </Seccion>
    </>
  );
}
