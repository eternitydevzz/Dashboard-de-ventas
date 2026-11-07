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
import { NuevaEntrada, EditorEntrada, EditorGhlEntrada, ReintentarGhl, type OpcionesGhl, type GhlDeEntrada } from "./entradas";
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
  { v: "integraciones", t: "Integraciones GHL" },
  { v: "permisos", t: "Permisos" }, // H5: también el director con Administración
];

type EventoEntrada = { id: string; entrada_id: string; lead_id: string | null; procesado: boolean; error: string | null; recibido_en: string; payload: Record<string, unknown>; ghl_estado?: "esperando" | "ok" | "error" | null; ghl_intentos?: number; ghl_error?: string | null };

// Si GHL falla al pedir campos o pipelines, la pestaña se ve igual y el formulario lo dice
async function cargarOpcionesGhl(token: string, locationId: string): Promise<OpcionesGhl> {
  const [c, p] = await Promise.allSettled([camposGhl({ token, locationId }), pipelinesGhl({ token, locationId })]);
  return {
    campos: c.status === "fulfilled" ? [...c.value].sort((a, b) => a.name.localeCompare(b.name)) : [],
    pipelines: p.status === "fulfilled" ? p.value.map((x) => ({ id: x.id, nombre: x.name, etapas: columnasEnOrdenGhl(x.stages).map((s) => ({ id: s.id, nombre: s.name })) })) : [],
    error: c.status === "rejected" || p.status === "rejected" ? "No se pudieron leer los campos o pipelines de GHL. Recarga en un momento." : null,
  };
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
  let entradas: ({ id: string; nombre: string; token: string; activa: boolean; pipeline_id: string | null; etapa_id: string | null; reglas: unknown } & Partial<GhlDeEntrada>)[] = [];
  let eventosEntrada: EventoEntrada[] = [];
  let pipes: { id: string; nombre: string; etapas: { id: string; nombre: string }[] }[] = [];
  // Plan GHL, fase 1: campos y pipelines de GHL para «Qué hacer en GHL» (null = el proyecto no tiene GHL conectado)
  let opcionesGhl: OpcionesGhl | null = null;
  if (tab === "entradas") {
    const [{ data: en }, { data: pl }, { data: pg }] = await Promise.all([
      db().from("entradas").select("*").eq("proyecto_id", proyecto.id).order("creado_en"),
      db().from("pipelines").select("id, nombre, etapas(id, nombre, orden)").eq("proyecto_id", proyecto.id).eq("tipo", "normal").order("orden"),
      db().from("proyectos").select("ghl_location_id, ghl_token").eq("id", proyecto.id).single(),
    ]);
    entradas = en ?? [];
    pipes = ((pl ?? []) as { id: string; nombre: string; etapas: { id: string; nombre: string; orden: number }[] }[]).map((p) => ({ ...p, etapas: [...p.etapas].sort((a, b) => a.orden - b.orden) }));
    if (entradas.length) {
      const { data: ev } = await db().from("webhook_eventos").select("id, entrada_id, lead_id, procesado, error, recibido_en, payload, ghl_estado, ghl_intentos, ghl_error").in("entrada_id", entradas.map((x) => x.id)).order("recibido_en", { ascending: false }).limit(200);
      eventosEntrada = (ev ?? []) as EventoEntrada[];
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
            <div className="space-y-5">
              {entradas.length === 0 && (
                <Seccion titulo="Entradas">
                  <p className="text-sm text-texto-2">Cada landing tiene su propia dirección. La landing envía ahí el mismo JSON que manda a GHL; la app lo guarda <b>entero</b> y después lo interpreta (nombre, email, teléfono, respuestas, UTM…). Crea la primera a la derecha.</p>
                </Seccion>
              )}
              {entradas.map((en) => {
                const evs = eventosEntrada.filter((x) => x.entrada_id === en.id);
                return (
                  <Seccion key={en.id} titulo={`${en.nombre}${en.activa ? "" : " · desactivada"}`}>
                    <EditorEntrada
                      entrada={{ id: en.id, nombre: en.nombre, url: `${origen}/api/webhooks/entrada/${en.token}`, activa: en.activa, pipeline_id: en.pipeline_id, etapa_id: en.etapa_id, reglas: reglasValidas(en.reglas), campos: camposDe(evs) }}
                      pipelines={pipes}
                    />
                    <div className="mt-5 border-t border-borde pt-4">
                      <EditorGhlEntrada
                        entradaId={en.id}
                        inicial={{
                          ghl_activo: en.ghl_activo ?? false,
                          ghl_campos: en.ghl_campos ?? {},
                          ghl_pipeline_id: en.ghl_pipeline_id ?? null,
                          ghl_etapa_id: en.ghl_etapa_id ?? null,
                          ghl_oportunidades: Array.isArray(en.ghl_oportunidades) ? en.ghl_oportunidades : [],
                          ghl_etiqueta_base: en.ghl_etiqueta_base ?? null,
                          ghl_etiquetas_extra: Array.isArray(en.ghl_etiquetas_extra) ? en.ghl_etiquetas_extra : [],
                          ghl_espera_seg: en.ghl_espera_seg ?? 60,
                          ghl_campo_completo: en.ghl_campo_completo ?? "quiz_completed",
                        }}
                        camposEnvio={camposDe(evs)}
                        opciones={opcionesGhl}
                        errores={evs.filter((x) => x.ghl_estado === "error").length}
                      />
                    </div>
                    <div className="mt-5 border-t border-borde pt-4">
                      <div className="titulo-seccion mb-2">Últimos envíos recibidos ({evs.length})</div>
                      {evs.length === 0 ? (
                        <p className="text-sm text-texto-3">Todavía no ha llegado nada a esta dirección.</p>
                      ) : (
                        <ul className="space-y-1.5 text-sm">
                          {evs.slice(0, 15).map((x) => (
                            <li key={x.id} className="rounded-lg bg-panel-2">
                              <details>
                                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-1.5">
                                  <span className="text-xs text-texto-3">{fechaHora(x.recibido_en, proyecto)}</span>
                                  <span className="truncate">{String(x.payload?.email || x.payload?.phone || x.payload?.name || "—")}</span>
                                  {x.procesado ? <Insignia tono="ok">Guardado</Insignia> : <Insignia tono="mal">{x.error ?? "Error"}</Insignia>}
                                  {x.ghl_estado === "ok" && <Insignia tono="ok">GHL ok</Insignia>}
                                  {x.ghl_estado === "esperando" && <Insignia>{x.ghl_intentos ? `GHL: reintento ${x.ghl_intentos + 1} de 5` : "GHL: esperando"}</Insignia>}
                                  {x.ghl_estado === "error" && <Insignia tono="mal">GHL: error</Insignia>}
                                  {x.lead_id && <Link href={`/leads/${x.lead_id}`} className="ml-auto text-xs text-primario hover:underline">Ver lead</Link>}
                                </summary>
                                {x.ghl_estado === "esperando" && x.ghl_error && <p className="border-t border-borde px-3 py-2 text-xs text-texto-3">Último fallo: {x.ghl_error}</p>}
                                <pre className="max-h-72 overflow-auto border-t border-borde p-3 text-xs">{JSON.stringify(x.payload, null, 2)}</pre>
                              </details>
                              {x.ghl_estado === "error" && (
                                <div className="flex flex-wrap items-center gap-2 rounded-b-lg border-t border-borde bg-mal-suave px-3 py-2 text-xs text-mal">
                                  <span className="min-w-0 flex-1 break-words">No llegó a GHL tras {x.ghl_intentos ?? 0} intentos: {x.ghl_error ?? "sin motivo"}</span>
                                  <ReintentarGhl eventoId={x.id} />
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </Seccion>
                );
              })}
            </div>
            <Seccion titulo="Nueva entrada">
              <NuevaEntrada pipelines={pipes} />
            </Seccion>
          </div>
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
