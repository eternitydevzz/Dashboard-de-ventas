import { NextResponse, type NextRequest } from "next/server";
import { getSesion, esJefe } from "@/lib/auth";
import { puedeSeccion } from "@/lib/permisos";
import { cargarAgendas, closersVisibles } from "@/lib/agendas-datos";
import { metricasAgendas, type MetricasAgendas } from "@/lib/metricas-agendas";
import { leerPeriodo, rangoNav } from "@/lib/periodos";
import { dinero, fechaHora, pct } from "@/lib/formato";
import { generarPdf } from "@/lib/reporte-pdf";
import { esCloser } from "@/lib/tipos";

// «Generar reporte» de Agendas: el mismo periodo y filtros que la pantalla, en PDF.
export async function GET(request: NextRequest) {
  const { perfil, proyecto } = await getSesion();
  const jefe = esJefe(perfil);
  // H5: sin la sección «Agendas» (por su rol o su ficha), nada
  if (!(await puedeSeccion(perfil, proyecto.id, "agendas"))) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  if (!jefe && !esCloser(perfil)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 }); // A2: también el caller con «También closer» (lo suyo como closer)
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const p = leerPeriodo(sp);
  const rango = rangoNav(p.periodo, p.n, proyecto.zona_horaria, p.desde, p.hasta);
  const datos = await cargarAgendas(proyecto, !!perfil.es_prueba);
  const vis = closersVisibles(perfil, datos.gente, sp.closer ?? null);
  const filtros = { productoId: sp.producto || null, evento: sp.evento || null };
  const m = metricasAgendas(datos, rango, { closerIds: vis.ids, ...filtros });
  const $ = (n: number) => dinero(n, proyecto);
  const producto = datos.productos.find((x) => x.id === filtros.productoId)?.nombre;
  const quien = jefe ? (sp.closer ? vis.closers[0]?.nombre ?? "—" : "Todos los closers") : perfil.nombre;

  const fila = (x: MetricasAgendas): string[] => [String(x.agendadas), String(x.asistencias), String(x.cerradas), `${pct(x.pctCierre)}`, $(x.facturacion), $(x.cash), String(x.calificados)];
  const bytes = await generarPdf(
    `Agendas · ${proyecto.nombre}`,
    [quien, rango.etiqueta, producto, filtros.evento, `generado el ${fechaHora(new Date().toISOString(), proyecto)}`].filter(Boolean).join(" · "),
    [
      { titulo: "Dinero", filas: [["Facturación", $(m.facturacion)], ["Cash collected (neto de devoluciones)", $(m.cash)], ["Ventas", String(m.ventas)], ["Ticket medio", $(m.ticketMedio)], ["Devoluciones", `${m.devoluciones} · ${$(m.devuelto)}`]] },
      { titulo: "Embudo", filas: [["Agendadas", String(m.agendadas)], ["Asistencias", String(m.asistencias)], ["Cerradas", String(m.cerradas)], ["% cierre sobre asistencias", `${pct(m.pctCierre)}`], ["Call/close (sobre agendadas)", `${pct(m.pctCallClose)}`], ["Perdidas · No-show · Reagendadas · Canceladas", `${m.perdidas} · ${m.noShow} · ${m.reagendadas} · ${m.canceladas}`], ["Pendientes", String(m.pendientes)], ["Tasa de asistencia", `${pct(m.tasaAsistencia)}`], ["Tasa de cancelación", `${pct(m.tasaCancelacion)}`]] },
      { titulo: "Calidad", filas: [["Calificados 4 estrellas o más", `${m.calificados} (${m.con5} con 5)`], ["Media de estrellas del closer", String(m.mediaEstrellasCloser ?? "—")], ["Media de estrellas del caller", String(m.mediaEstrellasCaller ?? "—")]] },
      { titulo: "Agendas por pipeline", filas: m.porPipeline.map((x) => [x.nombre, String(x.n)] as [string, string]) },
      { titulo: "Agendas por UTM", filas: m.porUtm.map((x) => [x.nombre, String(x.n)] as [string, string]) },
      ...(jefe && !sp.closer
        ? [{ titulo: "Por closer", tabla: { cabecera: ["Closer", "Agend.", "Asist.", "Cerr.", "% cierre", "Facturación", "Cash", "4*+"], filas: vis.todos.map((c) => [c.nombre, ...fila(metricasAgendas(datos, rango, { closerIds: [c.id], ...filtros }))]) } }]
        : []),
    ]
  );
  const nombre = `agendas-${proyecto.nombre}-${rango.etiqueta}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nombre}.pdf"`, "Cache-Control": "no-store" },
  });
}
