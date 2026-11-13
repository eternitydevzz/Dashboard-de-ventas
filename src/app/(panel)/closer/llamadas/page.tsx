import Link from "next/link";
import { Inbox, Download, ChevronLeft, ChevronRight, List, CalendarDays, Columns3 } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { db, equipo } from "@/lib/datos";
import { dinero, fechaHora, fecha as soloFecha, ahoraMs, hoyEnZona, inicioDia, ETIQUETA_ESTADO_CITA, nombrePais } from "@/lib/formato";
import { closersVisibles } from "@/lib/agendas-datos";
import { ABIERTAS, SUB_POSTCALL, celdasMes, coincide, diaEnZona, enPostcall, esColumnaVentas, esPrecall, partirCloser, porRecuperar, quienLlevaba, ventasPostcall, type SubPostcall } from "@/lib/llamadas";
import { cargarCitasVentas, columnasCloser, etapasCloser, nombreDe, type CitaFila } from "@/lib/tablero-closers";
import { Cabecera, Contenido, Insignia, Vacio } from "@/components/ui";
import { FiltroUrl } from "@/components/barra-periodo";
import { VerEstrellas } from "@/components/estrellas";
import { PestanasAgendas } from "../pestanas";
import { AccionesCita } from "../acciones-cita";
import { FilaVentaAcciones } from "@/app/(panel)/ventas/fila-acciones";
import { Grabaciones } from "./grabaciones";
import { RevisionIa } from "./revision-ia";
import { Cualificacion } from "./cualificacion";
import { TableroClosers } from "./tablero-closers";
import { BuscadorUrl, CrearLlamada, FilaSinUnir, ImportarCitas, SincronizarGhl } from "./cliente";
import type { Producto } from "@/lib/tipos";
import { SIN_CANAL, opcionesCanal, origenCitaGhl } from "@/lib/canal";
import { canalesDe } from "@/lib/canales-datos";
import { mercadosDelProyecto, miMoneda } from "@/lib/mercado-datos";
import { entraEnMercado, mercadoValido, type Mercado } from "@/lib/mercado";
import { EtiquetaMercado, FiltroMercado } from "@/components/mercado-equipo";

