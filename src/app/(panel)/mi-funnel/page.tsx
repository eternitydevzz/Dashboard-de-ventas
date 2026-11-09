import { redirect } from "next/navigation";
import { Phone, PhoneIncoming, CalendarDays, Handshake, UserCheck, ShoppingCart, DollarSign, Wallet, Percent, Ticket } from "lucide-react";
import { exigirPagina } from "@/lib/permisos";
import { cargarBase, calcularFunnel } from "@/lib/metricas";
import { calcularKpis } from "@/lib/kpis";
import { esCloser } from "@/lib/tipos";
import { panelObjetivos } from "@/lib/objetivos";
import { dinero, rangoDe, pct, hoyEnZona, type Periodo } from "@/lib/formato";
import { Cabecera, Contenido, Kpi, Seccion } from "@/components/ui";
import { Filtros } from "@/components/filtros";
import { CuerpoFunnel } from "@/components/cuerpo-funnel";
import { PanelObjetivos } from "@/components/barras-objetivos";

// «Mi Funnel» (Paso H8, decisiones de Cristian del 10 oct 2026): cada caller y closer ve solo sus datos.
// Arriba sus objetivos, después sus KPIs en tarjetas y debajo el Funnel de siempre filtrado a él.
export default async function MiFunnelPage({ searchParams }: PageProps<"/mi-funnel">) {
  const { perfil, proyecto } = await exigirPagina("mi_funnel", "funnel"); // H5
  if (perfil.rol !== "caller" && perfil.rol !== "closer") redirect("/kpis?vista=funnel"); // los jefes ya tienen el Funnel entero (pestaña de KPIs)
  const sp = await searchParams;
  const periodo = (typeof sp.periodo === "string" ? sp.periodo : "mes") as Periodo;
  const zona = proyecto.zona_horaria;
  const rango = rangoDe(periodo, zona, sp.desde as string, sp.hasta as string);
  const [base, panel] = await Promise.all([cargarBase(proyecto, !!perfil.es_prueba), panelObjetivos(proyecto, perfil)]);
  const kpis = calcularKpis(base, rango, zona);
  const m = calcularFunnel(base, rango, perfil, zona);
  const $ = (n: number) => dinero(n, proyecto);
  const caller = perfil.rol === "caller" ? kpis.callers.find((c) => c.perfil.id === perfil.id) : undefined;
  const closer = esCloser(perfil) ? kpis.closers.find((c) => c.perfil.id === perfil.id) : undefined;

  return (
    <>
      <Cabecera titulo="Mi Funnel" subtitulo={`${proyecto.nombre} · ${perfil.nombre} · ${rango.etiqueta}`} />
      <Contenido>
        <PanelObjetivos panel={panel} dinero={$} celebrar={`${perfil.id}-${hoyEnZona(zona)}`} />
        <Filtros />

        {caller && (
          <Seccion titulo="Mis KPIs">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <Kpi titulo="Llamadas" valor={caller.llamadas} icono={Phone} detalle="Llamadas apuntadas" />
              <Kpi titulo="Contactados" valor={caller.contactados} icono={PhoneIncoming} detalle={<>{caller.contestan} contestan</>} />
              <Kpi titulo="Agendados" valor={caller.agendados} icono={CalendarDays} detalle={<>{pct(caller.agendaSobreContactado)} de contactados · {pct(caller.agendaSobreContesta)} de los que contestan</>} />
              <Kpi titulo="Cerrados" valor={caller.cerrados} icono={Handshake} tono="ok" detalle={<>{pct(caller.cierreSobreAgendado)} de agendados · {pct(caller.cierreSobreContactado)} de contactados</>} />
              <Kpi titulo="% asistencia" valor={pct(caller.asistencia)} icono={UserCheck} detalle="De sus agendados con la cita ya pasada" />
              <Kpi titulo="% cierre sobre asistencia" valor={pct(caller.cierreSobreAsistencia)} icono={Percent} detalle="De los que se presentaron, los que compraron" />
              <Kpi titulo="Low ticket" valor={caller.lowTicketVentas} icono={Ticket} tono="oro" detalle={caller.lowTicketVentas ? $(caller.lowTicketFacturacion) : "Sin ventas propias"} />
            </div>
          </Seccion>
        )}
        {closer && (
          <Seccion titulo="Mis KPIs">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <Kpi titulo="Citas" valor={closer.citas} icono={CalendarDays} detalle={<>{closer.asistidas} asistidas</>} />
              <Kpi titulo="Cerradas" valor={closer.cerradas} icono={Handshake} tono="ok" detalle={<>{pct(closer.cierreSobreAgenda)} de las citas · {pct(closer.cierreSobreAsistencia)} de asistidas</>} />
              <Kpi titulo="Facturación" valor={$(closer.facturacion)} icono={DollarSign} tono="oro" detalle={<>{pct(closer.parteFacturacion)} del total de los closers</>} />
              <Kpi titulo="Cash collected" valor={$(closer.cash)} icono={Wallet} tono="ok" detalle={<>{pct(closer.parteCash)} del total · {pct(closer.pctCobrado)} cobrado de lo vendido</>} />
            </div>
          </Seccion>
        )}
        {!caller && !closer && <p className="text-sm text-texto-3">Todavía no hay datos tuyos en este periodo.</p>}

        <CuerpoFunnel m={m} dinero={$} />
        <p className="flex items-center gap-2 text-xs text-texto-3">
          <ShoppingCart className="h-3.5 w-3.5" /> Todo con tus datos: tus leads, tus llamadas, tus citas y tus ventas.
        </p>
      </Contenido>
    </>
  );
}
