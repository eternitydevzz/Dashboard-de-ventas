import Link from "next/link";
import { cargarGuion, rolDelGuion } from "@/lib/guiones-datos";
import { Phone, CalendarCheck, CalendarDays, MessageCircle, UserCheck, Users, Trophy } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { panelObjetivos } from "@/lib/objetivos";
import { PanelObjetivos } from "@/components/barras-objetivos";
import { db, todas, equipo } from "@/lib/datos";
import { rangoDe, porcentaje, pct, dinero, hoyEnZona, nombresCortos } from "@/lib/formato";
import { kpisHoyCola } from "@/lib/kpis-cola";
import type { Pesos } from "@/lib/cualificacion";
import { colaCaller, cuentaPorEstado, leerOrden, ordenarCola } from "@/lib/cola";
import { ESTADOS_CALLER, esContacto } from "@/lib/estados-caller";
import { Cabecera, Contenido, Kpi, Vacio, Avatar } from "@/components/ui";
import type { Lead, Producto } from "@/lib/tipos";
import { ColaCaller } from "./cola";

// C11 (7c.1): una pastilla por columna; la primera, «Leads» = toda la cola (no hay una solo para los nuevos)
const FILTROS = [{ v: "todos", t: "Leads" }, ...ESTADOS_CALLER.filter((e) => e.v !== "nuevo").map((e) => ({ v: e.v, t: e.t }))];

const CAMPOS_COLA = "id, nombre, apellido, email, telefono, pais, estado_caller, creado_en, etiquetas, respuestas";
type LeadCola = Pick<Lead, "id" | "nombre" | "apellido" | "email" | "telefono" | "pais" | "estado_caller" | "creado_en" | "etiquetas" | "respuestas">;

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
  const filtro = typeof sp.columna === "string" && FILTROS.some((f) => f.v === sp.columna) ? sp.columna : "todos";
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
  const [leads, kpis, productos, scoring, panel] = await Promise.all([
    todas<LeadCola>((a, b) => db().from("leads").select(CAMPOS_COLA).eq("proyecto_id", proyecto.id).eq(comoCloser ? "closer_id" : "caller_id", caller.id).order("id").range(a, b)),
    kpisHoyCola(proyecto.id, caller.id, hoy.desde!.toISOString()), // F4: solo de este proyecto
    db().from("productos").select("*").eq("proyecto_id", proyecto.id).eq("activo", true).order("orden"),
    db().from("scoring_ia").select("pesos").eq("proyecto_id", proyecto.id).maybeSingle(),
    panelObjetivos(proyecto, caller), // objetivos del caller que se está viendo, su racha y el del equipo (H3-H4)
  ]);
  const pesos = (scoring.data?.pesos ?? null) as Pesos | null; // priorización con IA (V2-11)
  // KPIs de hoy (7c.1): Llamadas (botón «Llamado») · Contactos (los que avanzan, punto 16) · Agendas (% de los
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
                  <Link key={c.id} href={`/caller?caller=${c.id}`} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${c.id === caller.id ? "bg-primario text-white" : "text-texto-2 hover:bg-panel-2"}`}>
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
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
          <Kpi titulo="Llamadas hoy" valor={llamadas} icono={Phone} detalle="botón «Llamado»" />
          <Kpi titulo="Contactos hoy" valor={contactos} icono={UserCheck} detalle="los que avanzan" />
          <Kpi titulo="Agendas hoy" valor={agendasHoy} icono={CalendarDays} tono="ok" detalle={`${pct(porcentaje(agendasHoy, contactos))} de los contactos`} />
          <Kpi titulo="WhatsApps hoy" valor={whatsapps} icono={MessageCircle} tono="ok" detalle="botón «Wsp enviado»" />
          <Kpi titulo="Confirmadas hoy" valor={confirmadas} icono={CalendarCheck} detalle="«Confirma Agenda»" />
        </div>

        <ColaCaller
          pestanas={
            <div className="flex gap-1.5 overflow-x-auto border-b border-borde p-2 [scrollbar-width:none]" role="group" aria-label="Filtrar por columna">
              {FILTROS.map((f) => (
                <Link prefetch={false} key={f.v} href={enlaceFiltro(f.v)} aria-pressed={filtro === f.v} className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${filtro === f.v ? "border-transparent bg-primario-suave text-primario" : "border-borde bg-panel-2 text-texto-2 hover:text-texto"}`}>
                  {f.t} <span className="ml-1 tabular-nums">{cuenta[f.v] ?? 0}</span>
                </Link>
              ))}
            </div>
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
          productos={(productos.data ?? []) as Producto[]}
          rol={perfil.rol}
          linkAgenda={proyecto.link_agenda}
          moneda={proyecto.moneda}
          guion={guion}
          miNombre={perfil.nombre}
        />
      </Contenido>
    </>
  );
}