const TABS = [
  { v: "agendas", t: "Agendas" },
  { v: "precall", t: "Pre-call" },
  { v: "postcall", t: "Post-call" },
  { v: "grabaciones", t: "Grabaciones" },
  { v: "revision", t: "Revisión IA" },
  { v: "cualificacion", t: "Cualificación", soloJefe: true },
] as const;
const FILTROS_ESTADO = [
  { v: "", t: "Todos" },
  { v: "abiertas", t: "Pendientes" },
  { v: "cerrada", t: "Cerradas" },
  { v: "perdida", t: "Perdidas" },
  { v: "no_show", t: "No-show" },
  { v: "reagendada", t: "Reagendadas" },
  { v: "cancelada", t: "Canceladas" },
];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const tonoEstado = (e: string) => (e === "cerrada" ? "ok" : e === "confirmada" ? "primario" : ["no_show", "perdida", "cancelada", "no_califica"].includes(e) ? "mal" : "aviso");
const sumarMes = (ym: string, n: number) => {
  const d = new Date(`${ym}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

export default async function LlamadasPage({ searchParams }: PageProps<"/closer/llamadas">) {
  const { perfil, proyecto } = await exigirPagina("agendas"); // H5
  const monedaVenta = await miMoneda(proyecto, perfil.id); // 13 nov: € para el equipo de España (mismo número)
  const jefe = esJefe(perfil);
  // H5 (caso 1 confirmado por Cristian): un caller con «Agendas» ve solo las citas que agendó él, solo para mirar
  const mirar = perfil.rol === "caller";
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const tabsVisibles = TABS.filter((t) => (!("soloJefe" in t) || jefe) && (!mirar || ["agendas", "precall", "postcall"].includes(t.v)));
  const tab = (tabsVisibles.some((t) => t.v === str("tab")) ? str("tab") : "agendas") as (typeof TABS)[number]["v"];
  const q = str("q");
  const zona = proyecto.zona_horaria;
  const ahora = ahoraMs();

  const [gente, mercados] = await Promise.all([equipo(proyecto.id, !!perfil.es_prueba), jefe ? mercadosDelProyecto(proyecto.id) : ({} as Record<string, Mercado>)]);
  // 13 nov: los jefes filtran por mercado (Todos / España / Latam) los closers y, con ellos, sus citas
  const filtroM = jefe ? mercadoValido(sp.mercado) : null;
  const vis = closersVisibles(perfil, filtroM ? gente.filter((g) => entraEnMercado(mercados, g.id, filtroM)) : gente, str("closer") || null);
  // Paso 0: las mismas citas, ventas y columnas que el pipeline «Closers» del CRM
  const [{ citas: citasTodas, ventas: ventasTodas, gente: conBaja }, productos, { etapas: etapasCl }, canales] = await Promise.all([
    cargarCitasVentas(proyecto.id, vis.ids, mirar ? perfil.id : null, jefe && !str("closer") && !filtroM, gente), // con mercado, sin las citas sin closer; N5: con las de closers de baja
    db().from("productos").select("*").eq("proyecto_id", proyecto.id).eq("activo", true).order("orden"),
    etapasCloser(proyecto.id),
    canalesDe(proyecto.id), // B2b
  ]);
  // GHL: si está conectado y qué citas no se han podido unir a un lead
  const [{ data: pg }, { data: sinUnir }] = await Promise.all([
    db().from("proyectos").select("ghl_token, ghl_location_id, ghl_sincronizado_en").eq("id", proyecto.id).single(),
    db().from("citas_sin_lead").select("id, titulo, fecha, closer_id, estado").eq("proyecto_id", proyecto.id).in("estado", ["pendiente", "invalida"]).order("fecha"),
  ]);
  const nombrePersona = (id: string | null) => conBaja.find((g) => g.id === id)?.nombre ?? "—"; // N5: «Ana (baja)»
  const ghlConectado = !!(pg?.ghl_token && pg?.ghl_location_id);
  const pendientesUnir = (sinUnir ?? []).filter((x) => x.estado === "pendiente");
  const invalidas = (sinUnir ?? []).filter((x) => x.estado === "invalida");
  const prods = (productos.data ?? []) as Producto[];
  const utm = str("utm");
  const canal = str("canal");
  const citas = citasTodas.filter(
    (c) => coincide(q, nombreDe(c.leads), c.leads?.email, c.leads?.telefono) && (!utm || (c.leads?.seguimiento?.utm_source || "Sin UTM") === utm) && (!canal || (c.canal ?? SIN_CANAL) === canal)
  );
  const utms = [...new Set(citasTodas.map((c) => c.leads?.seguimiento?.utm_source || "Sin UTM"))].sort();
  const ventas = ventasTodas;
  const partes = partirCloser(etapasCl);
  // Tablero «Closers» (Pre-call o Post-call): las columnas de esa parte, con las citas que pasan el buscador
  const tablero = (lista: typeof etapasCl) => {
    const { columnas } = columnasCloser(lista, citas, ventas, { proyecto, jefe, nombrePersona, canales });
    return <TableroClosers columnas={columnas} productos={prods} moneda={monedaVenta} jefe={jefe} soloMirar={mirar} />;
  };

  // Contadores de arriba (este mes)
  const mesIni = inicioDia(`${hoyEnZona(zona).slice(0, 8)}01`, zona).getTime();
  const delMes = citasTodas.filter((c) => new Date(c.fecha).getTime() >= mesIni);
  const contadores = { pendientes: citasTodas.filter((c) => (ABIERTAS as readonly string[]).includes(c.estado)).length, cerradas: delMes.filter((c) => c.estado === "cerrada").length, perdidas: delMes.filter((c) => c.estado === "perdida").length };
  const baseQs = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/closer/llamadas?${p}`;
  };

  return (
    <>
      <Cabecera
        titulo="Agendas"
        subtitulo={`${proyecto.nombre} · ${jefe ? (str("closer") ? nombrePersona(str("closer")) : "todos los closers") : mirar ? `citas que agendó ${perfil.nombre} (solo mirar)` : perfil.nombre}`}
        acciones={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span><b className="text-aviso">{contadores.pendientes}</b> pendientes</span>
            <span><b className="text-ok">{contadores.cerradas}</b> cerradas</span>
            <span><b className="text-mal">{contadores.perdidas}</b> perdidas <span className="text-xs text-texto-3">(este mes)</span></span>
            {!mirar && <SincronizarGhl conectado={ghlConectado} ultima={pg?.ghl_sincronizado_en ? fechaHora(pg.ghl_sincronizado_en, proyecto) : null} haceSegundos={pg?.ghl_sincronizado_en ? Math.max(0, Math.round((ahora - new Date(pg.ghl_sincronizado_en).getTime()) / 1000)) : null} />}
          </div>
        }
      />
      <Contenido>
        <PestanasAgendas activa="/closer/llamadas" />
        <div className="flex flex-wrap gap-1 rounded-xl border border-borde bg-panel p-1">
          {tabsVisibles.map((t, i) => (
            <Link prefetch={true} key={t.v} href={baseQs({ tab: t.v, sub: null, vista: null, conc: null, cual: null })} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${tab === t.v ? "bg-primario-suave font-medium text-primario" : "text-texto-2 hover:bg-panel-2"}`}>
              <span className="font-mono text-[10px] text-oro">0{i + 1}</span> {t.t}
              {t.v === "precall" && <span className="rounded-full bg-panel-2 px-1.5 text-[11px] tabular-nums">{citasTodas.filter((c) => esPrecall(c, ahora)).length}</span>}
            </Link>
          ))}
        </div>

        <div className="tarjeta flex flex-wrap items-center gap-2 p-2.5">
          <BuscadorUrl placeholder="Buscar por nombre, email o teléfono…" />
          {jefe && <FiltroMercado />}
          {jefe && <FiltroUrl nombre="closer" etiqueta="Closer" todos="Todos los closers" opciones={vis.todos.map((c) => ({ v: c.id, t: c.nombre }))} />}
          {/* Fase 4 (plan GHL): canal de la cita, por el UTM de la página donde reservó */}
          <FiltroUrl nombre="canal" etiqueta="Canal" todos="Todos los canales" opciones={[...opcionesCanal(canales).map((c) => ({ v: c.clave as string, t: c.nombre })), { v: SIN_CANAL, t: "Sin canal" }]} />
          <FiltroUrl nombre="utm" etiqueta="UTM" todos="Todas las UTM" opciones={utms.map((u) => ({ v: u, t: u }))} />
          {!mirar && <div className="ml-auto flex flex-wrap gap-2">
            <CrearLlamada closers={(jefe ? vis.todos : vis.closers).map((c) => ({ id: c.id, nombre: c.nombre }))} soyCloser={jefe ? null : perfil.id} />
            {jefe && <ImportarCitas />}
            <a href={`/closer/llamadas/exportar?${new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][])}`} className="btn-secundario"><Download className="h-4 w-4" /> Exportar</a>
          </div>}
        </div>

        {jefe && (pendientesUnir.length > 0 || invalidas.length > 0) && str("revisar") !== "1" && str("revisar") !== "invalidas" && (
          <p className="text-sm text-texto-2">
            ¿No ves todas las agendas? {pendientesUnir.length > 0 && <>Hay <b>{pendientesUnir.length}</b> de GHL sin unir a un lead. <Link href={baseQs({ tab: "agendas", revisar: "1" })} className="font-medium text-oro hover:underline">Revisar →</Link></>}
            {invalidas.length > 0 && <> · <Link href={baseQs({ tab: "agendas", revisar: "invalidas" })} className="text-texto-3 hover:underline">Ver inválidas ({invalidas.length})</Link></>}
          </p>
        )}
        {jefe && (str("revisar") === "1" || str("revisar") === "invalidas") && (
          <div className="tarjeta overflow-hidden">
            <div className="flex items-center justify-between border-b border-borde px-4 py-2">
              <h2 className="font-semibold">{str("revisar") === "1" ? "Citas de GHL sin unir a un lead" : "Citas marcadas como inválidas en GHL"}</h2>
              <Link href={baseQs({ revisar: null })} className="text-sm text-primario hover:underline">Cerrar</Link>
            </div>
            {(str("revisar") === "1" ? pendientesUnir : invalidas).length === 0 ? (
              <Vacio icono={Inbox} texto="No queda ninguna." />
            ) : (
              <ul className="divide-y divide-borde">
                {(str("revisar") === "1" ? pendientesUnir : invalidas).map((x) => (
                  <FilaSinUnir key={x.id} id={x.id} titulo={x.titulo ?? ""} fechaTxt={x.fecha ? fechaHora(x.fecha, proyecto) : "—"} closer={nombrePersona(x.closer_id)} />
                ))}
              </ul>
            )}
          </div>
        )}
        {tab === "agendas" && <VistaAgendas />}
        {tab === "precall" && <VistaPrecall />}
        {tab === "postcall" && <VistaPostcall />}
        {tab === "revision" && <RevisionIa proyecto={proyecto} closerIds={vis.ids} jefe={jefe} sinLead={pendientesUnir.length} baseQs={baseQs} />}
        {tab === "cualificacion" && jefe && <Cualificacion proyecto={proyecto} sp={sp} baseQs={baseQs} />}
        {tab === "grabaciones" && <Grabaciones proyecto={proyecto} sp={sp} closerIds={vis.ids} closers={vis.todos.map((c) => ({ id: c.id, nombre: c.nombre }))} jefe={jefe} yo={perfil.id} baseQs={baseQs} />}
      </Contenido>
    </>
  );

  // ---------- 01 · Agendas (calendario y lista) ----------
  function VistaAgendas() {
    const vista = ["mes", "semana", "dia", "lista"].includes(str("vista")) ? str("vista") : "mes";
    const estado = str("estado");
    const filtradas = citas.filter((c) => !estado || (estado === "abiertas" ? (ABIERTAS as readonly string[]).includes(c.estado) : c.estado === estado));
    const hoy = hoyEnZona(zona);
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(str("d")) ? str("d") : hoy;
    const ym = /^\d{4}-\d{2}$/.test(str("m")) ? str("m") : dia.slice(0, 7);
    const porDia = new Map<string, CitaFila[]>();
    for (const c of filtradas) {
      const d = diaEnZona(c.fecha, zona);
      porDia.set(d, [...(porDia.get(d) ?? []), c]);
    }
    const vistas = [
      { v: "mes", t: "Mes", i: CalendarDays },
      { v: "semana", t: "Semana", i: Columns3 },
      { v: "dia", t: "Día", i: CalendarDays },
      { v: "lista", t: "Lista", i: List },
    ];
    const lunes = (() => {
      const d = new Date(`${dia}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d;
    })();
    const semana = Array.from({ length: 7 }, (_, i) => new Date(lunes.getTime() + i * 86_400_000).toISOString().slice(0, 10));
    const moverDia = (n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
    return (
      <div className="tarjeta overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-borde p-2">
          {FILTROS_ESTADO.map((f) => (
            <Link prefetch={true} key={f.v} href={baseQs({ estado: f.v || null })} className={`rounded-full px-3 py-1 text-sm ${estado === f.v ? "bg-primario text-white" : "bg-panel-2 text-texto-2 hover:text-texto"}`}>{f.t}</Link>
          ))}
          <div className="ml-auto flex rounded-lg border border-borde bg-panel-2 p-0.5">
            {vistas.map((v) => (
              <Link prefetch={true} key={v.v} href={baseQs({ vista: v.v })} className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs ${vista === v.v ? "bg-primario text-white" : "text-texto-2"}`}><v.i className="h-3.5 w-3.5" />{v.t}</Link>
            ))}
          </div>
        </div>

        {vista === "mes" && (
          <div className="p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{MESES[Number(ym.slice(5)) - 1].replace(/^./, (x) => x.toUpperCase())} de {ym.slice(0, 4)} <span className="ml-2 rounded-full bg-oro-suave px-2 py-0.5 text-xs font-medium text-oro">{(() => { const n = filtradas.filter((c) => diaEnZona(c.fecha, zona).startsWith(ym)).length; return `${n} ${n === 1 ? "llamada" : "llamadas"}`; })()}</span></h2>
              <div className="flex gap-1">
                <Link href={baseQs({ m: sumarMes(ym, -1) })} className="btn-secundario p-2" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></Link>
                <Link href={baseQs({ m: sumarMes(ym, 1) })} className="btn-secundario p-2" aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></Link>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-texto-3">{DIAS.map((d) => <div key={d} className="py-1">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {celdasMes(`${ym}-01`).map((d, i) =>
                d ? (
                  <Link key={d} href={baseQs({ vista: "dia", d })} className={`min-h-20 rounded-lg border p-1.5 text-left transition hover:border-primario ${d === hoy ? "border-primario/60 bg-primario-suave/40" : "border-borde bg-panel"}`}>
                    <div className="text-xs text-texto-3">{Number(d.slice(8))}</div>
                    {(porDia.get(d) ?? []).length > 0 && (
                      <>
                        <div className="mt-1 text-center text-xs font-semibold sm:text-sm">{porDia.get(d)!.length}<span className="hidden sm:inline"> {porDia.get(d)!.length === 1 ? "llamada" : "llamadas"}</span></div>
                        <div className="mt-1 flex flex-wrap justify-center gap-0.5">
                          {porDia.get(d)!.slice(0, 6).map((c) => <span key={c.id} title={ETIQUETA_ESTADO_CITA[c.estado]} className={`h-1.5 w-1.5 rounded-full ${c.estado === "cerrada" ? "bg-ok" : ["no_show", "perdida", "cancelada", "no_califica"].includes(c.estado) ? "bg-mal" : "bg-aviso"}`} />)}
                        </div>
                      </>
                    )}
                  </Link>
                ) : (
                  <div key={`v${i}`} />
                )
              )}
            </div>
            <p className="mt-2 flex flex-wrap gap-3 text-xs text-texto-3"><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-aviso" />Por hacer o en seguimiento</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-ok" />Cerrada</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-mal" />Perdida, no-show, cancelada o no califica</span> · Pulsa un día para ver sus llamadas.</p>
          </div>
        )}

        {vista === "semana" && (
          <div className="p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Semana del {soloFecha(`${semana[0]}T12:00:00Z`, proyecto)}</h2>
              <div className="flex gap-1">
                <Link href={baseQs({ d: moverDia(-7) })} className="btn-secundario p-2" aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></Link>
                <Link href={baseQs({ d: moverDia(7) })} className="btn-secundario p-2" aria-label="Semana siguiente"><ChevronRight className="h-4 w-4" /></Link>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-7">
              {semana.map((d, i) => (
                <div key={d} className="rounded-lg border border-borde bg-panel-2/60 p-2">
                  <Link href={baseQs({ vista: "dia", d })} className="text-xs font-medium text-texto-2 hover:text-primario">{DIAS[i]} {Number(d.slice(8))}</Link>
                  <ul className="mt-1 space-y-1">
                    {(porDia.get(d) ?? []).map((c) => (
                      <li key={c.id} className={`rounded-md px-2 py-1 text-xs ${porRecuperar(c) ? "bg-mal-suave" : "bg-panel"}`}>
                        <div className="font-medium">{new Intl.DateTimeFormat("es-ES", { timeZone: zona, hour: "2-digit", minute: "2-digit" }).format(new Date(c.fecha))}</div>
                        <a href={`/leads/${c.lead_id}`} className="block truncate hover:text-primario">{nombreDe(c.leads)}</a>
                        <Insignia tono={tonoEstado(c.estado)}>{ETIQUETA_ESTADO_CITA[c.estado]}</Insignia>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {(vista === "dia" || vista === "lista") && (
          <div>
            {vista === "dia" && (
              <div className="flex items-center justify-between border-b border-borde px-4 py-2">
                <h2 className="font-semibold">{soloFecha(`${dia}T12:00:00Z`, proyecto)}</h2>
                <div className="flex gap-1">
                  <Link href={baseQs({ d: moverDia(-1) })} className="btn-secundario p-2" aria-label="Día anterior"><ChevronLeft className="h-4 w-4" /></Link>
                  <Link href={baseQs({ d: moverDia(1) })} className="btn-secundario p-2" aria-label="Día siguiente"><ChevronRight className="h-4 w-4" /></Link>
                </div>
              </div>
            )}
            <ListaCitas filas={vista === "dia" ? porDia.get(dia) ?? [] : [...filtradas].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 300)} />
          </div>
        )}
      </div>
    );
  }

  // ---------- 02 · Pre-call ----------
  function VistaPrecall() {
    const pre = citas.filter((c) => esPrecall(c, ahora)).sort((a, b) => (str("orden") === "agendada" ? b.creado_en.localeCompare(a.creado_en) : a.fecha.localeCompare(b.fecha)));
    const tabla = str("vista") === "tabla";
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-texto-3">{pre.length} llamadas por hacer</span>
          <FiltroUrl nombre="orden" etiqueta="Orden" todos="Orden: fecha de llamada" opciones={[{ v: "agendada", t: "Orden: agendada el (más reciente)" }]} />
          <div className="ml-auto flex rounded-lg border border-borde bg-panel-2 p-0.5">
            <Link prefetch={true} href={baseQs({ vista: null })} className={`rounded-md px-2.5 py-1 text-xs ${!tabla ? "bg-primario text-white" : "text-texto-2"}`}>Pipeline</Link>
            <Link prefetch={true} href={baseQs({ vista: "tabla" })} className={`rounded-md px-2.5 py-1 text-xs ${tabla ? "bg-primario text-white" : "text-texto-2"}`}>Tabla</Link>
          </div>
        </div>
        {tabla ? (
          <div className="tarjeta overflow-hidden"><ListaCitas filas={pre} /></div>
        ) : (
          tablero(partes.pre)
        )}
      </div>
    );
  }

  // ---------- 03 · Post-call ----------
  function VistaPostcall() {
    const sub = (SUB_POSTCALL.some((s) => s.v === str("sub")) ? str("sub") : "pendientes") as SubPostcall;
    const inicioMes = inicioDia(`${hoyEnZona(zona).slice(0, 8)}01`, zona).getTime(); // «Cerradas»: las de este mes
    const deColumna = (s: "reserva" | "cuotas" | "cerradas") => ventasPostcall(ventas, s, inicioMes);
    const cuenta = (s: SubPostcall) => (esColumnaVentas(s) ? deColumna(s).length : citas.filter((c) => enPostcall(c, s, ahora)).length);
    const info = SUB_POSTCALL.find((s) => s.v === sub)!;
    const tabla = str("vista") === "tabla";
    const interruptor = (
      <div className="flex items-center justify-end">
        <div className="flex rounded-lg border border-borde bg-panel-2 p-0.5">
          <Link prefetch={true} href={baseQs({ vista: null })} className={`rounded-md px-2.5 py-1 text-xs ${!tabla ? "bg-primario text-white" : "text-texto-2"}`}>Pipeline</Link>
          <Link prefetch={true} href={baseQs({ vista: "tabla" })} className={`rounded-md px-2.5 py-1 text-xs ${tabla ? "bg-primario text-white" : "text-texto-2"}`}>Tabla</Link>
        </div>
      </div>
    );
    // Pipeline: las columnas de «Closers» desde la primera de Post-call (Paso 0)
    if (!tabla) {
      return (
        <div className="space-y-3">
          {interruptor}
          {tablero(partes.post)}
        </div>
      );
    }
    return (
      <div className="space-y-3">
      {interruptor}
      <div className="tarjeta overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-borde p-2">
          {SUB_POSTCALL.map((s) => (
            <Link key={s.v} href={baseQs({ sub: s.v })} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${sub === s.v ? "bg-oro-suave font-medium text-oro" : "text-texto-2 hover:bg-panel-2"}`}>
              {s.t}<span className="rounded-full bg-panel-2 px-1.5 text-[11px] tabular-nums">{cuenta(s.v)}</span>
            </Link>
          ))}
        </div>
        <p className="border-b border-borde px-4 py-2 text-xs text-texto-3">{info.d}</p>
        {esColumnaVentas(sub) ? (
          deColumna(sub).length === 0 ? (
            <Vacio icono={Inbox} texto={sub === "cerradas" ? "No hay ventas pagadas del todo este mes." : `No hay ventas con ${sub === "reserva" ? "reserva" : "cuotas"} por cobrar.`} />
          ) : (
            <ul className="divide-y divide-borde">
              {deColumna(sub).map((v) => (
                <li key={v.id} className="relative flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                  <div className="min-w-48 flex-1">
                    <a href={`/leads/${v.lead_id}`} className="font-medium hover:text-primario">{nombreDe(v.leads)}</a>
                    <div className="text-xs text-texto-3">{v.productos?.nombre ?? "Producto"} · vendida el {soloFecha(v.fecha, proyecto)}{jefe ? ` · ${nombrePersona(v.vendedor_id)}` : ""}{v.num_cuotas ? ` · ${v.num_cuotas} cuotas` : ""}</div>
                  </div>
                  <div className="text-right"><div className="tabular-nums">{dinero(Number(v.facturacion), proyecto)}</div><div className="text-xs text-aviso">Falta {dinero(v.pendiente, proyecto)}</div></div>
                  {!mirar && <FilaVentaAcciones ventaId={v.id} pendiente={v.pendiente} cobrado={Number(v.facturacion) - v.pendiente} devuelta={!!v.devuelto} jefe={jefe} />}
                </li>
              ))}
            </ul>
          )
        ) : (
          <ListaCitas filas={citas.filter((c) => enPostcall(c, sub, ahora)).sort((a, b) => b.fecha.localeCompare(a.fecha))} />
        )}
      </div>
      </div>
    );
  }

  function ListaCitas({ filas }: { filas: CitaFila[] }) {
    if (filas.length === 0) return <Vacio icono={Inbox} texto="No hay llamadas aquí." />;
    return (
      <ul className="divide-y divide-borde">
        {filas.map((c) => (
          <li key={c.id} className={`flex flex-wrap items-center gap-4 px-4 py-3 ${porRecuperar(c) ? "bg-mal-suave" : ""}`}>
            <div className="w-36 shrink-0">
              <div className="text-sm font-semibold">{fechaHora(c.fecha, proyecto)}</div>
              <div className="flex flex-wrap items-center gap-1 text-xs text-texto-3">{c.origen === "ghl" ? origenCitaGhl(c, canales) : `Agendó ${nombrePersona(c.agendada_por)}`}{jefe && c.origen !== "ghl" && c.agendada_por && <EtiquetaMercado m={mercados[c.agendada_por]} />}</div>
            </div>
            <div className="min-w-48 flex-1">
              <a href={`/leads/${c.lead_id}`} className="font-medium hover:text-primario">{nombreDe(c.leads)}</a>
              <div className="text-xs text-texto-3">{[c.leads?.telefono, c.leads?.telefono ? nombrePais(c.leads.pais) : null, c.leads?.email].filter(Boolean).join(" · ")}</div>
              {c.nota && <div className="mt-0.5 text-xs text-texto-2">📝 {c.nota}</div>}
              {(c.estrellas_caller || c.estrellas_closer) && (
                <div className="mt-0.5 flex flex-wrap gap-3">{c.estrellas_caller ? <span className="text-xs">Caller <VerEstrellas n={c.estrellas_caller} quien="caller" /></span> : null}{c.estrellas_closer ? <span className="text-xs">Closer <VerEstrellas n={c.estrellas_closer} quien="closer" /></span> : null}</div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {jefe && <Insignia tono={porRecuperar(c) ? "mal" : "neutro"}>{porRecuperar(c) ? `Recuperar · ${quienLlevaba(c, nombrePersona)}` : quienLlevaba(c, nombrePersona)}</Insignia>}
              {jefe && c.closer_id && <EtiquetaMercado m={mercados[c.closer_id]} />}
              <Insignia tono={tonoEstado(c.estado)}>{ETIQUETA_ESTADO_CITA[c.estado]}</Insignia>
            </div>
            {!mirar && <AccionesCita cita={{ id: c.id, estado: c.estado, lead_id: c.lead_id, closer_id: c.closer_id }} pasada={new Date(c.fecha).getTime() < ahora} productos={prods} moneda={monedaVenta} ceo={perfil.rol === "ceo" ? { closers: vis.todos.map((x) => ({ id: x.id, nombre: x.nombre })) } : undefined} />}
          </li>
        ))}
      </ul>
    );
  }
}
