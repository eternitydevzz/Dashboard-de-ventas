import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSesion, puedeAdmin, puedeCrearProyectos } from "@/lib/auth";
import { db } from "@/lib/datos";
import { dinero, fechaHora, ETIQUETA_ROL } from "@/lib/formato";
import { Cabecera, Contenido, Seccion, Insignia, Avatar } from "@/components/ui";
import { Plantilla, AnadirExistente, FormUsuario, FormProyecto, FormNuevoProyecto, LinkAgenda, Secreto } from "./cliente";
import type { Perfil, Producto, Rol } from "@/lib/tipos";
import { PLANTILLAS_GHL, CABECERA_SECRETO } from "@/lib/plantillas-ghl";
import { NuevaEntrada, TarjetaEntrada, type OpcionesGhl, type GhlDeEntrada } from "./entradas";
import { haceCuanto, type DatosLanding } from "@/lib/entradas-panel";
import { enviosDeEntrada, enviosEnRojo, resumenEntradas, ULTIMOS, type EnvioEntrada, type ResumenEntrada } from "@/lib/entradas-datos";
import { resumenWorkflows } from "@/lib/workflows-motor";
import type { WorkflowVista } from "./entradas-workflow";
import { VistaWorkflows, type EjecucionFila, type WorkflowFila } from "./workflows";
import { EditorWorkflow, type OpcionesEditor } from "./workflows-editor";
import type { Nombres } from "@/lib/workflows-vista";
import { camposGhl, columnasEnOrdenGhl, pipelinesGhl } from "@/lib/ghl";
import { descifrar } from "@/lib/cifrado";
import { ConexionGhl, CalendarioCloser, UsuarioGhl } from "./ghl";
import { reglasValidas } from "@/lib/entrada";
import { cargarDatosPermisos } from "@/lib/permisos-datos";
import { TablaPermisos, type DatosPermisos } from "./permisos";
import { FichaPersona } from "@/app/(panel)/equipo/ficha";
import { cargarEquipo } from "@/lib/equipo";
import { HorariosEquipo, FormAjustes } from "./horarios";
import { RepartoPorcentaje } from "./reparto-pct";
import { EditorTramos } from "./tramos";
import { EditorPreguntas } from "./preguntas-reporte";
import { FIJAS, preguntasDe } from "@/lib/reportes";
import { tramosDe } from "@/lib/comisiones";
import { horarioValido } from "@/lib/horarios";
import { ajustesValidos } from "@/lib/disponibilidad";
import { EnviarAccesos } from "./enviar-accesos";

const PESTANAS = [
  { v: "equipo", t: "Equipo" },
  { v: "proyecto", t: "Proyecto y reparto" },
  { v: "productos", t: "Productos" },
  { v: "comisiones", t: "Comisiones" }, // 1.0 bloque 4: tramos
  { v: "reportes", t: "Reportes" }, // 1.0 bloque 7: preguntas del reporte
  { v: "entradas", t: "Entradas (landings)" },
  { v: "workflows", t: "Workflows" }, // Plan de workflows 4b (7 nov 2026): solo lectura
  { v: "integraciones", t: "Integraciones GHL" },
  { v: "permisos", t: "Permisos" }, // H5: también el director con Administración
];

type EventoEntrada = EnvioEntrada;

// Lo que responde la dirección de una Entrada (src/app/api/webhooks/entrada/[token]/route.ts)
const RESPUESTAS: [string, string][] = [
  ["200", "Guardado."],
  ["400", "El JSON está mal escrito."],
  ["404", "La dirección no existe o la entrada está apagada."],
  ["413", "Demasiado grande (más de 500 KB)."],
  ["422", "No trae email ni teléfono: el envío se guarda con el motivo, pero no crea lead."],
  ["429", "Demasiados envíos (más de 300 por minuto): esperar y reintentar."],
  ["500", "Error del dashboard: el envío se guarda con el motivo; reintentar."],
];

// Si GHL falla al pedir campos o pipelines, la pestaña se ve igual y el formulario lo dice
async function cargarOpcionesGhl(token: string, locationId: string): Promise<OpcionesGhl> {
  const [c, p] = await Promise.allSettled([camposGhl({ token, locationId }), pipelinesGhl({ token, locationId })]);
  return {
    campos: c.status === "fulfilled" ? [...c.value].sort((a, b) => a.name.localeCompare(b.name)) : [],
    pipelines: p.status === "fulfilled" ? p.value.map((x) => ({ id: x.id, nombre: x.name, etapas: columnasEnOrdenGhl(x.stages).map((s) => ({ id: s.id, nombre: s.name })) })) : [],
    error: c.status === "rejected" || p.status === "rejected" ? "No se pudieron leer los campos o pipelines de GHL. Recarga en un momento." : null,
  };
}

