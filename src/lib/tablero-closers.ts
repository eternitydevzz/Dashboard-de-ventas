import "server-only";
import { db, todas, conBajas } from "@/lib/datos";
import { dinero, fechaHora, fecha as soloFecha, ahoraMs, hoyEnZona, inicioDia } from "@/lib/formato";
import { CLAVES_CLOSER, SUB_POSTCALL, claveNatural, porRecuperar, quienLlevaba, repartirCloser } from "@/lib/llamadas";
import type { ColumnaC } from "@/app/(panel)/closer/llamadas/tablero-closers";
import type { Cita, Etapa, Lead, Perfil, Proyecto } from "@/lib/tipos";
import { origenCitaGhl, type TablaCanales } from "@/lib/canal";

// Datos del tablero «Closers» (Paso 0): lo usan el CRM y Agendas → Llamadas (Pre-call y Post-call).
type LeadCita = Pick<Lead, "id" | "nombre" | "apellido" | "telefono" | "pais" | "email" | "seguimiento">;
export type CitaFila = Cita & { etapa_closers_id: string | null; leads: LeadCita | null };
export type VentaFila = { id: string; lead_id: string; vendedor_id: string | null; facturacion: number; cash_collected: number; tipo_pago: string; num_cuotas: number | null; fecha: string; devuelto: number | null; pagos: { importe: number }[]; leads: { nombre: string; apellido: string } | null; productos: { nombre: string } | null };
const NADIE = "00000000-0000-0000-0000-000000000000";

// Citas de esos closers (o solo las que agendó el caller, si mira un caller) y sus ventas, con lo que falta por cobrar.
// `conSinCloser` (3 nov, el jefe mirando a todos): también las que no tienen closer del equipo.
// N5 (13 nov): con `equipoActivo`, el jefe mirando a todos ve también las de closers de baja (desactivados o fuera del
// proyecto); `gente` = el equipo más ellos, con «(baja)» en el nombre. Las de perfiles de prueba siguen fuera.
export async function cargarCitasVentas(proyectoId: string, closerIds: string[], agendadasPor: string | null, conSinCloser = false, equipoActivo: Perfil[] = []) {
  const ids = closerIds.length ? closerIds : [NADIE];
  const conBaja = conSinCloser && equipoActivo.length > 0;
  const [citasTodas, ventasTodas] = await Promise.all([
    todas<CitaFila>((a, b) => {
      const base = db().from("citas").select("*, leads(id, nombre, apellido, telefono, pais, email, seguimiento)").eq("proyecto_id", proyectoId);
      const deBaja = conBaja ? `,closer_id.not.in.(${equipoActivo.map((g) => g.id).join(",")})` : "";
      const q = conSinCloser ? base.or(`closer_id.in.(${ids.join(",")}),closer_id.is.null${deBaja}`) : base.in("closer_id", ids);
      return (agendadasPor ? q.eq("agendada_por", agendadasPor) : q).order("fecha").order("id").range(a, b);
    }),
    todas<VentaFila>((a, b) => db().from("ventas").select("*, pagos(importe), leads(nombre, apellido), productos(nombre)").eq("proyecto_id", proyectoId).in("vendedor_id", ids).order("id").range(a, b)),
  ]);
  const gente = await conBajas(equipoActivo, conBaja ? citasTodas.map((c) => c.closer_id) : []);
  const bajas = new Set(gente.filter((g) => g.baja).map((g) => g.id));
  const delEquipo = new Set(ids);
  const citas = conBaja ? citasTodas.filter((c) => !c.closer_id || delEquipo.has(c.closer_id) || bajas.has(c.closer_id)) : citasTodas;
  // H5: al caller, solo las ventas de los leads que agendó
  const leadsSuyos = new Set(citas.map((c) => c.lead_id));
  const ventas = ventasTodas
    .filter((v) => !agendadasPor || leadsSuyos.has(v.lead_id))
    .map((v) => ({ ...v, pendiente: Math.max(0, Number(v.facturacion) - Number(v.cash_collected) - v.pagos.reduce((s, p) => s + Number(p.importe), 0)) }));
  return { citas, ventas, gente };
}

