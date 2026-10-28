import Link from "next/link";
import { cargarGuion, rolDelGuion } from "@/lib/guiones-datos";
import { Phone, CalendarCheck, MessageCircle, ShoppingCart, PhoneOff, Users, Trophy } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { panelObjetivos } from "@/lib/objetivos";
import { PanelObjetivos } from "@/components/barras-objetivos";
import { db, todas, equipo } from "@/lib/datos";
import { rangoDe, fechaHora, porcentaje, ahoraMs, pct, dinero, hoyEnZona } from "@/lib/formato";
import type { Pesos } from "@/lib/cualificacion";
import { colaCaller } from "@/lib/cola";
import { Cabecera, Contenido, Kpi, Vacio, Avatar } from "@/components/ui";
import type { Lead, Producto } from "@/lib/tipos";
import { ColaCaller } from "./cola";

const PESTANAS = [
  { v: "llamar", t: "Por llamar" },
  { v: "luego", t: "Llamar luego" },
  { v: "agendados", t: "Agendados" },
  { v: "todos", t: "Todos" },
];

const CAMPOS_COLA = "id, nombre, apellido, email, telefono, pais, estado_caller, llamar_en, creado_en, etiquetas, respuestas";
type LeadCola = Pick<Lead, "id" | "nombre" | "apellido" | "email" | "telefono" | "pais" | "estado_caller" | "llamar_en" | "creado_en" | "etiquetas" | "respuestas">;

