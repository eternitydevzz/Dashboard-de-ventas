import Link from "next/link";
import { cargarGuion, rolDelGuion } from "@/lib/guiones-datos";
import { Phone, CalendarCheck, CalendarDays, MessageCircle, UserCheck, Users, Trophy } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { panelObjetivos } from "@/lib/objetivos";
import { PanelObjetivos } from "@/components/barras-objetivos";
import { db, todas, equipo } from "@/lib/datos";
import { enMemoria, UN_MINUTO } from "@/lib/memoria";
import { rangoDe, porcentaje, pct, dinero, hoyEnZona, nombresCortos } from "@/lib/formato";
import { kpisHoyCola } from "@/lib/kpis-cola";
import type { Pesos } from "@/lib/cualificacion";
import { colaCaller, cuentaPorEstado, leerOrden, ordenarCola } from "@/lib/cola";
import { ESTADOS_CALLER, esContacto } from "@/lib/estados-caller";
import { Cabecera, Contenido, Vacio, Avatar } from "@/components/ui";
import type { LucideIcon } from "lucide-react";
import type { Lead, Producto } from "@/lib/tipos";
import { ColaCaller } from "./cola";
import { BarraDeslizable } from "@/components/barra-deslizable";

// C11 (7c.1): una pastilla por columna; la primera, «Leads» = toda la cola (no hay una solo para los nuevos)
// «Leads» = solo los que siguen en «Leads» (Cristian, 10 nov: antes salían todos y el equipo se liaba); cada estado, en su pestaña
const FILTROS = ESTADOS_CALLER.map((e) => ({ v: e.v, t: e.t }));

const CAMPOS_COLA = "id, nombre, apellido, email, telefono, pais, estado_caller, llamar_en, creado_en, etiquetas, respuestas, pipeline_id"; // C5: + pipeline (su nombre sale en la cabecera del lead)
// Velocidad (13 nov 2026): productos, scoring y pipelines casi no cambian y se pedían en cada carga y cada guardado de
// cada persona. Se comparten 1 minuto (lib/memoria.ts; se borran al guardarlos). Si falla no se guarda y sale vacío, como antes.
function deMemoria<T>(clave: string, leer: () => PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  return enMemoria(clave, UN_MINUTO, async () => {
    const { data, error } = await leer();
    if (error) throw new Error(error.message);
    return data;
  }).catch((e) => (console.error(`[callers] ${clave}`, e instanceof Error ? e.message : e), null));
}

type LeadCola = Pick<Lead, "id" | "nombre" | "apellido" | "email" | "telefono" | "pais" | "estado_caller" | "llamar_en" | "creado_en" | "etiquetas" | "respuestas" | "pipeline_id">;

