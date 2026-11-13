import { ETIQUETA_ESTADO } from "@/lib/estados-caller";
import { CAMPOS_FICHA, limpiarFicha } from "@/lib/ficha-cualificacion";
import Link from "next/link";
import { cargarGuion, rolDelGuion } from "@/lib/guiones-datos";
import { miLinkAgenda, miMoneda } from "@/lib/mercado-datos";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, Globe, Tag, FileText, History, CalendarDays, ShoppingCart, Compass } from "lucide-react";
import { getSesion, esJefe } from "@/lib/auth";
import { db, equipo } from "@/lib/datos";
import { dinero, fechaHora, ETIQUETA_ESTADO_CALLER, ETIQUETA_ESTADO_CITA, nombrePais } from "@/lib/formato";
import { Cabecera, Contenido, Seccion, Insignia, Vacio } from "@/components/ui";
import { OfertaChip } from "@/components/oferta-chip";
import { AccionesLead } from "@/components/acciones-lead";
import { SelectoresLead } from "./selectores";
import { VerEstrellas } from "@/components/estrellas";
import { esCloser, type Actividad, type Cita, type Etapa, type Lead, type Pipeline, type Producto, type Venta } from "@/lib/tipos";
import { ABIERTAS } from "@/lib/llamadas";

const ICONO_ACT: Record<string, string> = {
  llamada: "📞",
  whatsapp: "💬",
  nota: "📝",
  cambio_etapa: "➡️",
  asignacion: "👤",
  cita: "📅",
  venta: "💰",
  importacion: "📥",
  webhook: "⚡",
};
const RESULTADO: Record<string, string> = {
  ...ETIQUETA_ESTADO, // C11: los 12 estados (y los viejos del historial)
  no_interesa: "No interesa",
  contestado: "Contestó",
  agendada: "Agendada",
  completo: "Pago completo",
  reserva: "Reserva",
  cuotas: "Cuotas",
  cobro: "Cobro",
  devolucion: "Devolución",
};
// Cómo se enseña cada dato de seguimiento
const SEGUIMIENTO: Record<string, string> = {
  utm_source: "UTM source",
  utm_medium: "UTM medium",
  utm_campaign: "UTM campaign",
  utm_content: "UTM content",
  utm_term: "UTM term",
  utm_id: "UTM id",
  fbclid: "Clic de Facebook (fbclid)",
  gclid: "Clic de Google (gclid)",
  ttclid: "Clic de TikTok (ttclid)",
  page_url: "Página",
  referrer: "Venía de",
};