export default async function CallerPage({ searchParams }: PageProps<"/caller">) {
  const { perfil, proyecto } = await exigirPagina("cola"); // H5
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
  const pestana = typeof sp.vista === "string" ? sp.vista : "llamar";

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
  const [leads, actsHoy, citasHoy, ventasHoy, productos, scoring, panel] = await Promise.all([
    todas<LeadCola>((a, b) => db().from("leads").select(CAMPOS_COLA).eq("proyecto_id", proyecto.id).eq(comoCloser ? "closer_id" : "caller_id", caller.id).order("id").range(a, b)),
    db().from("actividades").select("tipo, resultado").eq("perfil_id", caller.id).eq("proyecto_id", proyecto.id).gte("creado_en", hoy.desde!.toISOString()),
    db().from("citas").select("id", { count: "exact", head: true }).eq("agendada_por", caller.id).gte("creado_en", hoy.desde!.toISOString()),
    db().from("ventas").select("id", { count: "exact", head: true }).eq("vendedor_id", caller.id).gte("fecha", hoy.desde!.toISOString()),
    db().from("productos").select("*").eq("proyecto_id", proyecto.id).eq("activo", true).order("orden"),
    db().from("scoring_ia").select("pesos").eq("proyecto_id", proyecto.id).maybeSingle(),
    panelObjetivos(proyecto, caller), // objetivos del caller que se está viendo, su racha y el del equipo (H3-H4)
  ]);
  const pesos = (scoring.data?.pesos ?? null) as Pesos | null; // priorización con IA (V2-11)
  const acts = actsHoy.data ?? [];
  const llamadas = acts.filter((a) => a.tipo === "llamada").length;
  const noContesta = acts.filter((a) => a.tipo === "llamada" && a.resultado === "no_contesta").length;
  const whatsapps = acts.filter((a) => a.tipo === "whatsapp").length;

  const ahora = ahoraMs();
  const filtrados = colaCaller(leads, pestana, ahora, pesos);
  const vencidos = leads.filter((l) => (l.estado_caller === "llamar_luego" || l.estado_caller === "link_enviado") && l.llamar_en && new Date(l.llamar_en).getTime() <= ahora);
  // Al navegador van los 300 primeros (los que se enseñan) y, si la dirección pide otro (?lead=), también ese
  const visibles = filtrados.slice(0, 300);
  const pedido = filtrados.find((l) => l.id === sp.lead);
  if (pedido && !visibles.includes(pedido)) visibles.push(pedido);
  const closers = gente.filter((g) => g.rol === "closer").map((g) => ({ id: g.id, nombre: g.nombre }));

  return (
    <>
      <Cabecera
        titulo={jefe ? "Callers" : "Mis leads"}
        subtitulo={jefe ? `Viendo la cola de ${caller.nombre}` : `${leads.length} leads asignados · ordenados por prioridad`}
        acciones={
          <>
            {jefe && (
              <div className="flex flex-wrap gap-1 rounded-xl border border-borde bg-panel p-1">
                {callers.map((c) => (
                  <Link key={c.id} href={`/caller?caller=${c.id}`} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${c.id === caller.id ? "bg-primario text-white" : "text-texto-2 hover:bg-panel-2"}`}>
                    <Avatar nombre={c.nombre} tamano="h-6 w-6 text-[9px]" />{c.nombre.split(" ")[0]}
                  </Link>
                ))}
              </div>
            )}
            <Link href="/ranking" className="btn-secundario"><Trophy className="h-4 w-4 text-oro" /> Ranking del equipo</Link>
          </>
        }
      />
      <Contenido>
        {/* 25 oct 2026 (Cristian): sin refresco automático cada 60 s; la base se saturaba con el equipo trabajando */}
        <PanelObjetivos panel={panel} dinero={(n: number) => dinero(n, proyecto)} celebrar={jefe ? null : `${caller.id}-${hoyEnZona(proyecto.zona_horaria)}`} />
        {vencidos.length > 0 && (
          <Link href={`/caller?${new URLSearchParams({ ...(jefe ? { caller: caller.id } : {}), vista: "llamar", lead: vencidos[0].id })}`} className="flex items-center gap-3 rounded-xl border border-aviso/40 bg-aviso-suave px-4 py-3 text-sm text-aviso hover:brightness-105">
            <span className="text-lg">⏰</span>
            <span className="flex-1">
              <b>{vencidos.length === 1 ? "Te toca 1 llamada programada" : `Te tocan ${vencidos.length} llamadas programadas`}</b>
              {" "}· la primera: {`${vencidos[0].nombre} ${vencidos[0].apellido}`.trim()} ({fechaHora(vencidos[0].llamar_en!, proyecto)}). Están las primeras en «Por llamar».
            </span>
            <span className="font-medium">Llamar ahora →</span>
          </Link>
        )}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
          <Kpi titulo="Llamadas hoy" valor={llamadas} icono={Phone} detalle={`${leads.length} leads asignados`} />
          <Kpi titulo="No contestan" valor={noContesta} icono={PhoneOff} tono="mal" detalle={`${pct(porcentaje(noContesta, llamadas))} de las llamadas`} />
          <Kpi titulo="Agendas hoy" valor={citasHoy.count ?? 0} icono={CalendarCheck} tono="ok" detalle={`${pct(porcentaje(citasHoy.count ?? 0, llamadas - noContesta))} de los contactos`} />
          <Kpi titulo="WhatsApps hoy" valor={whatsapps} icono={MessageCircle} tono="ok" />
          <Kpi titulo="Ventas low ticket hoy" valor={ventasHoy.count ?? 0} icono={ShoppingCart} tono="oro" />
        </div>

        <ColaCaller
          pestanas={
            <div className="flex gap-1 border-b border-borde p-2">
              {PESTANAS.map((p) => (
                <Link prefetch={true} key={p.v} href={`/caller?${new URLSearchParams({ ...(jefe ? { caller: caller.id } : {}), vista: p.v })}`} className={`flex-1 rounded-md px-2 py-1.5 text-center text-xs font-medium ${pestana === p.v ? "bg-primario-suave text-primario" : "text-texto-2 hover:bg-panel-2"}`}>
                  {p.t}
                </Link>
              ))}
            </div>
          }
          leads={visibles}
          total={filtrados.length}
          asignados={leads.length}
          callerId={jefe ? caller.id : null}
          pestana={pestana}
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