export default async function CallerPage({ searchParams }: PageProps<"/caller">) {
  const { perfil, proyecto, tiene } = await exigirPagina("cola"); // H5
  const jefe = esJefe(perfil);
  // H5: a un closer con «Mis leads», sus leads como closer (lo suyo), en forma de cola
  const comoCloser = perfil.rol === "closer";
  // Velocidad (17 oct 2026): guion y equipo a la vez (antes, uno detrás de otro)
  const [{ guion }, gente, sp] = await Promise.all([
    cargarGuion(proyecto.id, rolDelGuion(perfil.rol)), // Fase 6
    equipo(proyecto.id, !!perfil.es_prueba),
    searchParams,
  ]);
  const callers = gente.filter((g) => g.rol === "caller");
  const caller = jefe ? callers.find((c) => c.id === sp.caller) ?? callers[0] : perfil;
  const filtro = typeof sp.columna === "string" && FILTROS.some((f) => f.v === sp.columna) ? sp.columna : "nuevo";
  const orden = leerOrden(sp.orden, sp.dir); // C2: orden de las cabeceras, en el servidor

  if (!caller) {
    return (
      <>
        <Cabecera titulo="Callers" />
        <Contenido><Vacio icono={Users} texto="No hay callers en este proyecto. Créalos en Administración." /></Contenido>
      </>
    );
  }

  const hoy = rangoDe("hoy", proyecto.zona_horaria);
  // Velocidad (17 oct 2026): los objetivos van con el resto de consultas (antes, después)
  // Velocidad (28 oct 2026, Cristian): solo las columnas que usa la cola (sin `datos` de GHL): 395 → 180 KB por carga
  const [leads, kpis, productos, scoring, panel, pipelines] = await Promise.all([
    todas<LeadCola>((a, b) => db().from("leads").select(CAMPOS_COLA).eq("proyecto_id", proyecto.id).eq(comoCloser ? "closer_id" : "caller_id", caller.id).order("id").range(a, b)),
    kpisHoyCola(proyecto.id, caller.id, hoy.desde!.toISOString()), // F4: solo de este proyecto
    deMemoria(`productos-activos:${proyecto.id}`, () => db().from("productos").select("*").eq("proyecto_id", proyecto.id).eq("activo", true).order("orden")),
    deMemoria(`scoring:${proyecto.id}`, () => db().from("scoring_ia").select("pesos").eq("proyecto_id", proyecto.id).maybeSingle()),
    panelObjetivos(proyecto, caller), // objetivos del caller que se está viendo, su racha y el del equipo (H3-H4)
    deMemoria(`pipelines-nombres:${proyecto.id}`, () => db().from("pipelines").select("id, nombre").eq("proyecto_id", proyecto.id)), // C5: nombre del pipeline de origen
  ]);
  const nombresPipeline = Object.fromEntries((pipelines ?? []).map((x) => [x.id, x.nombre.replace(/^\d+\.\s*/, "")]));
  const pesos = ((scoring as { pesos?: unknown } | null)?.pesos ?? null) as Pesos | null; // priorización con IA (V2-11)
  // KPIs de hoy (7c.1): Llamadas («Link de agenda» y «Wsp enviado», 10 nov) · Contactos (los que avanzan, punto 16) · Agendas (% de los
  // contactos) · WhatsApps (botón «Wsp enviado») · Confirmadas («Confirma Agenda»). Fuera «No contestan» y «Ventas» (F6).
  const { acts, citas: agendasHoy } = kpis;
  const llamadas = acts.filter((a) => a.tipo === "llamada").length;
  const contactos = new Set(acts.filter(esContacto).map((a) => a.lead_id)).size;
  const whatsapps = acts.filter((a) => a.tipo === "whatsapp").length;
  const confirmadas = acts.filter((a) => a.tipo === "cambio_etapa" && a.resultado === "confirma_agenda").length;

  const cuenta = cuentaPorEstado(leads);
  const filtrados = ordenarCola(colaCaller(leads, filtro, pesos), orden); // C2: antes del corte de 300
  // Al navegador van los 300 primeros (los que se enseñan) y, si la dirección pide otro (?lead=), también ese
  const visibles = filtrados.slice(0, 300);
  const pedido = filtrados.find((l) => l.id === sp.lead);
  if (pedido && !visibles.includes(pedido)) visibles.push(pedido);
  const closers = gente.filter((g) => g.rol === "closer").map((g) => ({ id: g.id, nombre: g.nombre }));
  const cortos = nombresCortos(callers); // F13: dos callers con el mismo nombre se distinguen
  const enlaceFiltro = (v: string) => `/caller?${new URLSearchParams({ ...(jefe ? { caller: caller.id } : {}), columna: v, ...(orden ? { orden: orden.campo, dir: orden.dir === 1 ? "asc" : "desc" } : {}) })}`;

  return (
    <>
      <Cabecera
        titulo={jefe ? "Callers" : "Mis leads"}
        subtitulo={jefe ? `Viendo la cola de ${caller.nombre}` : `${leads.length} leads asignados · elige a quién llamar`}
        acciones={
          <>
            {jefe && (
              <div className="flex flex-wrap gap-1 rounded-xl border border-borde bg-panel p-1">
                {callers.map((c) => (
                  <Link prefetch={false} key={c.id} href={`/caller?caller=${c.id}`} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${c.id === caller.id ? "bg-primario text-white" : "text-texto-2 hover:bg-panel-2"}`}>
                    <Avatar nombre={c.nombre} tamano="h-6 w-6 text-[9px]" />{cortos.get(c.id)}
                  </Link>
                ))}
              </div>
            )}
            {/* F12: solo a quien tiene la sección Ranking (antes salía a todos y lo mandaba a su inicio) */}
            {tiene.has("ranking") && <Link href="/ranking" className="btn-secundario"><Trophy className="h-4 w-4 text-oro" /> Ranking del equipo</Link>}
          </>
        }
      />
      <Contenido>
        {/* 25 oct 2026 (Cristian): sin refresco automático cada 60 s; la base se saturaba con el equipo trabajando.
            C11 (punto 11): sin aviso «Te tocan X llamadas»: ya no hay fechas */}
        <PanelObjetivos panel={panel} dinero={(n: number) => dinero(n, proyecto)} celebrar={jefe ? null : `${caller.id}-${hoyEnZona(proyecto.zona_horaria)}`} />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5" aria-label="Tus números de hoy">
          <KpiCola titulo="Llamadas hoy" valor={llamadas} nota="«Link de agenda» y «Wsp enviado»" color="#2b59d1" icono={Phone} />
          <KpiCola titulo="Contactos hoy" valor={contactos} nota="los que avanzan" color="#7c4ddb" icono={UserCheck} />
          <KpiCola titulo="Agendas hoy" valor={agendasHoy} nota={`${pct(porcentaje(agendasHoy, contactos))} de los contactos`} color="#15924a" icono={CalendarDays} />
          <KpiCola titulo="WhatsApps hoy" valor={whatsapps} nota="botón «Wsp enviado»" color="#16a34a" icono={MessageCircle} />
          <KpiCola titulo="Confirmadas hoy" valor={confirmadas} nota="«Confirma Agenda»" color="#0891b2" icono={CalendarCheck} ultimo />
        </div>

        <ColaCaller
          pestanas={
            <BarraDeslizable className="flex shrink-0 gap-1.5 border-b border-borde p-2" role="group" aria-label="Filtrar por columna">
              {FILTROS.map((f) => (
                <Link prefetch={false} key={f.v} href={enlaceFiltro(f.v)} aria-pressed={filtro === f.v} className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${filtro === f.v ? "border-transparent bg-primario-suave text-primario" : "border-borde bg-panel-2 text-texto-2 hover:text-texto"}`}>
                  {f.t}<span className={`ml-1.5 rounded-full px-1.5 text-[11px] tabular-nums ${filtro === f.v ? "bg-primario-boton text-white" : "bg-panel text-texto-2"}`}>{cuenta[f.v] ?? 0}</span>
                </Link>
              ))}
            </BarraDeslizable>
          }
          leads={visibles}
          total={filtrados.length}
          asignados={leads.length}
          callerId={jefe ? caller.id : null}
          pestana={filtro}
          orden={orden}
          zona={proyecto.zona_horaria}
          conIA={!!pesos}
          closers={closers}
          productos={(productos ?? []) as Producto[]}
          rol={perfil.rol}
          linkAgenda={proyecto.link_agenda}
          moneda={proyecto.moneda}
          guion={guion}
          miNombre={perfil.nombre}
          nombresPipeline={nombresPipeline}
          puedeGrabar={tiene.has("grabaciones")}
        />
      </Contenido>
    </>
  );
}

// C5 (7c.1, maqueta): etiqueta en mayúsculas, número grande, nota debajo e icono en un círculo de su color
function KpiCola({ titulo, valor, nota, color, icono: Icono, ultimo = false }: { titulo: string; valor: number; nota: string; color: string; icono: LucideIcon; ultimo?: boolean }) {
  return (
    <div className={`tarjeta relative flex min-w-0 flex-col rounded-2xl px-3.5 py-2.5 ${ultimo ? "col-span-2 lg:col-span-1" : ""}`}>
      <span className="pr-10 text-[10.5px] font-bold uppercase leading-tight tracking-[0.12em] text-texto-2">{titulo}</span>
      <b className="mt-1 text-2xl leading-tight tabular-nums">{valor}</b>
      <small className="text-[11px] text-texto-3">{nota}</small>
      <i className="absolute right-3 top-2.5 grid h-8 w-8 place-items-center rounded-full" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }} aria-hidden>
        <Icono className="h-4 w-4" />
      </i>
    </div>
  );
}
