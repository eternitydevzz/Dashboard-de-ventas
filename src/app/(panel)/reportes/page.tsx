import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { conBajas, db, equipo, todas } from "@/lib/datos";
import { rangoDe, fecha as fmtFecha, ETIQUETA_ROL } from "@/lib/formato";
import { PREGUNTAS, preguntasDe, preguntasValidas, rolDeReporte, tasasCloser, type Pregunta } from "@/lib/reportes";
import { Cabecera, Contenido, Seccion, Insignia, Vacio, Avatar } from "@/components/ui";
import { NuevoReporte } from "./formulario";
import type { Reporte } from "@/lib/tipos";

export default async function ReportesPage({ searchParams }: PageProps<"/reportes">) {
  const { perfil, proyecto } = await exigirPagina("reportes"); // H5
  const jefe = esJefe(perfil);
  const sp = await searchParams;
  const persona = jefe ? (typeof sp.persona === "string" ? sp.persona : "") : perfil.id;
  const gente = await equipo(proyecto.id);

  let q = db().from("reportes").select("*").eq("proyecto_id", proyecto.id).order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(200);
  if (persona) q = q.eq("perfil_id", persona);
  const { data } = await q;
  const reportes = (data ?? []) as Reporte[];
  // Los nombres, también de los perfiles de prueba y de quien ya no está en el proyecto (salía «—», 11 oct 2026)
  const conNombre = await conBajas(await equipo(proyecto.id, true), reportes.map((r) => r.perfil_id));
  const quien = (id: string) => (id === perfil.id ? perfil : conNombre.find((g) => g.id === id));
  const nombre = (id: string) => quien(id)?.nombre ?? "—";

  // Datos del sistema de hoy, para pre-rellenar el reporte
  const rol = rolDeReporte(perfil.rol);
  let sugeridos: Record<string, number> = {};
  if (rol) {
    const hoy = rangoDe("hoy", proyecto.zona_horaria);
    const desde = hoy.desde!.toISOString();
    // D43: las actividades de hoy pueden pasar de 1.000 filas: todas() pagina con orden fijo
    const [acts, { count: agendas }, { data: citas }, { count: ventas }] = await Promise.all([
      todas<{ tipo: string; resultado: string | null }>((d, h) =>
        db().from("actividades").select("tipo, resultado").eq("perfil_id", perfil.id).gte("creado_en", desde).order("id").range(d, h)
      ),
      db().from("citas").select("id", { count: "exact", head: true }).eq("agendada_por", perfil.id).gte("creado_en", desde),
      db().from("citas").select("estado, fecha").eq("closer_id", perfil.id).gte("fecha", desde).lt("fecha", hoy.hasta!.toISOString()),
      db().from("ventas").select("id", { count: "exact", head: true }).eq("vendedor_id", perfil.id).gte("fecha", desde),
    ]);
    const a = acts;
    const c = citas ?? [];
    sugeridos =
      rol === "caller"
        ? {
            llamadas: a.filter((x) => x.tipo === "llamada").length,
            // C11: «No responde» (y «No contesta» del historial de antes del 7 nov)
            no_responden: a.filter((x) => x.resultado === "no_responde" || (x.tipo === "llamada" && x.resultado === "no_contesta")).length,
            agendas: agendas ?? 0,
            whatsapps: a.filter((x) => x.tipo === "whatsapp").length,
            seguimientos: a.filter((x) => x.resultado === "seguimiento" || x.resultado === "llamar_luego").length, // C11: Seguimiento y Llamar luego
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
        acciones={rol ? <NuevoReporte rol={rol} sugeridos={sugeridos} preguntas={preguntasDe(proyecto.preguntas_reporte, rol)} /> : undefined}
      />
      <Contenido>
        {jefe && (
          <div className="flex flex-wrap gap-1 rounded-xl border border-borde bg-panel p-1">
            <Link href="/reportes" className={`rounded-lg px-3 py-1.5 text-sm ${!persona ? "bg-primario text-white" : "text-texto-2 hover:bg-panel-2"}`}>Todos</Link>
            {gente.filter((g) => g.rol === "caller" || g.rol === "closer").map((g) => (
              <Link key={g.id} href={`/reportes?persona=${g.id}`} className={`rounded-lg px-3 py-1.5 text-sm ${persona === g.id ? "bg-primario text-white" : "text-texto-2 hover:bg-panel-2"}`}>{g.nombre}</Link>
            ))}
          </div>
        )}
        {reportes.length === 0 ? (
          <div className="tarjeta"><Vacio icono={ClipboardList} texto={rol ? "Todavía no has enviado reportes. Pulsa «Crear nuevo reporte»." : "Todavía no hay reportes."} /></div>
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