export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  const { perfil, proyecto } = await getSesion();
  const { data: lead } = await db().from("leads").select("*").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle<Lead>();
  if (!lead) notFound();
  const jefe = esJefe(perfil);
  if (!jefe && lead.caller_id !== perfil.id && lead.closer_id !== perfil.id) notFound();

  const [acts, citas, ventas, gente, productos, pipelines, etapas, fichaFila] = await Promise.all([
    db().from("actividades").select("*").eq("lead_id", id).order("creado_en", { ascending: false }).limit(100),
    db().from("citas").select("*").eq("lead_id", id).order("fecha", { ascending: false }),
    db().from("ventas").select("*, productos(nombre)").eq("lead_id", id).order("fecha", { ascending: false }),
    equipo(proyecto.id, !!perfil.es_prueba),
    db().from("productos").select("*").eq("proyecto_id", proyecto.id).eq("activo", true).order("orden"),
    db().from("pipelines").select("*").eq("proyecto_id", proyecto.id).eq("tipo", "normal").order("orden"),
    db().from("etapas").select("*, pipelines!inner(proyecto_id, tipo)").eq("pipelines.proyecto_id", proyecto.id).eq("pipelines.tipo", "normal").order("orden"),
    db().from("cualificaciones").select("campos").eq("lead_id", id).maybeSingle(), // C6 (sin la tabla todavía: vacía)
  ]);
  const ficha = limpiarFicha(fichaFila.data?.campos);
  const nombre = (pid: string | null) => gente.find((g) => g.id === pid)?.nombre ?? "—";
  // La cita que cerraría una venta (la abierta más reciente, como en registrarVenta): su closer es el vendedor por defecto
  const citaAbierta = (citas.data as Cita[] | null)?.find((c) => [...ABIERTAS, "seguimiento"].includes(c.estado) && c.closer_id);
  const closerCita = citaAbierta?.closer_id ? { id: citaAbierta.closer_id, nombre: nombre(citaAbierta.closer_id) } : undefined;
  const pipeline = (pipelines.data as Pipeline[]).find((p) => p.id === lead.pipeline_id);
  const etapa = (etapas.data as Etapa[]).find((e) => e.id === lead.etapa_id);
  // Fase 4: sus tarjetas en otros pipelines (si la tabla aún no existe, ninguna)
  const { data: extra } = await db().from("tarjetas_extra").select("pipeline_id, etapa_id").eq("lead_id", id);
  const tambienEn = (extra ?? []).map((x) => ({
    pipeline: (pipelines.data as Pipeline[]).find((p) => p.id === x.pipeline_id),
    etapa: (etapas.data as Etapa[]).find((e) => e.id === x.etapa_id),
  })).filter((x) => x.pipeline);
  const nombreCompleto = `${lead.nombre} ${lead.apellido}`.trim() || "Sin nombre";
  const { guion } = await cargarGuion(proyecto.id, rolDelGuion(perfil.rol)); // Fase 6

  return (
    <>
      <Cabecera
        titulo={nombreCompleto}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={jefe ? `/crm${pipeline ? `?pipeline=${pipeline.id}` : ""}` : perfil.rol === "closer" ? "/closer" : "/caller"} className="inline-flex items-center gap-1 text-primario hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Volver
            </Link>
            {pipeline && <>· {pipeline.nombre}</>}
            {etapa && <Insignia tono="primario">{etapa.nombre}</Insignia>}
            {tambienEn.map((x) => (
              <Link key={x.pipeline!.id} href={`/crm?pipeline=${x.pipeline!.id}`} className="hover:underline" title="También está en este pipeline">
                <Insignia>🔗 {x.pipeline!.nombre}{x.etapa ? ` · ${x.etapa.nombre}` : ""}</Insignia>
              </Link>
            ))}
            <Insignia>{ETIQUETA_ESTADO_CALLER[lead.estado_caller]}</Insignia>
            {lead.estado_caller === "llamar_luego" && lead.llamar_en && <Insignia>📞 Llamar el {fechaHora(lead.llamar_en, proyecto)}</Insignia>}
            <OfertaChip oferta={lead.oferta} vacio={false} />
            <span className="text-texto-3">· entró el {fechaHora(lead.creado_en, proyecto)} · origen {lead.origen.toUpperCase()}</span>
          </span>
        }
      />
      <Contenido>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <Seccion titulo="Respuestas del formulario">
              {lead.respuestas.length === 0 ? (
                <Vacio icono={FileText} texto="Este lead no tiene respuestas de formulario." />
              ) : (
                <dl className="grid gap-3 sm:grid-cols-2">
                  {lead.respuestas.map((r) => (
                    <div key={r.pregunta} className="rounded-lg border border-borde bg-panel-2 p-3">
                      <dt className="text-xs text-texto-3">{r.pregunta}</dt>
                      <dd className="mt-1 font-medium">{r.respuesta || <span className="text-texto-3">Sin responder</span>}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Seccion>

            {/* C6 (plan Callers, 7 nov): lo que apuntó el caller en el guion (la ven el closer y los jefes) */}
            <Seccion titulo="Ficha de cualificación">
              {Object.keys(ficha).length === 0 ? (
                <Vacio icono={FileText} texto="El caller todavía no ha rellenado la ficha de este lead." />
              ) : (
                <dl className="grid gap-3 sm:grid-cols-2">
                  {CAMPOS_FICHA.filter((c) => ficha[c.k]).map((c) => (
                    <div key={c.k} className={`rounded-lg border border-borde bg-panel-2 p-3 ${c.largo ? "sm:col-span-2" : ""}`}>
                      <dt className="text-xs text-texto-3">{c.t}</dt>
                      <dd className="mt-1 whitespace-pre-line font-medium">{ficha[c.k]}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Seccion>

            <Seccion titulo="Origen y seguimiento">
              {!lead.fuente && !lead.evento && lead.quiz_score === null && Object.keys(lead.seguimiento ?? {}).length === 0 ? (
                <Vacio icono={Compass} texto="Este lead no trae datos de origen (por ejemplo, vino de un CSV)." />
              ) : (
                <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  {lead.fuente && <div><dt className="text-xs text-texto-3">Fuente</dt><dd className="font-medium">{lead.fuente}</dd></div>}
                  {lead.evento && <div><dt className="text-xs text-texto-3">Evento</dt><dd className="font-medium">{lead.evento}</dd></div>}
                  {lead.quiz_score !== null && <div><dt className="text-xs text-texto-3">Puntuación del cuestionario</dt><dd className="font-medium">{lead.quiz_score}</dd></div>}
                  {Object.entries(lead.seguimiento ?? {}).map(([k, v]) => (
                    <div key={k} className="min-w-0"><dt className="text-xs text-texto-3">{SEGUIMIENTO[k] ?? k}</dt><dd className="truncate font-medium" title={v}>{v}</dd></div>
                  ))}
                </dl>
              )}
              {Object.keys(lead.datos ?? {}).length > 0 && (
                <details className="mt-4 rounded-lg border border-borde bg-panel-2">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Todo lo que se recibió ({Object.keys(lead.datos).length} campos)</summary>
                  <pre className="max-h-80 overflow-auto border-t border-borde p-3 text-xs">{JSON.stringify(lead.datos, null, 2)}</pre>
                </details>
              )}
            </Seccion>

            <Seccion titulo="Historial">
              {(acts.data as Actividad[]).length === 0 ? (
                <Vacio icono={History} texto="Sin actividad todavía." />
              ) : (
                <ol className="relative space-y-4 border-l border-borde pl-5">
                  {(acts.data as Actividad[]).map((a) => (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full bg-panel text-[11px] ring-1 ring-borde">{ICONO_ACT[a.tipo] ?? "•"}</span>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <b>{a.perfil_id ? nombre(a.perfil_id) : "Sistema"}</b>
                        <span className="text-texto-2">{a.tipo.replace("_", " ")}</span>
                        {a.resultado && <Insignia tono="primario">{RESULTADO[a.resultado] ?? a.resultado}</Insignia>}
                        <span className="ml-auto text-xs text-texto-3">{fechaHora(a.creado_en, proyecto)}</span>
                      </div>
                      {a.nota && <p className="mt-0.5 text-sm text-texto-2">{a.nota}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </Seccion>
          </div>

          <div className="space-y-5">
            <Seccion titulo="Datos">
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-texto-3" />{lead.telefono ?? "—"}</li>
                <li className="flex items-center gap-2"><Globe className="h-4 w-4 text-texto-3" />{nombrePais(lead.pais)}</li>
                <li className="flex items-center gap-2 break-all"><Mail className="h-4 w-4 shrink-0 text-texto-3" />{lead.email ?? "—"}</li>
                <li className="flex flex-wrap items-center gap-1.5"><Tag className="h-4 w-4 text-texto-3" />{lead.etiquetas.length ? lead.etiquetas.map((t) => <Insignia key={t}>{t}</Insignia>) : "—"}</li>
                <li><span className="mr-1.5 text-xs text-texto-3">Caller:</span><VerEstrellas n={lead.estrellas_caller} quien="caller" /></li>
              </ul>
              <div className="mt-4 border-t border-borde pt-4">
                <SelectoresLead
                  leadId={lead.id}
                  jefe={jefe}
                  etapaId={lead.etapa_id}
                  callerId={lead.caller_id}
                  closerId={lead.closer_id}
                  pipelines={(pipelines.data as Pipeline[]).map((p) => ({ ...p, etapas: (etapas.data as Etapa[]).filter((e) => e.pipeline_id === p.id) }))}
                  callers={gente.filter((g) => g.rol === "caller").map((g) => ({ id: g.id, nombre: g.nombre }))}
                  closers={gente.filter(esCloser).map((g) => ({ id: g.id, nombre: g.nombre }))}
                />
              </div>
            </Seccion>

            <Seccion titulo="Acciones">
              <AccionesLead
                leadId={lead.id}
                telefono={lead.telefono}
                closers={gente.filter(esCloser).map((g) => ({ id: g.id, nombre: g.nombre }))}
                productos={(productos.data ?? []) as Producto[]}
                rol={perfil.rol}
                vendedores={jefe ? gente.filter((g) => g.rol === "closer" || g.rol === "caller").map((g) => ({ id: g.id, nombre: g.nombre })) : undefined}
                closerCita={closerCita}
                miId={perfil.id}
                linkAgenda={await miLinkAgenda(proyecto, perfil.id)}
                moneda={await miMoneda(proyecto, perfil.id)}
                compacto
                guion={guion}
                nombreLead={nombreCompleto}
                miNombre={perfil.nombre}
              />
            </Seccion>

            <Seccion titulo="Citas">
              {(citas.data as Cita[]).length === 0 ? (
                <Vacio icono={CalendarDays} texto="Sin citas." />
              ) : (
                <ul className="space-y-2 text-sm">
                  {(citas.data as Cita[]).map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-borde bg-panel-2 px-3 py-2">
                      <div>
                        <div className="font-medium">{fechaHora(c.fecha, proyecto)}</div>
                        <div className="text-xs text-texto-3">con {nombre(c.closer_id)}</div>
                        {c.estrellas_caller && <div><span className="text-xs text-texto-3">Caller: </span><VerEstrellas n={c.estrellas_caller} quien="caller" /></div>}
                        {c.estrellas_closer && <div><span className="text-xs text-texto-3">Closer: </span><VerEstrellas n={c.estrellas_closer} quien="closer" /></div>}
                      </div>
                      <Insignia tono={c.estado === "cerrada" ? "ok" : c.estado === "no_show" || c.estado === "perdida" ? "mal" : "primario"}>{ETIQUETA_ESTADO_CITA[c.estado]}</Insignia>
                    </li>
                  ))}
                </ul>
              )}
            </Seccion>

            <Seccion titulo="Ventas">
              {(ventas.data ?? []).length === 0 ? (
                <Vacio icono={ShoppingCart} texto="Sin ventas." />
              ) : (
                <ul className="space-y-2 text-sm">
                  {(ventas.data as (Venta & { productos: { nombre: string } | null })[]).map((v) => (
                    <li key={v.id} className="rounded-lg border border-borde bg-panel-2 px-3 py-2">
                      <div className="flex justify-between font-medium"><span>{v.productos?.nombre ?? "Producto"}</span><span className="text-oro-texto">{dinero(Number(v.facturacion), proyecto)}</span></div>
                      <div className="text-xs text-texto-3">Cobrado {dinero(Number(v.cash_collected), proyecto)} · {RESULTADO[v.tipo_pago]} · {nombre(v.vendedor_id)} · {fechaHora(v.fecha, proyecto)}</div>
                      {v.devuelto && <div className="text-xs text-mal">Devuelto {dinero(Number(v.devuelto), proyecto)}{v.devuelto_en ? ` el ${fechaHora(v.devuelto_en, proyecto)}` : ""}{v.devolucion_nota ? ` · ${v.devolucion_nota}` : ""}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </Seccion>
          </div>
        </div>
      </Contenido>
    </>
  );
}
