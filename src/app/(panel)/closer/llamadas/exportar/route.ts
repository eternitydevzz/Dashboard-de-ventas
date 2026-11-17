import { NextResponse, type NextRequest } from "next/server";
import { getSesion, esJefe } from "@/lib/auth";
import { puedeSeccion } from "@/lib/permisos";
import { db, todas, equipo } from "@/lib/datos";
import { closersVisibles } from "@/lib/agendas-datos";
import { ABIERTAS, coincide, quienLlevaba } from "@/lib/llamadas";
import { ETIQUETA_ESTADO_CITA, nombrePais } from "@/lib/formato";
import { csvExcel, nombreArchivo } from "@/lib/csv-excel";
import { SIN_CANAL, nombreCanal } from "@/lib/canal";
import { canalesDe } from "@/lib/canales-datos";
import { mercadosDelProyecto } from "@/lib/mercado-datos";
import { entraEnMercado, mercadoValido, type Mercado } from "@/lib/mercado";
import { zonaPersona } from "@/lib/zona-persona";
import { esCloser } from "@/lib/tipos";

// Exportar las llamadas (las que puede ver esta persona) a CSV. Se abre con Excel.
export async function GET(request: NextRequest) {
  const { perfil, proyecto } = await getSesion();
  // H5: sin la sección «Agendas» (por su rol o su ficha), nada
  if (!(await puedeSeccion(perfil, proyecto.id, "agendas"))) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  if (!esJefe(perfil) && !esCloser(perfil)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const doble = perfil.rol === "caller" && esCloser(perfil); // A2: como en Agendas, las suyas como closer y las que agendó
  const sp = request.nextUrl.searchParams;
  const [gente, canales] = await Promise.all([equipo(proyecto.id), canalesDe(proyecto.id)]);
  // S1-14: los mismos filtros que la pantalla (mercado, UTM, estado) y las horas en la zona de quien mira
  const filtroM = esJefe(perfil) ? mercadoValido(sp.get("mercado")) : null;
  const mercados = filtroM ? await mercadosDelProyecto(proyecto.id) : ({} as Record<string, Mercado>);
  const vis = closersVisibles(perfil, filtroM ? gente.filter((g) => entraEnMercado(mercados, g.id, filtroM)) : gente, sp.get("closer"));
  const ids = vis.ids.length ? vis.ids : ["00000000-0000-0000-0000-000000000000"];
  const conSinCloser = esJefe(perfil) && !sp.get("closer") && !filtroM; // 3 nov: como en Agendas, también las que no tienen closer del equipo (con mercado, no)
  const citas = await todas<{ fecha: string; estado: string; closer_id: string | null; closer_antes?: string | null; nota: string | null; canal?: string | null; estrellas_caller: number | null; estrellas_closer: number | null; leads: { nombre: string; apellido: string; email: string | null; telefono: string | null; pais: string | null; seguimiento: { utm_source?: string | null } | null } | null }>((a, b) => {
    const base = db().from("citas").select("*, leads(nombre, apellido, email, telefono, pais, seguimiento)").eq("proyecto_id", proyecto.id);
    const consulta = doble ? base.or(`closer_id.in.(${ids.join(",")}),agendada_por.eq.${perfil.id}`) : conSinCloser ? base.or(`closer_id.in.(${ids.join(",")}),closer_id.is.null`) : base.in("closer_id", ids);
    return consulta.order("fecha").order("id").range(a, b);
  });
  const q = sp.get("q") ?? "";
  const canal = sp.get("canal") ?? ""; // fase 4 (plan GHL): el mismo filtro de canal que en Agendas
  const utm = sp.get("utm") ?? "";
  const estado = sp.get("estado") ?? "";
  const fmt = new Intl.DateTimeFormat("es-ES", { timeZone: zonaPersona(perfil, proyecto), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const filas = citas
    .filter((c) => coincide(q, `${c.leads?.nombre ?? ""} ${c.leads?.apellido ?? ""}`, c.leads?.email, c.leads?.telefono) && (!canal || (c.canal ?? SIN_CANAL) === canal) && (!utm || (c.leads?.seguimiento?.utm_source || "Sin UTM") === utm) && (!estado || (estado === "abiertas" ? (ABIERTAS as readonly string[]).includes(c.estado) : c.estado === estado)))
    .map((c) => [fmt.format(new Date(c.fecha)), `${c.leads?.nombre ?? ""} ${c.leads?.apellido ?? ""}`.trim(), c.leads?.email, c.leads?.telefono, nombrePais(c.leads?.pais), quienLlevaba(c, (id) => gente.find((g) => g.id === id)?.nombre ?? "—"), ETIQUETA_ESTADO_CITA[c.estado] ?? c.estado, nombreCanal(c.canal, canales) ?? "", c.estrellas_caller, c.estrellas_closer, c.nota]);
  const csv = csvExcel(["Fecha", "Lead", "Email", "Teléfono", "País", "Closer", "Estado", "Canal", "Estrellas caller", "Estrellas closer", "Nota"], filas);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="llamadas-${nombreArchivo(proyecto.nombre)}.csv"`, "Cache-Control": "no-store" } });
}
