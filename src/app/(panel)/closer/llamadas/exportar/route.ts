import { NextResponse, type NextRequest } from "next/server";
import { getSesion, esJefe } from "@/lib/auth";
import { puedeSeccion } from "@/lib/permisos";
import { db, todas, equipo } from "@/lib/datos";
import { closersVisibles } from "@/lib/agendas-datos";
import { coincide, quienLlevaba } from "@/lib/llamadas";
import { ETIQUETA_ESTADO_CITA } from "@/lib/formato";
import { csvExcel, nombreArchivo } from "@/lib/csv-excel";
import { SIN_CANAL, nombreCanal } from "@/lib/canal";

// Exportar las llamadas (las que puede ver esta persona) a CSV. Se abre con Excel.
export async function GET(request: NextRequest) {
  const { perfil, proyecto } = await getSesion();
  // H5: sin la sección «Agendas» (por su rol o su ficha), nada
  if (!(await puedeSeccion(perfil, proyecto.id, "agendas"))) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  if (!esJefe(perfil) && perfil.rol !== "closer") return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const sp = request.nextUrl.searchParams;
  const gente = await equipo(proyecto.id);
  const vis = closersVisibles(perfil, gente, sp.get("closer"));
  const ids = vis.ids.length ? vis.ids : ["00000000-0000-0000-0000-000000000000"];
  const conSinCloser = esJefe(perfil) && !sp.get("closer"); // 3 nov: como en Agendas, también las que no tienen closer del equipo
  const citas = await todas<{ fecha: string; estado: string; closer_id: string | null; closer_antes?: string | null; nota: string | null; canal?: string | null; estrellas_caller: number | null; estrellas_closer: number | null; leads: { nombre: string; apellido: string; email: string | null; telefono: string | null } | null }>((a, b) => {
    const base = db().from("citas").select("*, leads(nombre, apellido, email, telefono)").eq("proyecto_id", proyecto.id);
    return (conSinCloser ? base.or(`closer_id.in.(${ids.join(",")}),closer_id.is.null`) : base.in("closer_id", ids)).order("fecha").order("id").range(a, b);
  });
  const q = sp.get("q") ?? "";
  const canal = sp.get("canal") ?? ""; // fase 4 (plan GHL): el mismo filtro de canal que en Agendas
  const fmt = new Intl.DateTimeFormat("es-ES", { timeZone: proyecto.zona_horaria, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const filas = citas
    .filter((c) => coincide(q, `${c.leads?.nombre ?? ""} ${c.leads?.apellido ?? ""}`, c.leads?.email, c.leads?.telefono) && (!canal || (c.canal ?? SIN_CANAL) === canal))
    .map((c) => [fmt.format(new Date(c.fecha)), `${c.leads?.nombre ?? ""} ${c.leads?.apellido ?? ""}`.trim(), c.leads?.email, c.leads?.telefono, quienLlevaba(c, (id) => gente.find((g) => g.id === id)?.nombre ?? "—"), ETIQUETA_ESTADO_CITA[c.estado] ?? c.estado, nombreCanal(c.canal) ?? "", c.estrellas_caller, c.estrellas_closer, c.nota]);
  const csv = csvExcel(["Fecha", "Lead", "Email", "Teléfono", "Closer", "Estado", "Canal", "Estrellas caller", "Estrellas closer", "Nota"], filas);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="llamadas-${nombreArchivo(proyecto.nombre)}.csv"`, "Cache-Control": "no-store" } });
}
