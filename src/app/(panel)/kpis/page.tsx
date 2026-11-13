import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarRange, Target, Wallet } from "lucide-react";
import { exigirPagina, soloLoSuyo } from "@/lib/permisos";
import { cargarBase, calcularFunnel, enRango } from "@/lib/metricas";
import { calcularKpis } from "@/lib/kpis";
import { cargarObjetivos, calcularAvances, avancesDelEquipo, vigentes, CIFRAS, PERIODOS, DIAS, type RolObjetivo } from "@/lib/objetivos";
import { db, todas } from "@/lib/datos";
import { dinero, pct, hoyEnZona, sumarDias, rangoDe, ETIQUETA_ROL, type Periodo } from "@/lib/formato";
import { Filtros } from "@/components/filtros";
import { PestanaLeads } from "./leads";
import { PestanaUtms } from "./utms";
import { Cabecera, Contenido, Seccion, Vacio } from "@/components/ui";
import { TablasKpis, ExplicacionKpis } from "@/components/tablas-kpis";
import { BarrasObjetivos } from "@/components/barras-objetivos";
import { FormObjetivo, BotonQuitarObjetivo, FormLanzamiento, BotonBorrarLanzamiento } from "./objetivos-cliente";
import { ActualizarCsv } from "./subir-csv";
import { ESCALERA, type EscalonOferta } from "@/lib/biblioteca";
import type { Pipeline, Producto } from "@/lib/tipos";
import { Embudo } from "@/components/embudo";
import { CuerpoFunnel } from "@/components/cuerpo-funnel";
import { TarjetasKpis, type PersonaKpi } from "@/components/tarjetas-kpis";
import { TarjetaObjetivos } from "@/components/tarjeta-objetivos";
import { esJefe } from "@/lib/auth";
import { FileDown } from "lucide-react";
import { leerPeriodo, rangoNav } from "@/lib/periodos";
import { cargarAgendas, closersVisibles } from "@/lib/agendas-datos";
import { metricasAgendas } from "@/lib/metricas-agendas";
import { panelObjetivos } from "@/lib/objetivos";
import { PanelObjetivos } from "@/components/barras-objetivos";
import { BarraPeriodo, FiltroUrl } from "@/components/barra-periodo";
import { IndividualAgendas, ComparativaAgendas } from "@/components/metricas-agendas-vista";
import { VistaAgendas } from "@/app/(panel)/closer/vista-agendas";
import { SIN_CANAL, opcionesCanal } from "@/lib/canal";
import { canalesDe } from "@/lib/canales-datos";
import { FiltroMercado } from "@/components/mercado-equipo";
import { entraEnMercado, mercadoDe, mercadoValido } from "@/lib/mercado";
import { mercadosDelProyecto } from "@/lib/mercado-datos";

