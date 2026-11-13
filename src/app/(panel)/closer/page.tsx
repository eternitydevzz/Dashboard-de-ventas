import { FileDown } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { panelObjetivos } from "@/lib/objetivos";
import { PanelObjetivos } from "@/components/barras-objetivos";
import { cargarAgendas, closersVisibles } from "@/lib/agendas-datos";
import { metricasAgendas } from "@/lib/metricas-agendas";
import { leerPeriodo, rangoNav } from "@/lib/periodos";
import { dinero, hoyEnZona } from "@/lib/formato";
import { Cabecera, Contenido } from "@/components/ui";
import { BarraPeriodo, FiltroUrl } from "@/components/barra-periodo";
import { redirect } from "next/navigation";
import { METRICAS_VISIBLE, PestanasAgendas } from "./pestanas";
import { VistaAgendas } from "./vista-agendas";
import { IndividualAgendas, ComparativaAgendas } from "@/components/metricas-agendas-vista";

export default async function AgendasMetricasPage({ searchParams }: PageProps<"/closer">) {
  const { perfil, proyecto } = await exigirPagina("agendas"); // H5
  if (!METRICAS_VISIBLE) redirect("/closer/llamadas"); // Cristian (13 oct): Agendas sin «Métricas»
  const jefe = esJefe(perfil);
  // H5 (caso 1): un caller con «Agendas» ve solo las citas que agendó él (y las ventas de esos leads), solo mirar
  const mirar = perfil.rol === "caller";
  const sp = await searchParams;
  const p = leerPeriodo(sp);
  const rango = rangoNav(p.periodo, p.n, proyecto.zona_horaria, p.desde, p.hasta);
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const comparativa = jefe && str("vista") === "comparativa";

  const datos = await cargarAgendas(proyecto, !!perfil.es_prueba);
  if (mirar) {
    datos.citas = datos.citas.filter((c) => c.agendada_por === perfil.id || c.closer_id === perfil.id);
    const leads = new Set(datos.citas.map((c) => c.lead_id));
    datos.ventas = datos.ventas.filter((v) => leads.has(v.lead_id));
    const ventas = new Set(datos.ventas.map((v) => v.id));
    datos.pagos = datos.pagos.filter((x) => ventas.has(x.venta_id));
  }
  const vis = closersVisibles(perfil, datos.gente, str("closer"));
  const filtros = { productoId: str("producto"), evento: str("evento") };
  const m = metricasAgendas(datos, rango, { closerIds: vis.ids, ...filtros });
  // Quien está de baja (arreglo 11) solo sale en los periodos en que tuvo citas o cobró algo
  // Fase 2: los jefes reciben las dos vistas ya calculadas (el botón Individual/Comparativa cambia al instante)
  const porCloser = jefe ? vis.todos.map((c) => ({ c, m: metricasAgendas(datos, rango, { closerIds: [c.id], ...filtros }) })).filter(({ c, m }) => !("baja" in c && c.baja) || m.agendadas || m.cash) : [];
  const $ = (n: number) => dinero(n, proyecto);
  const panel = jefe ? null : await panelObjetivos(proyecto, perfil); // cada closer ve solo los suyos, su racha y el del equipo (H3-H4)
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);

  const filtrosComunes = (
    <>
      <FiltroUrl nombre="producto" etiqueta="Producto" todos="Todos los productos" opciones={datos.productos.map((x) => ({ v: x.id, t: x.nombre }))} />
      {datos.eventos.length > 0 && <FiltroUrl nombre="evento" etiqueta="Evento" todos="Todos los eventos" opciones={datos.eventos.map((e) => ({ v: e, t: e }))} />}
      <div className="2xl:ml-auto"><BarraPeriodo etiqueta={rango.etiqueta} /></div>
    </>
  );

  return (
    <>
      <Cabecera
        titulo="Agendas"
        subtitulo={`${proyecto.nombre} · ${jefe ? (vis.ids.length === 1 && str("closer") ? vis.closers[0]?.nombre : "todos los closers") : mirar ? `citas que agendó ${perfil.nombre}` : perfil.nombre} · ${rango.etiqueta}`}
        acciones={
          mirar ? undefined : (
            <a href={`/closer/reporte?${qs}`} className="btn-secundario" title="Descarga un PDF con las métricas de este periodo">
              <FileDown className="h-4 w-4" /> Generar reporte
            </a>
          )
        }
      />
      <Contenido>
        <PestanasAgendas activa="/closer" />
        {panel && <PanelObjetivos panel={panel} dinero={$} celebrar={`${perfil.id}-${hoyEnZona(proyecto.zona_horaria)}`} />}
        {jefe ? (
          <VistaAgendas
            inicial={comparativa ? "comparativa" : "individual"}
            filtroIndividual={<FiltroUrl nombre="closer" etiqueta="Closer" todos="Todos los closers" opciones={vis.todos.map((c) => ({ v: c.id, t: c.nombre }))} />}
            resto={filtrosComunes}
            individual={<IndividualAgendas m={m} moneda={$} />}
            comparativa={<ComparativaAgendas filas={porCloser} moneda={$} enlaceCloser={(id) => `/closer?closer=${id}`} />}
          />
        ) : (
          <>
            <div className="tarjeta flex flex-wrap items-center gap-2 p-2.5">{filtrosComunes}</div>
            <IndividualAgendas m={m} moneda={$} />
          </>
        )}

        <details className="tarjeta p-4 text-xs text-texto-2">
          <summary className="cursor-pointer font-medium text-texto">¿Cómo se calcula cada número?</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><b>Agendadas:</b> citas con fecha en el periodo (una cita reagendada no cuenta dos veces).</li>
            <li><b>Asistencias:</b> citas cerradas, en seguimiento o perdidas (hubo llamada).</li>
            <li><b>% cierre:</b> cerradas ÷ asistencias. <b>Call/close:</b> cerradas ÷ agendadas.</li>
            <li><b>Facturación:</b> valor de las ventas de los closers con fecha en el periodo.</li>
            <li><b>Cash collected:</b> lo cobrado al vender + las cuotas cobradas en el periodo − las devoluciones del periodo.</li>
            <li><b>Calificados 4★+:</b> asistencias a las que el closer puso 4 o 5 estrellas.</li>
          </ul>
        </details>
      </Contenido>
    </>
  );
}
