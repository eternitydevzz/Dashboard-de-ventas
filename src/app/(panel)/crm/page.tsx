import Link from "next/link";
import { nombreVisiblePipeline } from "@/lib/pipelines-nombre";
import { esJefe, puedeAdmin } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { miMoneda } from "@/lib/mercado-datos";
import { db, todas, equipo } from "@/lib/datos";
import { calcularNivel, type FilaPermisoPipeline } from "@/lib/pipelines";
import { columnaCitasGhl, columnaCitasPorNombre } from "@/lib/leads";
import { cargarCitasVentas, columnasCloser } from "@/lib/tablero-closers";
import { canalesDe } from "@/lib/canales-datos";
import { Cabecera, Contenido } from "@/components/ui";
import { FiltroUrl } from "@/components/barra-periodo";
import { ahoraMs } from "@/lib/formato";
import { TableroCrm, type LeadTarjeta } from "./tablero";
import { compactarCrm } from "./compacto";
import { esCloser, type Etapa, type Pipeline, type Producto, type Respuesta } from "@/lib/tipos";

// Un solo CRM para todos (Paso H7) con los pipelines del equipo (Paso 0, como GHL): los de origen (Webinar 1…),
// «Callers» (los leads con caller, por el resultado de su llamada) y «Closers» (Pre-call y Post-call juntos).
// Cada pipeline tiene sus permisos: Editar (también columnas), Ver (mueve sus tarjetas) o Sin acceso.
// Director y CEO ven todo (con filtro por persona); el caller y el closer, «Mi CRM» con lo suyo.
export default async function CrmPage({ searchParams }: PageProps<"/crm">) {
  const { perfil, proyecto } = await exigirPagina("crm"); // H5
  const jefe = esJefe(perfil);
  const admin = puedeAdmin(perfil);
  const sp = await searchParams;

  // Velocidad (13 oct 2026): todo lo que no depende del pipeline elegido va a la vez (antes, 9 pasos en fila)
  const [gente, todos, filas, { data: productos }, { data: etapasProyecto }, canales] = await Promise.all([
    equipo(proyecto.id, !!perfil.es_prueba),
    db().from("pipelines").select("*").eq("proyecto_id", proyecto.id).order("orden").then(({ data }) => (data ?? []) as Pipeline[]),
    // Velocidad (17 oct 2026): los permisos de los pipelines del proyecto, a la vez (antes, después de los pipelines)
    db()
        .from("permisos_pipeline")
        .select("pipeline_id, rol, perfil_id, nivel, pipelines!inner(proyecto_id)")
        .eq("pipelines.proyecto_id", proyecto.id)
        .then(({ data }) =>
          ((data ?? []) as (FilaPermisoPipeline & { pipelines?: unknown })[]).map((f) => {
            const { pipelines: _fuera, ...fila } = f; // eslint-disable-line @typescript-eslint/no-unused-vars
            return fila as FilaPermisoPipeline;
          })
        ),
    // «Vendido» abre la venta: el caller no registra ventas (Cristian, 12 oct)
    perfil.rol === "caller"
      ? Promise.resolve({ data: [] as Producto[] })
      : db().from("productos").select("*").eq("proyecto_id", proyecto.id).eq("activo", true).order("orden"),
    // Las columnas de todos los pipelines: las del elegido y las de las acciones masivas
    db().from("etapas").select("*, pipelines!inner(proyecto_id)").eq("pipelines.proyecto_id", proyecto.id).order("orden"),
    canalesDe(proyecto.id), // B2b: los canales del proyecto (filtro de canal y origen de las citas)
  ]);
  const persona = jefe ? gente.find((g) => g.id === sp.persona && (g.rol === "caller" || g.rol === "closer")) ?? null : perfil;
  // Los leads de una persona: los que tiene asignados como caller o como closer
  const deLaPersona = <Q extends { or: (f: string) => Q }>(q: Q) => (persona ? q.or(`caller_id.eq.${persona.id},closer_id.eq.${persona.id}`) : q);
  const esDeLaPersona = (l: { caller_id: string | null; closer_id: string | null }) => !persona || l.caller_id === persona.id || l.closer_id === persona.id;
  const niveles = Object.fromEntries(todos.map((p) => [p.id, calcularNivel(perfil, p, filas)]));
  // C8: a un caller, «Callers» se le enseña como «<Su nombre> Caller»
  const pipelines = todos.filter((p) => niveles[p.id] !== "sin_acceso").map((p) => ({ ...p, nombre: nombreVisiblePipeline(p, perfil) }));
  const pipeline = pipelines.find((p) => p.id === sp.pipeline) ?? pipelines[0] ?? null;
  const todasEtapas = ((etapasProyecto ?? []) as (Etapa & { pipelines?: unknown })[]).map((e) => {
    const { pipelines: _fuera, ...etapa } = e; // eslint-disable-line @typescript-eslint/no-unused-vars
    return etapa as Etapa;
  });
  const etapas = pipeline ? todasEtapas.filter((e) => e.pipeline_id === pipeline.id) : [];
  // Velocidad (17 oct 2026): la columna de las citas de GHL con lo ya cargado (antes, 2–3 consultas más en fila; misma
  // regla que columnaCitasGhl). Si la elegida no está entre las columnas de este proyecto, se pregunta como antes.
  const elegida = proyecto.etapa_citas_ghl ?? null;
  const citasGhl = !admin
    ? null
    : elegida
      ? todasEtapas.some((e) => e.id === elegida)
        ? elegida
        : ((await columnaCitasGhl(proyecto.id))?.id ?? null)
      : (columnaCitasPorNombre(todos.filter((p) => p.tipo === "normal").map((p) => ({ id: p.id, nombre: p.nombre, etapas: todasEtapas.filter((e) => e.pipeline_id === p.id) })))?.id ?? null);

  // «Closers»: qué citas ve cada uno (como Agendas): el closer las suyas; el caller las que agendó (solo mirar)
  const closersIds = gente.filter(esCloser).map((g) => g.id);
  const deCloser = !persona ? closersIds : persona.rol === "closer" ? [persona.id] : closersIds;
  const agendadasPor = persona?.rol === "caller" ? persona.id : null;

  // La card solo necesita la respuesta de «invertir» (el popup pide el resto): menos datos que mandar al navegador
  type Fila = Omit<LeadTarjeta, "invertir"> & { etapa_callers_id: string | null; respuestas: Respuesta[] | null };
  const CAMPOS = "id, nombre, apellido, email, telefono, pais, etapa_id, etapa_callers_id, caller_id, closer_id, estado_caller, creado_en, etiquetas, respuestas, oferta";
  const aTarjeta = ({ respuestas, ...l }: Fila): LeadTarjeta & { etapa_callers_id: string | null } => ({
    ...l,
    invertir: (respuestas ?? []).find((r) => r.pregunta.toLowerCase().includes("invertir"))?.respuesta ?? null,
  });

  // Lo del pipeline elegido, también a la vez
  // C5 (13 nov): sin los números de las pestañas: se calculaban (2 consultas más por carga) y no se enseñaban desde el 13 oct
  const [leadsCrudos, extraLeads, closers] = await Promise.all([
    pipeline && pipeline.tipo !== "closers"
      ? todas<Fila>((a, b) => {
          let q = db().from("leads").select(CAMPOS).eq("proyecto_id", proyecto.id);
          // «Callers»: solo los leads con caller (Cristian, 10 oct 2026)
          q = pipeline.tipo === "callers" ? q.not("caller_id", "is", null) : q.eq("pipeline_id", pipeline.id);
          return deLaPersona(q).order("creado_en", { ascending: false }).order("id").range(a, b);
        }).then((filas) => filas.map(aTarjeta))
      : Promise.resolve([]),
    // Fase 4: en un pipeline de origen salen también sus tarjetas de leads cuyo pipeline principal es otro (con sus datos, en una consulta)
    pipeline?.tipo === "normal"
      ? todas<{ etapa_id: string | null; leads: Fila | null }>((a, b) => db().from("tarjetas_extra").select(`etapa_id, leads(${CAMPOS})`).eq("pipeline_id", pipeline.id).order("id").range(a, b).overrideTypes<{ etapa_id: string | null; leads: Fila | null }[], { merge: false }>()).then((filas) =>
          filas.filter((x) => x.leads && esDeLaPersona(x.leads)).map((x) => ({ ...aTarjeta(x.leads!), etapa_id: x.etapa_id, otroPipeline: true }))
        )
      : Promise.resolve([]),
    pipeline?.tipo === "closers"
      ? cargarCitasVentas(proyecto.id, deCloser, agendadasPor, jefe && !persona).then(({ citas, ventas }) =>
          columnasCloser(etapas, citas, ventas, { proyecto, jefe, nombrePersona: (id: string | null) => gente.find((g) => g.id === id)?.nombre ?? "—", canales })
        )
      : Promise.resolve(null),
  ]);
  // En «Callers» la columna de cada lead es la de su llamada
  const yaEstan = new Set(leadsCrudos.map((l) => l.id));
  const leads: LeadTarjeta[] = [...leadsCrudos, ...extraLeads.filter((l) => !yaEstan.has(l.id))].map(({ etapa_callers_id, ...l }) => (pipeline?.tipo === "callers" ? { ...l, etapa_id: etapa_callers_id } : l));

  const nivel = pipeline ? niveles[pipeline.id] : "ver";
  // Acciones masivas (Fase 4): a qué columnas se pueden mover leads (las libres de los pipelines de origen y «Callers»)
  const movibles = jefe ? pipelines.filter((p) => p.tipo !== "closers") : [];
  const destinos = movibles.map((p) => ({
    pipeline: p.nombre,
    etapas: todasEtapas.filter((e) => e.pipeline_id === p.id && !e.estado_caller).map((e) => ({ id: e.id, nombre: e.nombre })),
  })).filter((d) => d.etapas.length);
  return (
    <>
      <Cabecera
        titulo={jefe ? "CRM" : "Mi CRM"}
        subtitulo={`${proyecto.nombre} · ${jefe ? (persona ? `de ${persona.nombre}` : "todo el equipo") : `${perfil.nombre} · lo tuyo`}`}
        acciones={
          jefe ? (
            <>
              <Link href="/crm/duplicados" className="btn btn-secundario">Duplicados</Link>
              <FiltroUrl
              nombre="persona"
              etiqueta="Persona"
              todos="Todo el equipo"
              opciones={gente.filter((g) => g.rol === "caller" || g.rol === "closer").map((g) => ({ v: g.id, t: `${g.nombre} · ${g.rol}` }))}
              />
            </>
          ) : undefined
        }
      />
      <Contenido>
        {/* 25 oct 2026 (Cristian): sin refresco automático cada 60 s; la base se saturaba con el equipo trabajando */}
        <TableroCrm
          pipelines={pipelines}
          pipeline={pipeline}
          etapas={etapas}
          leads={compactarCrm(leads)}
          callers={gente.filter((g) => g.rol === "caller").map((g) => ({ id: g.id, nombre: g.nombre }))}
          closers={gente.filter(esCloser).map((g) => ({ id: g.id, nombre: g.nombre }))}
          admin={admin}
          citasGhl={citasGhl}
          destinos={destinos}
          paraReparto={jefe ? pipelines.filter((p) => p.tipo === "normal").map((p) => ({ id: p.id, nombre: p.nombre, etapas: todasEtapas.filter((e) => e.pipeline_id === p.id).map((e) => ({ id: e.id, nombre: e.nombre })) })) : undefined}
          ceo={perfil.rol === "ceo"}
          editar={nivel === "editar"}
          jefe={jefe}
          productos={(productos ?? []) as Producto[]}
          moneda={await miMoneda(proyecto, perfil.id)}
          estrellasOpcionales={perfil.rol !== "caller"}
          canales={canales}
          ahora={ahoraMs()} // D43: «hace X d» con la hora del servidor (sin #418)
          tableroClosers={closers ? { ...closers, soloMirar: perfil.rol === "caller" } : null}
          permisos={
            admin && pipeline
              ? {
                  filas: filas.filter((f) => f.pipeline_id === pipeline.id),
                  gente: gente.filter((g) => g.rol !== "ceo").map((g) => ({ id: g.id, nombre: g.nombre, rol: g.rol })),
                }
              : null
          }
        />
      </Contenido>
    </>
  );
}
