import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { conBajas, db, equipo, todas } from "@/lib/datos";
import { rangoDe, fecha as fmtFecha, hoyEnZona, ETIQUETA_ROL } from "@/lib/formato";
import { leerPeriodo, rangoNav } from "@/lib/periodos";
import { BarraPeriodo } from "@/components/barra-periodo";
import { PREGUNTAS, preguntasDe, preguntasValidas, rolDeReporte, tasasCloser, type Pregunta } from "@/lib/reportes";
import { Cabecera, Contenido, Seccion, Insignia, Vacio, Avatar } from "@/components/ui";
import { NuevoReporte } from "./formulario";
import { llamadasHoyCola } from "@/lib/kpis-cola";
import type { Reporte } from "@/lib/tipos";

export default async function ReportesPage({ searchParams }: PageProps<"/reportes">) {
  const { perfil, proyecto } = await exigirPagina("reportes"); // H5
  const jefe = esJefe(perfil);
  const sp = await searchParams;
  const persona = jefe ? (typeof sp.persona === "string" ? sp.persona : "") : perfil.id;
  // Una sola lectura del equipo: con los de prueba para los nombres; sin ellos para los botones de persona
  const todos = await equipo(proyecto.id, true);
  const gente = todos.filter((g) => !g.es_prueba);

  // S2-14 (17 nov): por periodo (Mes por defecto) y todas sus filas; antes, los últimos 200 (≈7 días con 30 personas) y
  // un fallo de la base salía como «Todavía no hay reportes»
  const per = leerPeriodo(sp);
  const rango = rangoNav(per.periodo, per.n, proyecto.zona_horaria, per.desde, per.hasta);
  // Los enlaces de persona conservan el periodo elegido (antes volvían a «Mes»)
  const enlace = (id?: string) => {
    const q = new URLSearchParams();
    for (const k of ["p", "n", "desde", "hasta"]) if (typeof sp[k] === "string") q.set(k, sp[k]);
    if (id) q.set("persona", id);
    return q.size ? `/reportes?${q}` : "/reportes";
  };
  const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: proyecto.zona_horaria }).format(d);
  const reportes = await todas<Reporte>((d, h) => {
    let q = db().from("reportes").select("*").eq("proyecto_id", proyecto.id).gte("fecha", ymd(rango.desde!)).lt("fecha", ymd(rango.hasta!));
    if (persona) q = q.eq("perfil_id", persona);
    return q.order("fecha", { ascending: false }).order("creado_en", { ascending: false }).order("id").range(d, h);
  });
  // Los nombres, también de los perfiles de prueba y de quien ya no está en el proyecto (salía «—», 11 oct 2026)
  const conNombre = await conBajas(todos, reportes.map((r) => r.perfil_id));
  const quien = (id: string) => (id === perfil.id ? perfil : conNombre.find((g) => g.id === id));
  const nombre = (id: string) => quien(id)?.nombre ?? "—";

  // Datos del sistema de hoy, para pre-rellenar el reporte
  const rol = rolDeReporte(perfil.rol);
  let sugeridos: Record<string, number> = {};
  if (rol) {
    const hoy = rangoDe("hoy", proyecto.zona_horaria);
    const desde = hoy.desde!.toISOString();
    // D43: las actividades de hoy pueden pasar de 1.000 filas: todas() pagina con orden fijo
    // Cristian, 14 nov (F8): solo el proyecto abierto; quien está en 2 proyectos veía la suma de los dos
    const [acts, agendas, { data: citas }, { count: ventas }] = await Promise.all([
      todas<{ tipo: string; resultado: string | null; lead_id: string }>((d, h) =>
        db().from("actividades").select("tipo, resultado, lead_id").eq("proyecto_id", proyecto.id).eq("perfil_id", perfil.id).gte("creado_en", desde).order("id").range(d, h)
      ),
      todas<{ lead_id: string }>((d, h) => db().from("citas").select("lead_id").eq("proyecto_id", proyecto.id).eq("agendada_por", perfil.id).gte("creado_en", desde).order("id").range(d, h)),
      db().from("citas").select("estado, fecha").eq("proyecto_id", proyecto.id).eq("closer_id", perfil.id).gte("fecha", desde).lt("fecha", hoy.hasta!.toISOString()),
      db().from("ventas").select("id", { count: "exact", head: true }).eq("proyecto_id", proyecto.id).eq("vendedor_id", perfil.id).gte("fecha", desde),
    ]);
    const a = acts;
    const c = citas ?? [];
    // A3b-04 (17 nov): todo 1 por lead y día, igual que las llamadas (antes, cada clic: «2 llamadas y 4 no responden»)
    const porLead = (filas: { lead_id: string }[]) => new Set(filas.map((x) => x.lead_id)).size;
    sugeridos =
      rol === "caller"
        ? {
            llamadas: llamadasHoyCola(a), // Cristian, 14 nov: cualquier botón, 1 por lead y día (igual que Mis leads y KPIs)
            agendas: porLead(agendas),
            whatsapps: porLead(a.filter((x) => x.tipo === "whatsapp")),
            seguimientos: porLead(a.filter((x) => x.resultado === "seguimiento" || x.resultado === "llamar_luego")), // C11: Seguimiento y Llamar luego
          }
        : {
            llamadas_realizadas: c.filter((x) => ["cerrada", "seguimiento", "perdida"].includes(x.estado)).length,
            llamadas_agendadas: c.filter((x) => x.estado !== "cancelada" && x.estado !== "reagendada").length,
            no_responden: 0,
            no_show: c.filter((x) => x.estado === "no_show").length,
            ventas: ventas ?? 0,
          };
  }

  return (
    <>
      <Cabecera
        titulo="Reportes de fin de día"
        subtitulo={jefe ? "Los reportes de todo el equipo" : "Tus números de hoy en menos de dos minutos"}
        acciones={rol ? <NuevoReporte rol={rol} hoy={hoyEnZona(proyecto.zona_horaria)} sugeridos={sugeridos} preguntas={preguntasDe(proyecto.preguntas_reporte, rol)} /> : undefined}
      />
      <Contenido>
        <BarraPeriodo etiqueta={rango.etiqueta} conActualizar={false} />
        {jefe && (
          <div className="flex flex-wrap gap-1 rounded-xl border border-borde bg-panel p-1">
            <Link href={enlace()} className={`rounded-lg px-3 py-1.5 text-sm ${!persona ? "bg-primario text-white" : "text-texto-2 hover:bg-panel-2"}`}>Todos</Link>
            {gente.filter((g) => g.rol === "caller" || g.rol === "closer").map((g) => (
              <Link key={g.id} href={enlace(g.id)} className={`rounded-lg px-3 py-1.5 text-sm ${persona === g.id ? "bg-primario text-white" : "text-texto-2 hover:bg-panel-2"}`}>{g.nombre}</Link>
            ))}
          </div>
        )}
        {reportes.length === 0 ? (
          <div className="tarjeta"><Vacio icono={ClipboardList} texto={rol ? "No enviaste reportes en este periodo. Pulsa «Crear nuevo reporte»." : "No hay reportes en este periodo."} /></div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {reportes.map((r) => {
              // Bloque 7: cada reporte con las preguntas que tenía al enviarse (los de antes, con las de siempre)
              const rolR = r.rol as "caller" | "closer";
              const guardadas = r.preguntas ? preguntasValidas(rolR, r.preguntas) : null;
              const preguntas: Pregunta[] = guardadas && "ok" in guardadas ? guardadas.ok : (PREGUNTAS[rolR] ?? []);
              return (
                <Seccion key={r.id}>
                  <div className="mb-3 flex items-center gap-3">
                    <Avatar nombre={nombre(r.perfil_id)} foto={quien(r.perfil_id)?.foto} />
                    <div className="flex-1">
                      <div className="font-medium">{nombre(r.perfil_id)}</div>
                      <div className="text-xs text-texto-3">{ETIQUETA_ROL[r.rol]} · {fmtFecha(`${r.fecha}T12:00:00Z`, proyecto)}</div>
                    </div>
                    <Insignia tono="primario">{r.fecha}</Insignia>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {preguntas.filter((p) => p.tipo === "numero").map((p) => (
                      <div key={p.clave} className={`rounded-lg border p-2 text-center ${p.destacada ? "border-oro/40 bg-oro-suave" : "border-borde bg-panel-2"}`}>
                        <div className={`text-xl font-semibold tabular-nums ${p.destacada ? "text-oro" : ""}`}>{r.respuestas[p.clave]}</div>
                        <div className="text-[10px] leading-tight text-texto-3">{p.texto.replace(/[¿?]/g, "")}</div>
                      </div>
                    ))}
                  </div>
                  {r.rol === "closer" && (
                    <div className="mt-2 flex gap-2 text-xs">
                      <span className="chip bg-primario-suave text-primario">Tasa de agendamiento {tasasCloser(r.respuestas).agendamiento}</span>
                      <span className="chip bg-ok-suave text-ok">Tasa de cierre {tasasCloser(r.respuestas).cierre}</span>
                    </div>
                  )}
                  <dl className="mt-3 space-y-2 text-sm">
                    {preguntas.filter((p) => p.tipo === "texto").map((p) => (
                      <div key={p.clave}>
                        <dt className="text-xs text-texto-3">{p.texto}</dt>
                        <dd className="whitespace-pre-wrap">{String(r.respuestas[p.clave] ?? "—")}</dd>
                      </div>
                    ))}
                  </dl>
                </Seccion>
              );
            })}
          </div>
        )}
      </Contenido>
    </>
  );
}