// Workflows 4a-1 (Cristian, 7 nov 2026): el workflow encendido de cada Entrada, su resumen y en qué no coincide
// (las 20 últimas ejecuciones con diferencias, con la persona y la lista de diferencias de su comparación)
async function cargarWorkflows(proyectoId: string) {
  const m = new Map<string, WorkflowVista>();
  const { data: wfs } = await db().from("workflows").select("id, entrada_id, modo").eq("proyecto_id", proyectoId).eq("encendido", true).not("entrada_id", "is", null);
  if (!wfs?.length) return m;
  const ids = wfs.map((w) => w.id);
  const [res, { data: malas }] = await Promise.all([
    resumenWorkflows(proyectoId),
    db().from("workflow_ejecuciones").select("workflow_id, registro, leads(email, telefono, nombre)").in("workflow_id", ids).eq("estado", "ok").eq("coincide", false).order("actualizado_en", { ascending: false }).limit(20),
  ]);
  for (const w of wfs) {
    const diferencias = ((malas ?? []) as unknown as { workflow_id: string; registro: { tipo: string; diferencias?: string[] }[]; leads: { email: string | null; telefono: string | null; nombre: string } | null }[])
      .filter((x) => x.workflow_id === w.id)
      .map((x) => ({ quien: x.leads?.email || x.leads?.telefono || x.leads?.nombre || "—", lista: [...x.registro].reverse().find((r) => r.tipo === "comparacion")?.diferencias ?? [] }));
    m.set(w.entrada_id as string, { id: w.id, modo: w.modo, resumen: res.get(w.id) ?? { total: 0, coinciden: 0, no_coinciden: 0, esperando: 0, errores: 0 }, diferencias });
  }
  return m;
}

// Workflows 4b (7 nov 2026): la lista, el elegido (?wf=), su historial (50 últimos) y los nombres para el lienzo
async function cargarVistaWorkflows(proyectoId: string, wf: string | undefined, editar = false) {
  const [{ data: wfs }, resumen, { data: en }, { data: pl }, { data: pg }] = await Promise.all([
    db().from("workflows").select("id, nombre, disparador, pasos, modo, encendido, version").eq("proyecto_id", proyectoId).order("encendido", { ascending: false }).order("creado_en"),
    resumenWorkflows(proyectoId),
    db().from("entradas").select("id, nombre").eq("proyecto_id", proyectoId),
    db().from("pipelines").select("id, nombre, etapas(id, nombre)").eq("proyecto_id", proyectoId),
    db().from("proyectos").select("ghl_location_id, ghl_token").eq("id", proyectoId).single(),
  ]);
  const workflows = (wfs ?? []) as WorkflowFila[];
  const elegido = workflows.find((w) => w.id === wf) ?? workflows[0] ?? null;
  const nombres: Nombres = {
    entradas: Object.fromEntries((en ?? []).map((x) => [x.id, x.nombre])),
    pipelinesDashboard: Object.fromEntries(((pl ?? []) as { id: string; nombre: string; etapas: { id: string; nombre: string }[] }[]).map((p) => [p.id, { nombre: p.nombre, etapas: Object.fromEntries(p.etapas.map((e) => [e.id, e.nombre])) }])),
    pipelinesGhl: {},
  };
  // Los nombres de los pipelines de GHL solo si hacen falta (es una llamada a GHL): al editar, o si tiene oportunidades.
  // 4c: al editar, también los campos de GHL y los pipelines del dashboard, para elegir en el panel.
  let opcionesEditor: OpcionesEditor | null = null;
  if (elegido && (editar || JSON.stringify(elegido.pasos).includes("oportunidad_ghl"))) {
    const o = pg?.ghl_token && pg.ghl_location_id ? await cargarOpcionesGhl(descifrar(pg.ghl_token, "el token de GHL"), pg.ghl_location_id) : { campos: [], pipelines: [], error: "Este proyecto no tiene GHL conectado." };
    nombres.pipelinesGhl = Object.fromEntries(o.pipelines.map((p) => [p.id, { nombre: p.nombre, etapas: Object.fromEntries(p.etapas.map((e) => [e.id, e.nombre])) }]));
    if (editar)
      opcionesEditor = {
        camposGhl: o.campos,
        pipelinesGhl: o.pipelines,
        pipelinesDashboard: ((pl ?? []) as { id: string; nombre: string; etapas: { id: string; nombre: string }[] }[]).map((p) => ({ id: p.id, nombre: p.nombre, etapas: p.etapas })),
        errorGhl: o.error,
      };
  }
  let ejecuciones: EjecucionFila[] = [];
  if (elegido) {
    const { data: ej } = await db().from("workflow_ejecuciones").select("id, estado, coincide, creado_en, siguiente_en, registro, leads(email, telefono, nombre)").eq("workflow_id", elegido.id).order("creado_en", { ascending: false }).limit(50);
    ejecuciones = ((ej ?? []) as unknown as (Omit<EjecucionFila, "quien"> & { leads: { email: string | null; telefono: string | null; nombre: string } | null })[]).map(({ leads, ...x }) => ({ ...x, quien: leads?.email || leads?.telefono || leads?.nombre || "Lead borrado" }));
  }
  return { workflows, resumen, elegido, ejecuciones, nombres, editar: opcionesEditor };
}