export const nombreDe = (l: { nombre: string; apellido: string } | null) => (l ? `${l.nombre} ${l.apellido}`.trim() || "Sin nombre" : "Lead");

// Columnas listas para el tablero, con sus tarjetas
export function columnasCloser(
  etapas: Etapa[],
  citas: CitaFila[],
  ventas: (VentaFila & { pendiente: number })[],
  ctx: { proyecto: Proyecto; jefe: boolean; nombrePersona: (id: string | null) => string; canales: TablaCanales }
) {
  const { proyecto, jefe, nombrePersona, canales } = ctx;
  const ahora = ahoraMs();
  const inicioMes = inicioDia(`${hoyEnZona(proyecto.zona_horaria).slice(0, 8)}01`, proyecto.zona_horaria).getTime(); // «Cerradas»: las de este mes
  const { porColumna, sinColumna } = repartirCloser(etapas, citas, ventas, ahora, inicioMes);
  const descripcion = (clave: string | null | undefined) => SUB_POSTCALL.find((s) => s.v === clave)?.d ?? (CLAVES_CLOSER.some((c) => c.v === clave) ? "Pre-call: llamadas por hacer" : undefined);
  const columnas: ColumnaC[] = etapas.map((e) => {
    const dentro = porColumna.get(e.id)!;
    return {
      id: e.id,
      clave: (e.columna_cita ?? null) as ColumnaC["clave"],
      t: e.nombre,
      d: descripcion(e.columna_cita),
      color: e.color,
      citas: [...dentro.citas]
        .sort((a, b) => (e.columna_cita && SUB_POSTCALL.some((s) => s.v === e.columna_cita) ? b.fecha.localeCompare(a.fecha) : a.fecha.localeCompare(b.fecha)))
        .map((c) => ({
          id: c.id,
          lead_id: c.lead_id,
          estado: c.estado,
          natural: claveNatural(c, ahora),
          nombre: nombreDe(c.leads),
          telefono: c.leads?.telefono ?? null,
          pais: c.leads?.pais ?? null,
          fechaTxt: fechaHora(c.fecha, proyecto),
          quien: c.origen === "ghl" ? origenCitaGhl(c, canales) : `Agendó ${nombrePersona(c.agendada_por)}`,
          nota: c.nota,
          closer: jefe ? quienLlevaba(c, nombrePersona) : null,
          pasada: new Date(c.fecha).getTime() < ahora,
          recuperar: porRecuperar(c),
        })),
      ventas: dentro.ventas.map((v) => ({
        id: v.id,
        lead_id: v.lead_id,
        nombre: nombreDe(v.leads),
        detalle: `${v.productos?.nombre ?? "Producto"} · vendida el ${soloFecha(v.fecha, proyecto)}${jefe ? ` · ${nombrePersona(v.vendedor_id)}` : ""}${v.num_cuotas ? ` · ${v.num_cuotas} cuotas` : ""}`,
        facturacionTxt: dinero(Number(v.facturacion), proyecto),
        faltaTxt: dinero(v.pendiente, proyecto),
        pendiente: v.pendiente,
        cobrado: Number(v.facturacion) - v.pendiente,
        devuelta: !!v.devuelto,
      })),
    };
  });
  return { columnas, sinColumna: sinColumna.citas.length + sinColumna.ventas.length };
}

// Las columnas de «Closers» de un proyecto (el pipeline del equipo)
export async function etapasCloser(proyectoId: string) {
  const { data: pipe } = await db().from("pipelines").select("id").eq("proyecto_id", proyectoId).eq("tipo", "closers").maybeSingle();
  if (!pipe) return { pipelineId: null, etapas: [] as Etapa[] };
  const { data } = await db().from("etapas").select("*").eq("pipeline_id", pipe.id).order("orden");
  return { pipelineId: pipe.id as string, etapas: (data ?? []) as Etapa[] };
}