// KPIs de cada caller y closer (Paso H2) y sus objetivos (Paso H3). Solo director y CEO (decisión de Cristian, 10 oct 2026).
export default async function KpisPage({ searchParams }: PageProps<"/kpis">) {
  // 26 oct 2026 (Cristian): el Funnel es una pestaña de KPIs; con «KPIs» o con «Funnel» se entra
  const { perfil, proyecto, tiene } = await exigirPagina("kpis", "funnel"); // H5 (a un caller o closer, solo lo suyo: parte 2)
  const sp = await searchParams;
  const jefe = esJefe(perfil);
  const conKpis = tiene.has("kpis");
  // El permiso «Funnel» abre su pestaña a los jefes; a un caller o closer le da «Mi Funnel» (sus números)
  const conFunnel = jefe && tiene.has("funnel");
  if (!conKpis && !jefe) redirect("/mi-funnel");
  // H5: a un caller o closer con «KPIs», solo su fila y sin la pestaña Objetivos (no puede poner objetivos)
  const propio = soloLoSuyo(perfil, "kpis");
  // 1c (Cristian, 26 oct 2026): la primera es «Leads» (todos los leads). La pestaña «Biblioteca» se quitó: lo suyo
  // (escalera de ofertas, «pueden invertir», «calientes», el formulario y «Actualizar con CSV») está en «Leads».
  const vista =
    (sp.vista === "funnel" && conFunnel) || !conKpis
      ? "funnel"
      : jefe && !propio && sp.vista === "utms" ? "utms" : !propio && sp.vista === "objetivos" ? "objetivos" : !propio && sp.vista === "personas" ? "personas" : jefe && !propio ? "leads" : "personas";
  const $ = (n: number) => dinero(n, proyecto);

  // Boceto B (Cristian, 26 oct): texto con una línea azul debajo de la pestaña activa, en las 4 pestañas
  const listaPestanas = () => (
    <div className="flex gap-6" role="tablist">
      {[
        ...(jefe && conKpis ? [{ v: "leads", t: "Leads", href: "/kpis" }] : []),
        ...(jefe && conKpis ? [{ v: "utms", t: "UTMs", href: "/kpis?vista=utms" }] : []),
        ...(conFunnel ? [{ v: "funnel", t: "Funnel", href: "/kpis?vista=funnel" }] : []),
        ...(conKpis
          ? [
              { v: "personas", t: "Por persona", href: "/kpis?vista=personas" },
              { v: "objetivos", t: "Objetivos", href: "/kpis?vista=objetivos" },
            ]
          : []),
      ].map((p) => (
        <Link key={p.v} href={p.href} role="tab" aria-selected={vista === p.v} className={`relative shrink-0 py-3 text-sm font-medium transition-colors ${vista === p.v ? "text-texto" : "text-texto-3 hover:text-texto"}`}
        >
          {p.t}
          {vista === p.v && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primario" aria-hidden />}
        </Link>
      ))}
    </div>
  );
  // Por persona y Objetivos, con la misma barra subrayada que Leads y Funnel (Cristian, 26 oct)
  const pestanas = <div className="tarjeta px-4">{listaPestanas()}</div>;

  if (vista === "leads") {
    // Aquí no se lee nada pesado: la precarga del menú prepara esta página al pasar el ratón por «KPIs». Los leads los
    // pide la pestaña después de pintar (PestanaLeads → cargarLeadsPestana). Periodo por la fecha de alta, «Todo» por defecto.
    const periodo = (typeof sp.periodo === "string" ? sp.periodo : "todo") as Periodo;
    const rango = rangoDe(periodo, proyecto.zona_horaria, sp.desde as string | undefined, sp.hasta as string | undefined);
    // Lo que venía de la Biblioteca: precios de la escalera y los pipelines de «Actualizar con CSV» (dos lecturas pequeñas)
    const [{ data: productos }, { data: pipes }] = await Promise.all([
      db().from("productos").select("*").eq("proyecto_id", proyecto.id).order("orden"),
      db().from("pipelines").select("*").eq("proyecto_id", proyecto.id).eq("tipo", "normal").order("orden"),
    ]);
    const pipelines = (pipes ?? []) as Pipeline[];
    const ofertas: EscalonOferta[] = ESCALERA.map((e) => {
      const p = ((productos ?? []) as Producto[]).find((x) => x.nombre.toLowerCase() === e.producto.toLowerCase());
      return { clave: e.clave, nombre: p?.nombre ?? e.producto, precio: p?.precio ? `${$(Number(p.precio))}${p.modo_pago === "mensual" ? " / mes" : ""}` : "A medida", quien: e.quien };
    });
    const csv = <ActualizarCsv pipelines={pipelines} pipelineId={pipelines.find((p) => p.nombre.toLowerCase().includes("biblioteca"))?.id} />;
    return (
      <>
        <Cabecera titulo="KPIs" subtitulo={`${proyecto.nombre} · Leads · ${rango.etiqueta}`} />
        <Contenido>
          {/* Pestañas y periodo en una sola barra, dentro de la misma tarjeta que los filtros de la pestaña (Cristian, 26 oct) */}
          <PestanaLeads
            barra={
              <div className="-mx-4 flex flex-wrap items-center justify-between gap-x-4 border-b border-borde px-4">
                {listaPestanas()}
                <div className="py-1.5">
                  <Filtros periodoPorDefecto="todo" ligero />
                </div>
              </div>
            } desde={rango.desde?.getTime() ?? null} hasta={rango.hasta?.getTime() ?? null} zona={proyecto.zona_horaria} ofertas={ofertas} csv={csv} />
        </Contenido>
      </>
    );
  }
  // B1 (plan GHL): pestaña «UTMs», solo jefes. Como «Leads»: los datos los pide la pestaña después de pintar
  if (vista === "utms") {
    const periodo = (typeof sp.periodo === "string" ? sp.periodo : "todo") as Periodo;
    const rango = rangoDe(periodo, proyecto.zona_horaria, sp.desde as string | undefined, sp.hasta as string | undefined);
    return (
      <>
        <Cabecera titulo="KPIs" subtitulo={`${proyecto.nombre} · UTMs · ${rango.etiqueta}`} />
        <Contenido>
          <PestanaUtms
            barra={
              <div className="-mx-4 flex flex-wrap items-center justify-between gap-x-4 border-b border-borde px-4">
                {listaPestanas()}
                <div className="py-1.5">
                  <Filtros periodoPorDefecto="todo" ligero />
                </div>
              </div>
            } desde={rango.desde?.getTime() ?? null} hasta={rango.hasta?.getTime() ?? null} canales={await canalesDe(proyecto.id)} zona={proyecto.zona_horaria} />
        </Contenido>
      </>
    );
  }
  const base = await cargarBase(proyecto);

  if (vista === "funnel") {
    // Lo que era la página «Funnel» (26 oct, Cristian): las cifras de dinero y de actividad del periodo, por vendedor y
    // producto. Sin la tabla «KPIs por persona»: está en la pestaña de al lado.
    const periodo = (typeof sp.periodo === "string" ? sp.periodo : "mes") as Periodo;
    const rango = rangoDe(periodo, proyecto.zona_horaria, sp.desde as string, sp.hasta as string);
    const { data: productosData } = await db().from("productos").select("id, nombre").eq("proyecto_id", proyecto.id).order("orden");
    const productos = productosData ?? [];
    const vendedor = base.gente.find((g) => g.id === sp.vendedor) ?? null;
    const producto = productos.find((p) => p.id === sp.producto) ?? null;
    const m = calcularFunnel(base, rango, vendedor, proyecto.zona_horaria, producto?.id ?? null);
    const vendedores = base.gente.filter((g) => g.rol === "caller" || g.rol === "closer").map((g) => ({ id: g.id, nombre: g.nombre, rol: ETIQUETA_ROL[g.rol] }));
    return (
      <>
        <Cabecera
          titulo="KPIs"
          subtitulo={
            <>
              {proyecto.nombre} · Funnel · {rango.etiqueta}
              {vendedor && <> · {vendedor.nombre}</>}
              {producto && <> · solo ventas de «{producto.nombre}»</>}
            </>
          }
        />
        <Contenido>
          {/* La misma barra que «Leads»: pestañas subrayadas y, al lado, vendedor, producto y periodo */}
          <div className="tarjeta px-4 pb-1">
            <div className="-mx-4 flex flex-wrap items-center justify-between gap-x-4 px-4">
              {listaPestanas()}
              <div className="py-1.5">
                <Filtros vendedores={vendedores} productos={productos} ligero />
              </div>
            </div>
          </div>
          <CuerpoFunnel m={m} dinero={$} />
          <div className="flex items-center gap-2 text-xs text-texto-3">
            <Wallet className="h-3.5 w-3.5" /> Facturación = valor total de los contratos cerrados. Cash collected = dinero ya cobrado (pagos iniciales + cuotas cobradas en el periodo − devoluciones del periodo).
          </div>
        </Contenido>
      </>
    );
  }

  if (vista === "personas") {
    // 13 oct (Cristian): se fusiona Agendas → Métricas aquí: misma barra (Individual/Comparativa, closer, producto y
    // periodo con flechas) y sus métricas de closers. El periodo de la barra vale para toda la página.
    const per = leerPeriodo(sp);
    const rango = rangoNav(per.periodo, per.n, proyecto.zona_horaria, per.desde, per.hasta);
    const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
    // 13 nov: los jefes filtran por mercado (Todos / España / Latam): personas, totales y métricas de las agendas
    const mercados = await mercadosDelProyecto(proyecto.id);
    const filtroM = jefe && !propio ? mercadoValido(sp.mercado) : null;
    const entra = (id: string) => entraEnMercado(mercados, id, filtroM);
    const todos = calcularKpis(filtroM ? { ...base, gente: base.gente.filter((g) => entra(g.id)) } : base, rango, proyecto.zona_horaria);
    const kpis = propio ? { ...todos, callers: todos.callers.filter((c) => c.perfil.id === perfil.id), closers: todos.closers.filter((c) => c.perfil.id === perfil.id) } : todos;
    // Fase 5: tarjetas por persona y embudo del equipo
    const n = (x: number) => x.toLocaleString("es-ES");
    const tarjetasCallers: PersonaKpi[] = kpis.callers.map((c) => ({
      id: c.perfil.id,
      nombre: c.perfil.nombre,
      foto: c.perfil.foto,
      rol: "Caller",
      mercado: mercadoDe(mercados[c.perfil.id]),
      grandes: [
        { t: "Llamadas", v: n(c.llamadas) },
        { t: "Contactados", v: n(c.contactados) },
        { t: "Agendados", v: n(c.agendados) },
        { t: "Cerrados", v: n(c.cerrados) },
      ],
      tasas: [
        { t: "Agendan / contactados", v: pct(c.agendaSobreContactado), tasa: c.agendaSobreContactado },
        { t: "Asistencia", v: pct(c.asistencia), tasa: c.asistencia },
        { t: "Cierre / agendados", v: pct(c.cierreSobreAgendado), tasa: c.cierreSobreAgendado },
      ],
      detalle: [
        { t: "Llamadas", v: n(c.llamadas) },
        { t: "Contactados", v: n(c.contactados) },
        { t: "Contestan", v: n(c.contestan) },
        { t: "Agendados", v: n(c.agendados) },
        { t: "% agendan / contactados", v: pct(c.agendaSobreContactado) },
        { t: "% agendan / contestan", v: pct(c.agendaSobreContesta) },
        { t: "Cerrados", v: n(c.cerrados) },
        { t: "% cierre / contactados", v: pct(c.cierreSobreContactado) },
        { t: "% cierre / agendados", v: pct(c.cierreSobreAgendado) },
        { t: "% asistencia", v: pct(c.asistencia) },
        { t: "% cierre / asistencia", v: pct(c.cierreSobreAsistencia) },
        { t: "Low ticket", v: c.lowTicketVentas ? `${c.lowTicketVentas} · ${$(c.lowTicketFacturacion)}` : "—" },
      ],
    }));
    const tarjetasClosers: PersonaKpi[] = kpis.closers.map((c) => ({
      id: c.perfil.id,
      nombre: c.perfil.nombre,
      foto: c.perfil.foto,
      rol: "Closer",
      mercado: mercadoDe(mercados[c.perfil.id]),
      grandes: [
        { t: "Citas", v: n(c.citas) },
        { t: "Asistidas", v: n(c.asistidas) },
        { t: "Cerradas", v: n(c.cerradas) },
        { t: "Facturación", v: $(c.facturacion) },
      ],
      tasas: [
        { t: "Cierre / agenda", v: pct(c.cierreSobreAgenda), tasa: c.cierreSobreAgenda },
        { t: "Cierre / asistencia", v: pct(c.cierreSobreAsistencia), tasa: c.cierreSobreAsistencia },
        { t: "Cobrado", v: pct(c.pctCobrado), tasa: c.pctCobrado },
      ],
      detalle: [
        { t: "Citas", v: n(c.citas) },
        { t: "Asistidas", v: n(c.asistidas) },
        { t: "Cerradas", v: n(c.cerradas) },
        { t: "% cierre / agenda", v: pct(c.cierreSobreAgenda) },
        { t: "% cierre / asistencia", v: pct(c.cierreSobreAsistencia) },
        { t: "Facturación", v: $(c.facturacion) },
        { t: "% facturación del total", v: pct(c.parteFacturacion) },
        { t: "Cash", v: $(c.cash) },
        { t: "% cash del total", v: pct(c.parteCash) },
        { t: "% cobrado", v: pct(c.pctCobrado) },
      ],
    }));
    const leadsPeriodo = base.leads.filter((l) => enRango(l.creado_en, rango)).length;

    // Métricas de las agendas (las de Agendas → Métricas). Un caller ve solo las citas que agendó él; un closer, las suyas
    const [agendas, canales] = await Promise.all([cargarAgendas(proyecto, !!perfil.es_prueba), canalesDe(proyecto.id)]);
    const mirar = perfil.rol === "caller";
    if (mirar) {
      agendas.citas = agendas.citas.filter((c) => c.agendada_por === perfil.id || c.closer_id === perfil.id);
      const suyos = new Set(agendas.citas.map((c) => c.lead_id));
      agendas.ventas = agendas.ventas.filter((v) => suyos.has(v.lead_id));
      const ventas = new Set(agendas.ventas.map((v) => v.id));
      agendas.pagos = agendas.pagos.filter((x) => ventas.has(x.venta_id));
    }
    const vis = closersVisibles(perfil, filtroM ? agendas.gente.filter((g) => entra(g.id)) : agendas.gente, str("closer"));
    const filtrosAg = { productoId: str("producto"), evento: str("evento"), canal: str("canal") || null };
    const mAg = metricasAgendas(agendas, rango, { closerIds: vis.ids, ...filtrosAg });
    const comparativaVisible = jefe && !propio;
    const porCloser = comparativaVisible
      ? vis.todos.map((c) => ({ c, m: metricasAgendas(agendas, rango, { closerIds: [c.id], ...filtrosAg }) })).filter(({ c, m }) => !("baja" in c && c.baja) || m.agendadas || m.cash)
      : [];
    const panel = jefe ? null : await panelObjetivos(proyecto, perfil); // cada uno ve sus objetivos (como en Agendas)
    const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    const filtrosComunes = (
      <>
        {jefe && !propio && <FiltroMercado />}
        <FiltroUrl nombre="producto" etiqueta="Producto" todos="Todos los productos" opciones={agendas.productos.map((x) => ({ v: x.id, t: x.nombre }))} />
        {/* Fase 4 (plan GHL): canal de la cita, por el UTM de la página donde reservó */}
        <FiltroUrl nombre="canal" etiqueta="Canal" todos="Todos los canales" opciones={[...opcionesCanal(canales).map((c) => ({ v: c.clave as string, t: c.nombre })), { v: SIN_CANAL, t: "Sin canal" }]} />
        {agendas.eventos.length > 0 && <FiltroUrl nombre="evento" etiqueta="Evento" todos="Todos los eventos" opciones={agendas.eventos.map((e) => ({ v: e, t: e }))} />}
        <div className="2xl:ml-auto"><BarraPeriodo etiqueta={rango.etiqueta} /></div>
      </>
    );
    return (
      <>
        <Cabecera
          titulo="KPIs"
          subtitulo={`${proyecto.nombre} · ${rango.etiqueta}`}
          acciones={
            mirar ? undefined : (
              <a href={`/closer/reporte?${qs}`} className="btn-secundario" title="Descarga un PDF con las métricas de los closers de este periodo">
                <FileDown className="h-4 w-4" /> Generar reporte
              </a>
            )
          }
        />
        <Contenido>
          {!propio && pestanas}
          {panel && <PanelObjetivos panel={panel} dinero={$} celebrar={`${perfil.id}-${hoyEnZona(proyecto.zona_horaria)}`} />}
          {comparativaVisible ? (
            <VistaAgendas
              inicial={str("modo") === "comparativa" ? "comparativa" : "individual"}
              parametro="modo"
              filtroIndividual={<FiltroUrl nombre="closer" etiqueta="Closer" todos="Todos los closers" opciones={vis.todos.map((c) => ({ v: c.id, t: c.nombre }))} />}
              resto={filtrosComunes}
              individual={<IndividualAgendas m={mAg} moneda={$} />}
              comparativa={<ComparativaAgendas filas={porCloser} moneda={$} />}
            />
          ) : (
            <>
              <div className="tarjeta flex flex-wrap items-center gap-2 p-2.5">{filtrosComunes}</div>
              <IndividualAgendas m={mAg} moneda={$} />
            </>
          )}
          {!propio && (
            <Seccion titulo="Embudo del equipo">
              <Embudo
                titulo="Embudo del equipo"
                pasos={[
                  { t: "Leads", n: leadsPeriodo, d: "Leads que entraron en el periodo" },
                  { t: "Contactados", n: kpis.totalCallers.contactados, d: "Personas a las que un caller llamó o escribió en el periodo" },
                  { t: "Agendados", n: kpis.totalCallers.agendados, d: "Personas con una cita agendada por un caller en el periodo" },
                  { t: "Asistieron", n: kpis.totalClosers.asistidas, d: "Citas del periodo a las que vino el lead" },
                  { t: "Cerrados", n: kpis.totalClosers.cerradas, d: "Citas del periodo cerradas con venta" },
                ]}
              />
              <p className="mt-2 text-xs text-texto-3">Cada paso cuenta lo que pasó en el periodo: no es la misma tanda de personas de arriba abajo.</p>
            </Seccion>
          )}
          <Seccion titulo="Callers">
            <TarjetasKpis personas={tarjetasCallers} vacio={propio ? "Aquí solo ves lo tuyo." : "No hay callers en este proyecto."} conFicha={jefe && !propio} />
          </Seccion>
          <Seccion titulo="Closers">
            <TarjetasKpis personas={tarjetasClosers} vacio={propio ? "Aquí solo ves lo tuyo." : "No hay closers en este proyecto."} conFicha={jefe && !propio} />
          </Seccion>
          <details className="tarjeta p-4">
            <summary className="cursor-pointer text-sm font-medium text-texto-2">Ver como tabla (con los totales)</summary>
            <div className="mt-4">
              <TablasKpis kpis={kpis} dinero={$} sinTotales={propio} mercados={mercados} />
            </div>
          </details>
          <Seccion titulo="¿Cómo se calcula cada número?">
            <ExplicacionKpis />
            {/* Las de las agendas de los closers (antes en Agendas → Métricas) */}
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-texto-2">
              <li><b>Agendadas:</b> citas con fecha en el periodo (una cita reagendada no cuenta dos veces).</li>
              <li><b>Asistencias:</b> citas cerradas, en seguimiento o perdidas (hubo llamada).</li>
              <li><b>% cierre:</b> cerradas ÷ asistencias. <b>Call/close:</b> cerradas ÷ agendadas.</li>
              <li><b>Facturación:</b> valor de las ventas de los closers con fecha en el periodo.</li>
              <li><b>Cash collected:</b> lo cobrado al vender + las cuotas cobradas en el periodo − las devoluciones del periodo.</li>
              <li><b>Calificados 4★+:</b> asistencias a las que el closer puso 4 o 5 estrellas.</li>
              <li><b>Closer y Producto</b> filtran solo las métricas de las agendas; el periodo vale para toda la página.</li>
            </ul>
          </Seccion>
        </Contenido>
      </>
    );
  }

  // ---------- Objetivos ----------
  const datos = await cargarObjetivos(proyecto.id);
  const personas = base.gente.filter((g) => !("baja" in g && g.baja) && (g.rol === "caller" || g.rol === "closer" || g.rol === "director"));
  // Pendiente 9 (10 oct 2026): ver el avance de un periodo pasado (?ver=AAAA-MM-DD; sin fecha, ahora)
  const hoy = hoyEnZona(proyecto.zona_horaria);
  const ver = typeof sp.ver === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.ver) && sp.ver <= hoy ? sp.ver : hoy;
  const avances = calcularAvances(base, datos, personas, proyecto.zona_horaria, ver);
  const finMesPasado = sumarDias(`${hoy.slice(0, 8)}01`, -1);
  const saltos = [
    { t: "Ahora", f: hoy },
    { t: "Semana pasada", f: sumarDias(hoy, -7) },
    { t: "Mes pasado", f: finMesPasado },
  ];
  const delEquipo = avancesDelEquipo(base, datos, proyecto.zona_horaria);
  const actuales = vigentes(datos.filas, null);
  const nombre = new Map(base.gente.map((g) => [g.id, g.nombre]));
  const lanz = new Map(datos.lanzamientos.map((l) => [l.id, l]));
  const eventos = [...new Set((await todas<{ evento: string }>((a, b) => db().from("leads").select("evento").eq("proyecto_id", proyecto.id).not("evento", "is", null).order("id").range(a, b))).map((l) => l.evento))].sort();
  const ORDEN_ROL: Record<string, number> = { director: 0, closer: 1, caller: 2 };

  return (
    <>
      <Cabecera titulo="KPIs" subtitulo={`${proyecto.nombre} · Objetivos`} />
      <Contenido>
        {pestanas}

        <Seccion titulo="Objetivo del equipo (lo ven todos en «Mis leads» y «Mis agendas»)">
          <BarrasObjetivos avances={delEquipo} dinero={$} sinNotaRol vacio="Pon un objetivo a «Directores (equipo entero)» y lo verá todo el equipo." />
        </Seccion>

        <Seccion titulo={ver === hoy ? "Avance de ahora (hoy, esta semana, este mes y lanzamientos en curso)" : `Avance del ${ver} (ese día, su semana, su mes y los lanzamientos de entonces)`}>
          <form className="mb-4 flex flex-wrap items-center gap-2 text-sm" action="/kpis">
            <input type="hidden" name="vista" value="objetivos" />
            {saltos.map((x) => (
              <Link key={x.t} href={x.f === hoy ? "/kpis?vista=objetivos" : `/kpis?vista=objetivos&ver=${x.f}`} className={`rounded-full px-3 py-1 ${ver === x.f ? "bg-primario text-white" : "bg-panel-2 text-texto-2 hover:text-texto"}`}>{x.t}</Link>
            ))}
            <label className="flex items-center gap-1.5 text-texto-2">o el día <input type="date" name="ver" max={hoy} defaultValue={ver} className="campo w-auto py-1" aria-label="Ver el avance de este día" /></label>
            <button className="btn-secundario px-2.5 py-1 text-xs">Ver</button>
          </form>
          {personas.length === 0 ? (
            <Vacio icono={Target} texto="No hay callers, closers ni directores en este proyecto." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[...personas]
                .sort((a, b) => ORDEN_ROL[a.rol] - ORDEN_ROL[b.rol] || a.nombre.localeCompare(b.nombre))
                .map((p) => {
                  const suyos = avances.get(p.id) ?? [];
                  const medio = suyos.length ? suyos.reduce((s, a) => s + Math.min(100, a.pct), 0) / suyos.length : null;
                  return (
                    <TarjetaObjetivos
                      key={p.id}
                      id={p.id}
                      nombre={p.nombre}
                      foto={p.foto}
                      rol={`${ETIQUETA_ROL[p.rol]}${p.rol === "director" ? " (equipo entero)" : ""}`}
                      medio={medio}
                      cumplidos={suyos.filter((a) => a.hecho >= a.meta).length}
                      total={suyos.length}
                      conFicha
                    >
                      <BarrasObjetivos avances={suyos} dinero={$} vacio="Sin objetivos ahora." />
                    </TarjetaObjetivos>
                  );
                })}
            </div>
          )}
        </Seccion>

        <Seccion titulo="Nuevo objetivo">
          <FormObjetivo
            personas={personas.map((p) => ({ id: p.id, nombre: p.nombre, rol: p.rol as RolObjetivo }))}
            lanzamientos={datos.lanzamientos.map((l) => ({ id: l.id, nombre: l.nombre }))}
          />
        </Seccion>

        <Seccion titulo="Objetivos puestos">
          {actuales.length === 0 ? (
            <Vacio icono={Target} texto="Todavía no hay objetivos." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-borde">
              <table className="tabla">
                <thead><tr><th>Para</th><th>Periodo</th><th>Cifra</th><th>Objetivo</th><th>Días</th><th></th></tr></thead>
                <tbody>
                  {actuales
                    .sort((a, b) => (a.perfil_id ? 1 : 0) - (b.perfil_id ? 1 : 0) || a.periodo.localeCompare(b.periodo))
                    .map((o) => {
                      const c = CIFRAS.find((x) => x.v === o.cifra)!;
                      return (
                        <tr key={o.id}>
                          <td className="whitespace-nowrap">{o.perfil_id ? nombre.get(o.perfil_id) ?? "—" : `Todos los ${o.rol === "director" ? "directores" : `${o.rol}s`}`}</td>
                          <td className="whitespace-nowrap">{o.periodo === "lanzamiento" ? lanz.get(o.lanzamiento_id!)?.nombre : PERIODOS.find((p) => p.v === o.periodo)?.t}</td>
                          <td>{c.t}</td>
                          <td className="tabular-nums">{c.dinero ? $(o.valor!) : o.valor!.toLocaleString("es-ES")}</td>
                          <td className="whitespace-nowrap text-texto-2">{o.periodo === "dia" ? o.dias.map((d) => DIAS[d - 1]).join(" ") : "—"}</td>
                          <td><BotonQuitarObjetivo id={o.id} /></td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>

        <Seccion titulo="Lanzamientos">
          <FormLanzamiento eventos={eventos} />
          {datos.lanzamientos.length > 0 && (
            <ul className="mt-4 divide-y divide-borde rounded-lg border border-borde">
              {[...datos.lanzamientos].sort((a, b) => b.inicio.localeCompare(a.inicio)).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{l.nombre}</div>
                    <div className="flex items-center gap-1.5 text-xs text-texto-2">
                      <CalendarRange className="h-3.5 w-3.5" /> {l.inicio} → {l.fin} · {l.evento ? `solo leads de «${l.evento}»` : "cuenta todo lo de esas fechas"}
                    </div>
                  </div>
                  <BotonBorrarLanzamiento id={l.id} nombre={l.nombre} />
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      </Contenido>
    </>
  );
}