// Nombres de campo que han llegado (también los de dentro de objetos, como «quiz.inversion»)
function camposDe(eventos: EventoEntrada[]) {
  const c = new Set<string>();
  for (const e of eventos)
    for (const [k, v] of Object.entries(e.payload ?? {})) {
      if (k === "headers") continue;
      if (v && typeof v === "object" && !Array.isArray(v)) for (const k2 of Object.keys(v)) c.add(`${k}.${k2}`);
      else c.add(k);
    }
  return [...c].sort();
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const { perfil, proyecto, proyectos } = await getSesion();
  if (!puedeAdmin(perfil)) redirect("/");
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "equipo";
  // Permisos por rol y por persona (V2-8 y Paso H5): CEO y director con Administración
  let permisos: DatosPermisos | null = null;
  if (tab === "permisos" || tab === "equipo") permisos = await cargarDatosPermisos(perfil, proyecto.id);

  const [{ data: miembros }, { data: productos }, { data: eventos }] = await Promise.all([
    db().from("miembros_proyecto").select("orden, horario, calendario, reparto_pct, perfiles(*)").eq("proyecto_id", proyecto.id).order("orden"),
    db().from("productos").select("*").eq("proyecto_id", proyecto.id).order("orden"),
    db().from("webhook_eventos").select("id, tipo, procesado, error, recibido_en").eq("proyecto_id", proyecto.id).order("recibido_en", { ascending: false }).limit(15),
  ]);
  const gente = ((miembros ?? []) as unknown as { orden: number; perfiles: Perfil }[]).map((m) => m.perfiles);
  // Bloque 5: para la ficha de cada persona (su fila del organigrama y lo que puedes darle)
  const eq = await cargarEquipo(proyecto.id);
  const miembroDe = new Map(eq.miembros.filter((x) => x.perfil_id).map((x) => [x.perfil_id as string, x]));
  const rango: Record<Rol, number> = { caller: 1, closer: 2, director: 3, ceo: 4 };
  const rolesQuePuedoDar = (["closer", "caller", "director", "ceo"] as Rol[]).filter((r) => rango[r] <= rango[perfil.rol]);
  const filaDe = new Map(((miembros ?? []) as unknown as { horario: unknown; calendario: unknown; reparto_pct: number; perfiles: Perfil }[]).map((m) => [m.perfiles.id, m]));
  const calendarioGeneral = ajustesValidos(proyecto.calendario);
  // Personas de otros proyectos que se pueden añadir a este (solo el CEO)
  let deFuera: { id: string; nombre: string; rol: string }[] = [];
  if (perfil.rol === "ceo") {
    const { data: todos } = await db().from("perfiles").select("id, nombre, rol").eq("activo", true).order("nombre");
    deFuera = (todos ?? []).filter((p) => !gente.some((g) => g.id === p.id));
  }
  const h = await headers();
  const origen = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const urlWebhook = `${origen}/api/webhooks/ghl/${proyecto.id}`;

  // GHL por API (calendarios): el token no sale del servidor, solo si existe o no
  let ghl: { location: string; tieneToken: boolean; sincronizado: string | null; resultado: string | null; closers: { id: string; nombre: string; cal: string; user: string }[]; otros: { id: string; nombre: string; rol: string; user: string }[] } | null = null;
  if (tab === "integraciones") {
    const [{ data: pg }, { data: mc }, { data: mo }] = await Promise.all([
      db().from("proyectos").select("ghl_location_id, ghl_token, ghl_sincronizado_en, ghl_ultimo_resultado").eq("id", proyecto.id).single(),
      db().from("miembros_proyecto").select("perfil_id, ghl_calendar_id, ghl_user_id, perfiles!inner(nombre, rol)").eq("proyecto_id", proyecto.id).eq("perfiles.rol", "closer"),
      db().from("miembros_proyecto").select("perfil_id, ghl_user_id, perfiles!inner(nombre, rol, activo)").eq("proyecto_id", proyecto.id).in("perfiles.rol", ["caller", "director"]),
    ]);
    ghl = {
      location: pg?.ghl_location_id ?? "",
      tieneToken: !!pg?.ghl_token,
      sincronizado: pg?.ghl_sincronizado_en ?? null,
      resultado: pg?.ghl_ultimo_resultado ?? null,
      otros: ((mo ?? []) as unknown as { perfil_id: string; ghl_user_id: string | null; perfiles: { nombre: string; rol: string; activo: boolean } }[]).filter((m) => m.perfiles.activo).map((m) => ({ id: m.perfil_id, nombre: m.perfiles.nombre, rol: m.perfiles.rol, user: m.ghl_user_id ?? "" })),
      closers: ((mc ?? []) as unknown as { perfil_id: string; ghl_calendar_id: string | null; ghl_user_id: string | null; perfiles: { nombre: string } }[]).map((m) => ({ id: m.perfil_id, nombre: m.perfiles.nombre, cal: m.ghl_calendar_id ?? "", user: m.ghl_user_id ?? "" })),
    };
  }

  // Entradas: solo se cargan en su pestaña
  let entradas: ({ id: string; nombre: string; token: string; activa: boolean; pipeline_id: string | null; etapa_id: string | null; reglas: unknown } & Partial<GhlDeEntrada> & Partial<DatosLanding>)[] = [];
  let pipes: { id: string; nombre: string; etapas: { id: string; nombre: string }[] }[] = [];
  // Plan GHL, fase 1: campos y pipelines de GHL para «Qué hacer en GHL» (null = el proyecto no tiene GHL conectado)
  let opcionesGhl: OpcionesGhl | null = null;
  // Panel de endpoints (plan GHL, punto 0, 7 nov 2026): resumen de cada una, todos sus rojos y sus 15 últimos envíos
  let resumen = new Map<string, ResumenEntrada>();
  let rojos: EventoEntrada[] = [];
  const ultimosDe = new Map<string, EventoEntrada[]>();
  let workflowDe = new Map<string, WorkflowVista>(); // Workflows 4a-1: el workflow en marcha de cada Entrada
  const vistaWf = tab === "workflows" ? await cargarVistaWorkflows(proyecto.id, typeof sp.wf === "string" ? sp.wf : undefined, sp.editar === "1") : null;
  if (tab === "entradas") {
    const [{ data: en }, { data: pl }, { data: pg }] = await Promise.all([
      db().from("entradas").select("*").eq("proyecto_id", proyecto.id).order("creado_en"),
      db().from("pipelines").select("id, nombre, etapas(id, nombre, orden)").eq("proyecto_id", proyecto.id).eq("tipo", "normal").order("orden"),
      db().from("proyectos").select("ghl_location_id, ghl_token").eq("id", proyecto.id).single(),
    ]);
    entradas = en ?? [];
    pipes = ((pl ?? []) as { id: string; nombre: string; etapas: { id: string; nombre: string; orden: number }[] }[]).map((p) => ({ ...p, etapas: [...p.etapas].sort((a, b) => a.orden - b.orden) }));
    if (entradas.length) {
      const ids = entradas.map((x) => x.id);
      const [r, ro, ...ult] = await Promise.all([resumenEntradas(proyecto.id), enviosEnRojo(ids), ...ids.map((id) => enviosDeEntrada(id, 0, ULTIMOS))]);
      resumen = r;
      rojos = ro;
      ids.forEach((id, i) => ultimosDe.set(id, ult[i]));
      workflowDe = await cargarWorkflows(proyecto.id);
    }
    if (pg?.ghl_token && pg.ghl_location_id) opcionesGhl = await cargarOpcionesGhl(descifrar(pg.ghl_token, "el token de GHL"), pg.ghl_location_id);
  }

  return (
    <>
      <Cabecera titulo="Administración" subtitulo={`${proyecto.nombre} · ${perfil.rol === "ceo" ? "acceso total" : "acceso de director"}`} />
      <Contenido>
        <div className="flex flex-wrap gap-1 rounded-xl border border-borde bg-panel p-1">
          {PESTANAS.map((p) => (
            <Link prefetch={true} key={p.v} href={`/admin?tab=${p.v}`} className={`rounded-lg px-3 py-1.5 text-sm ${tab === p.v ? "bg-primario text-white" : "text-texto-2 hover:bg-panel-2"}`}>{p.t}</Link>
          ))}
        </div>

        {tab === "equipo" && (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Seccion titulo={`Equipo de ${proyecto.nombre} · ${gente.length} personas`}>
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="tabla">
                  <thead><tr><th>Persona</th><th>Rol</th><th>Contacto</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {gente.map((g) => (
                      <tr key={g.id} className={g.activo ? "" : "opacity-50"}>
                        <td><div className="flex items-center gap-2"><Avatar nombre={g.nombre} /><div><div className="font-medium">{g.nombre}</div><div className="text-xs text-texto-3">{g.email}</div></div></div></td>
                        <td><Insignia tono={g.rol === "ceo" ? "oro" : g.rol === "director" ? "morado" : "primario"}>{ETIQUETA_ROL[g.rol]}</Insignia>{g.rol === "director" && g.admin_activo && <Insignia tono="ok">Admin</Insignia>}</td>
                        <td className="text-xs text-texto-2">{g.whatsapp ?? g.telefono ?? "—"}{!g.onboarding_completo && <div className="text-aviso">Onboarding pendiente</div>}</td>
                        <td>{g.activo ? <Insignia tono="ok">Activo</Insignia> : <Insignia tono="mal">Desactivado</Insignia>}</td>
                        <td>
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {/* Bloque 5 de 1.0: todo lo de cada persona, en su ficha (la misma que en Empresa → Equipo) */}
                            <FichaPersona
                              titulo={g.nombre}
                              m={miembroDe.get(g.id) ?? null}
                              perfilId={g.id}
                              admin
                              boton="texto"
                              datos={{ areas: eq.areas, puestos: eq.puestos, productos: (productos ?? []).map((p) => ({ id: p.id, nombre: p.nombre })), rolesQuePuedoDar, puedeComision: perfil.rol === "ceo" || g.id !== perfil.id }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Seccion>
            <div className="space-y-5">
              <Seccion titulo="Enviar acceso por email">
                <EnviarAccesos personas={gente.filter((g) => g.activo).map((g) => ({ id: g.id, nombre: g.nombre, email: g.email, rol: ETIQUETA_ROL[g.rol], prueba: !!g.es_prueba }))} />
              </Seccion>
              <Seccion titulo="Añadir persona nueva">
                <FormUsuario soyCeo={perfil.rol === "ceo"} />
              </Seccion>
              {perfil.rol === "ceo" && (
                <Seccion titulo="Añadir a alguien de otro proyecto">
                  <AnadirExistente personas={deFuera.map((p) => ({ id: p.id, nombre: `${p.nombre} · ${ETIQUETA_ROL[p.rol]}` }))} proyecto={proyecto.nombre} />
                </Seccion>
              )}
            </div>
          </div>
        )}

        {tab === "proyecto" && (
          <div className="grid gap-5 xl:grid-cols-2">
            <Seccion titulo="Avisos de los reportes">
              <FormProyecto aviso={proyecto.aviso_webhook_url ?? ""} />
              <p className="mt-3 text-xs text-texto-3">Moneda: <b>{proyecto.moneda}</b> · Zona horaria: <b>{proyecto.zona_horaria}</b> (se eligen al crear el proyecto).</p>
            </Seccion>
            <Seccion titulo="Link de agenda (GHL)">
              <LinkAgenda inicial={proyecto.link_agenda ?? ""} />
            </Seccion>
            <Seccion titulo="Reparto automático de leads (callers)">
              <RepartoPorcentaje
                auto={proyecto.reparto_auto}
                soloHorario={proyecto.reparto_solo_horario}
                callers={gente.filter((g) => g.rol === "caller" && g.activo && !g.es_prueba).map((g) => ({ id: g.id, nombre: g.nombre, pct: Number(filaDe.get(g.id)?.reparto_pct ?? 0), horario: !!horarioValido(filaDe.get(g.id)?.horario) }))}
              />
            </Seccion>
            <Seccion titulo={`Horarios del equipo (hora de ${proyecto.zona_horaria})`} className="xl:col-span-2">
              <p className="mb-3 text-xs text-texto-3">Callers y closers ponen el suyo al entrar y lo cambian en «Mi perfil»; desde aquí puedes cambiar el de cualquiera. Los días sueltos (vacaciones, festivos) mandan sobre la semana.</p>
              <HorariosEquipo
                zona={proyecto.zona_horaria}
                general={calendarioGeneral}
                personas={gente
                  .filter((g) => (g.rol === "caller" || g.rol === "closer") && g.activo)
                  .map((g) => ({ id: g.id, nombre: g.es_prueba ? `${g.nombre} (prueba)` : g.nombre, rol: g.rol as "caller" | "closer", horario: horarioValido(filaDe.get(g.id)?.horario), propios: filaDe.get(g.id)?.calendario ? ajustesValidos(filaDe.get(g.id)?.calendario, calendarioGeneral) : null }))}
              />
            </Seccion>
            <Seccion titulo="Llamadas de los closers (para todos)">
              <p className="mb-3 text-xs text-texto-3">Como un calendario de GHL. Valen para todos los closers salvo a quien le pongas unos propios (en «Editar» de su horario).</p>
              <FormAjustes perfilId={null} inicial={calendarioGeneral} />
            </Seccion>
            {puedeCrearProyectos(perfil) && (
              <Seccion titulo={`Proyectos (${proyectos.length})`}>
                <ul className="mb-4 space-y-1 text-sm">
                  {proyectos.map((p) => (
                    <li key={p.id} className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: p.color }} />{p.nombre}<span className="text-texto-3">· {p.moneda} · {p.zona_horaria}</span></li>
                  ))}
                </ul>
                <FormNuevoProyecto />
              </Seccion>
            )}
          </div>
        )}

        {tab === "permisos" && permisos && (
          <Seccion titulo="Quién ve cada sección">
            <p className="mb-4 text-sm text-texto-2">Abre o cierra una sección a un rol y vale para <b>todas</b> las personas de ese rol en este proyecto. Para una sola persona, usa «Permisos» en su fila de la pestaña Equipo (manda sobre lo de su rol). A un caller o closer, una sección de otro rol se le enseña solo con sus datos.{perfil.rol !== "ceo" && " Los permisos de los directores y los tuyos los cambia el CEO, y solo puedes dar lo que tú tienes."}</p>
            <TablaPermisos datos={permisos} />
            <p className="mt-3 text-xs text-texto-3">Ojo: quien tenga Finanzas ve todo el dinero del negocio, y quien tenga Equipo puede dar de alta personas y cambiar comisiones. Equipo y Finanzas nunca se dan a callers ni closers.</p>
          </Seccion>
        )}

        {tab === "reportes" && (
          <div className="space-y-5">
            <p className="text-sm text-texto-2">Las preguntas del reporte de fin de día. Cambiarlas solo afecta a los reportes nuevos: los ya enviados se quedan con las suyas. Del closer, las 3 marcadas como «fija» se usan para las tasas de agendamiento y de cierre: se pueden renombrar, no quitar.</p>
            {(["caller", "closer"] as const).map((r) => (
              <Seccion key={r} titulo={r === "caller" ? "Reporte de los callers" : "Reporte de los closers"}>
                <EditorPreguntas
                  key={JSON.stringify(preguntasDe(proyecto.preguntas_reporte, r))}
                  rol={r}
                  inicial={preguntasDe(proyecto.preguntas_reporte, r)}
                  fijas={FIJAS[r]}
                  personalizadas={!!(proyecto.preguntas_reporte as Record<string, unknown> | null)?.[r]}
                />
              </Seccion>
            ))}
          </div>
        )}

        {tab === "comisiones" && (
          <div className="space-y-5">
            <p className="text-sm text-texto-2">Cada mes se suma la facturación de las ventas de cada persona (caller: las ventas de los leads que agendó y cerró un closer, más lo que vende él; closer: lo que vende). El % del tramo alcanzado vale para <b>toda</b> esa facturación; se reinicia cada mes y se paga sobre lo cobrado. Lo cobrado después (cuotas) va con el % del mes de la venta. Los programas sin «Cuenta para comisión» (en Programas) no pagan ni suman. Quién va por tramos y quién con su % propio se elige en Empresa → Equipo, en la ficha de cada persona.</p>
            <div className="grid gap-5 xl:grid-cols-2">
              <Seccion titulo={`Tramos de los callers (${proyecto.moneda})`}><EditorTramos rol="caller" inicial={tramosDe(proyecto.tramos_comision).caller} moneda={proyecto.moneda} /></Seccion>
              <Seccion titulo={`Tramos de los closers (${proyecto.moneda})`}><EditorTramos rol="closer" inicial={tramosDe(proyecto.tramos_comision).closer} moneda={proyecto.moneda} /></Seccion>
            </div>
          </div>
        )}

        {tab === "productos" && (
          <Seccion titulo="Productos y precios">
            <p className="text-sm text-texto-2">Desde la v2, los productos se crean y se editan en <b>Empresa → Programas</b> (precio, forma de pago, back-end y comisiones).</p>
            <Link href="/programas" className="btn-primario mt-3 inline-flex">Ir a Programas</Link>
            <ul className="mt-4 space-y-1 text-sm">
              {((productos ?? []) as Producto[]).map((p) => (
                <li key={p.id} className="flex justify-between rounded-lg bg-panel-2 px-3 py-1.5"><span>{p.nombre}{!p.activo && <span className="text-texto-3"> · inactivo</span>}</span><span className="tabular-nums text-oro">{p.precio !== null ? dinero(Number(p.precio), proyecto) : "Personalizado"}</span></li>
              ))}
            </ul>
          </Seccion>
        )}

        {tab === "entradas" && (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-4">
              {/* Panel de endpoints (plan GHL, punto 0; boceto v2 aprobado por Cristian el 7 nov 2026) */}
              <div className="rounded-2xl bg-primario-suave p-4 text-sm">
                <p><b>Cada landing manda sus leads a su propia dirección.</b> Para conectar una landing nueva:</p>
                <ol className="mt-2 list-decimal space-y-0.5 pl-5">
                  <li>Créala en «Conectar una landing nueva».</li>
                  <li>Pulsa «Copiar dirección» y pásasela al programador de la landing.</li>
                  <li>Cuando llegue el primer lead, lo verás aquí.</li>
                </ol>
              </div>
              {entradas.map((en) => {
                const ultimos = ultimosDe.get(en.id) ?? [];
                const suyosRojos = rojos.filter((x) => x.entrada_id === en.id);
                const r = resumen.get(en.id) ?? { envios: 0, leads: 0, rojos: 0, ultimo: null };
                return (
                  <TarjetaEntrada
                    key={en.id}
                    entrada={{
                      id: en.id,
                      nombre: en.nombre,
                      url: `${origen}/api/webhooks/entrada/${en.token}`,
                      activa: en.activa,
                      pipeline_id: en.pipeline_id,
                      etapa_id: en.etapa_id,
                      reglas: reglasValidas(en.reglas),
                      campos: camposDe([...ultimos, ...suyosRojos]),
                      landing: en.landing ?? null,
                      formulario: en.formulario ?? null,
                      envia_desde: en.envia_desde ?? null,
                      archivo: en.archivo ?? null,
                      ghl: {
                        ghl_activo: en.ghl_activo ?? false,
                        ghl_campos: en.ghl_campos ?? {},
                        ghl_pipeline_id: en.ghl_pipeline_id ?? null,
                        ghl_etapa_id: en.ghl_etapa_id ?? null,
                        ghl_oportunidades: Array.isArray(en.ghl_oportunidades) ? en.ghl_oportunidades : [],
                        ghl_etiqueta_base: en.ghl_etiqueta_base ?? null,
                        ghl_etiquetas_extra: Array.isArray(en.ghl_etiquetas_extra) ? en.ghl_etiquetas_extra : [],
                        ghl_espera_seg: en.ghl_espera_seg ?? 60,
                        ghl_campo_completo: en.ghl_campo_completo ?? "quiz_completed",
                      },
                    }}
                    resumen={r}
                    ultimo={haceCuanto(r.ultimo)}
                    rojos={suyosRojos}
                    ultimos={ultimos}
                    zona={proyecto.zona_horaria}
                    pipelines={pipes}
                    opciones={opcionesGhl}
                    workflow={workflowDe.get(en.id) ?? null}
                  />
                );
              })}
              <details className="tarjeta p-4 sm:p-5">
                <summary className="cursor-pointer text-sm font-semibold text-texto-2">Para el programador: qué responde el dashboard</summary>
                <ul className="mt-3 divide-y divide-borde text-sm">
                  {RESPUESTAS.map(([c, t]) => (
                    <li key={c} className="flex gap-3 py-1.5"><code className="w-10 shrink-0 font-bold">{c}</code><span className="text-texto-2">{t}</span></li>
                  ))}
                </ul>
              </details>
            </div>
            <Seccion titulo="Conectar una landing nueva">
              <NuevaEntrada pipelines={pipes} />
            </Seccion>
          </div>
        )}

        {tab === "workflows" && vistaWf && (
          <VistaWorkflows
            {...vistaWf}
            proyecto={proyecto}
            editor={
              vistaWf.editar && vistaWf.elegido ? (
                <EditorWorkflow
                  key={`${vistaWf.elegido.id}-${vistaWf.elegido.version}-${vistaWf.elegido.encendido}-${vistaWf.elegido.modo}`}
                  w={vistaWf.elegido}
                  enCurso={vistaWf.resumen.get(vistaWf.elegido.id)?.esperando ?? 0}
                  nombres={vistaWf.nombres}
                  opciones={vistaWf.editar}
                  disparador={vistaWf.nombres.entradas[vistaWf.elegido.disparador.entrada_id] ?? "Entrada borrada"}
                />
              ) : undefined
            }
          />
        )}

        {tab === "integraciones" && (
          <div className="grid gap-5 xl:grid-cols-2">
            {ghl && (
              <Seccion titulo="Calendario de GHL de cada closer (por API)" className="xl:col-span-2">
                <p className="mb-3 text-sm text-texto-2">La app pregunta a GHL por las citas de cada closer (desde hace 30 días hasta dentro de 60) al pulsar «Sincronizar GHL» en Agendas y, sola, al abrir Agendas si han pasado más de 10 minutos. Funciona también en local.</p>
                <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
                  <ConexionGhl locationId={ghl.location} tieneToken={ghl.tieneToken} />
                  <div className="space-y-2">
                    {ghl.closers.length === 0 ? <p className="text-sm text-texto-3">No hay closers en este proyecto.</p> : ghl.closers.map((c) => <CalendarioCloser key={c.id} perfilId={c.id} nombre={c.nombre} calendarId={c.cal} userId={c.user} />)}
                    <p className="text-xs text-texto-3">Basta con uno de los dos: el id del calendario del closer o su id de usuario en GHL.</p>
                    {ghl.sincronizado && <p className="text-xs text-texto-2">Última sincronización: {fechaHora(ghl.sincronizado, proyecto)} · {ghl.resultado}</p>}
                  </div>
                </div>
              </Seccion>
            )}
            {ghl && (
              <Seccion titulo="Llamadas de GHL: quién es quién" className="xl:col-span-2">
                <p className="mb-3 text-sm text-texto-2">«Llamadas de GHL» trae todas las llamadas contestadas de más de 1 minuto. Para saber quién hizo cada una, pon aquí el <b>id de usuario de GHL</b> de cada caller (los closers ya lo tienen arriba si usan usuario). El token necesita además el permiso <code>conversations/message.readonly</code>.</p>
                <div className="space-y-2">{ghl.otros.length === 0 ? <p className="text-sm text-texto-3">No hay callers ni directores.</p> : ghl.otros.map((x) => <UsuarioGhl key={x.id} perfilId={x.id} nombre={x.nombre} rol={ETIQUETA_ROL[x.rol]} userId={x.user} />)}</div>
              </Seccion>
            )}
            <Seccion titulo="Webhook de entrada (GHL → Eternity)">
              <div className="space-y-2 text-sm text-texto-2">
                <p>
                  Para las <b>citas</b>: en el workflow de GHL añade la acción <b>Webhook</b> (la normal; «Custom webhook» es de pago) con <b>Method = POST</b> y esta URL. En <b>Custom data</b>: <code className="rounded bg-panel-2 px-1">tipo</code> = <code className="rounded bg-panel-2 px-1">cita_agendada</code> y <code className="rounded bg-panel-2 px-1">closer_email</code> = Appointment · Assigned User · Email. En <b>Headers</b>: <code className="rounded bg-panel-2 px-1">{CABECERA_SECRETO}</code> = la clave. La hora la coge sola del calendario.
                </p>
                <p>
                  Para los <b>leads nuevos</b> no se usa esta URL: crea una entrada en la pestaña <b>Entradas</b> y pon su dirección en un Webhook normal, sin Custom data. Paso a paso en <code className="rounded bg-panel-2 px-1">GUIA-GHL.md</code>.
                </p>
              </div>
              <Secreto url={urlWebhook} cabecera={CABECERA_SECRETO} secreto={proyecto.webhook_secreto} />
              <details className="mt-4 rounded-lg border border-borde">
                <summary className="cursor-pointer px-3 py-2 text-sm text-texto-2">Cuerpos JSON para «Custom webhook» (de pago; no hacen falta con el Webhook normal)</summary>
                <div className="space-y-3 border-t border-borde p-3">
                  {PLANTILLAS_GHL.map((p) => (
                    <Plantilla key={p.clave} titulo={p.titulo} disparador={p.disparador} cuerpo={p.cuerpo} />
                  ))}
                  <p className="text-xs text-texto-3">Donde pone «ELIGE_EN_GHL», borra el texto y elige la variable con el icono de etiqueta de GHL.</p>
                </div>
              </details>
            </Seccion>
            <Seccion titulo="Últimos eventos recibidos">
              {(eventos ?? []).length === 0 ? (
                <p className="text-sm text-texto-3">Todavía no ha llegado ningún evento de GHL.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {(eventos ?? []).map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-panel-2 px-3 py-1.5">
                      <span>{e.tipo ?? "desconocido"}</span>
                      <span className="text-xs text-texto-3">{fechaHora(e.recibido_en, proyecto)}</span>
                      {e.procesado ? <Insignia tono="ok">OK</Insignia> : <Insignia tono="mal">{e.error ?? "Error"}</Insignia>}
                    </li>
                  ))}
                </ul>
              )}
            </Seccion>
          </div>
        )}
      </Contenido>
    </>
  );
}
