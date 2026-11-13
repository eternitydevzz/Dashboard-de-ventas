import "server-only";
import { getSesion } from "@/lib/sesion";
import { exigirSeccion, soloLoSuyo } from "@/lib/permisos";
import { cargarBase } from "@/lib/metricas";
import { calcularKpis } from "@/lib/kpis";
import { rangoNav, type PeriodoNav } from "@/lib/periodos";
import { db } from "@/lib/datos";
import { ErrorUsuario } from "@/lib/resultado";
import { asignarLeads } from "@/app/(panel)/crm/acciones";

// MCP, Fase 2 (11 nov 2026): las herramientas usan las mismas funciones y acciones que el dashboard, «como» la persona de
// la clave (lib/mcp/sesion-mcp.ts). Se ejecutan dentro de conSesionMcp; los permisos son los de la app.

type ArgsKpis = { periodo?: PeriodoNav; n?: number; desde?: string; hasta?: string };

// Igual que KPIs → «Por persona»: periodo por defecto «mes», zona del proyecto, y a un caller o closer solo lo suyo
export async function herramientaKpis(a: ArgsKpis) {
  const { perfil, proyecto } = await exigirSeccion("kpis");
  const rango = rangoNav(a.periodo ?? "mes", Math.trunc(a.n ?? 0), proyecto.zona_horaria, a.desde, a.hasta);
  const todos = calcularKpis(await cargarBase(proyecto), rango, proyecto.zona_horaria);
  const propio = soloLoSuyo(perfil, "kpis");
  const mio = <T extends { perfil: { id: string } }>(l: T[]) => (propio ? l.filter((x) => x.perfil.id === perfil.id) : l);
  const persona = <T extends { perfil: { id: string; nombre: string } }>({ perfil: p, ...cifras }: T) => ({ nombre: p.nombre, id: p.id, ...cifras });
  return {
    pantalla: "KPIs → Por persona",
    proyecto: proyecto.nombre,
    periodo: rango.etiqueta,
    callers: mio(todos.callers).map(persona),
    closers: mio(todos.closers).map(persona),
  };
}

type ArgsAsignar = { leadIds: string[]; caller?: string | null; closer?: string | null; confirmar?: boolean };

// Una persona del proyecto por su id o su nombre (sin distinguir mayúsculas). Con dos del mismo nombre, no elige.
async function personaDe(proyectoId: string, rol: "caller" | "closer", quien: string | null | undefined) {
  if (quien === undefined || quien === null) return quien;
  const { data, error } = await db().from("miembros_proyecto").select("perfil_id, perfiles!inner(nombre, rol)").eq("proyecto_id", proyectoId).eq("perfiles.rol", rol);
  if (error) throw new Error(`No se pudo leer el equipo: ${error.message}`);
  const gente = (data ?? []).map((m) => ({ id: m.perfil_id as string, nombre: (m.perfiles as unknown as { nombre: string }).nombre }));
  const q = quien.trim().toLowerCase();
  const encontrados = gente.filter((g) => g.id === quien.trim() || g.nombre.trim().toLowerCase() === q);
  if (encontrados.length === 1) return encontrados[0].id;
  if (encontrados.length > 1) throw new ErrorUsuario(`Hay ${encontrados.length} personas con ese nombre: ${encontrados.map((g) => `${g.nombre} (${g.id})`).join(", ")}. Di cuál.`);
  throw new ErrorUsuario(`No hay ningún ${rol} «${quien}» en este proyecto. Los que hay: ${gente.map((g) => g.nombre).join(", ") || "ninguno"}.`);
}

// Asignar, reasignar o desasignar (null) caller y closer. Llama a la acción del CRM tal cual (permisos e historial).
export async function herramientaAsignar(a: ArgsAsignar) {
  const { proyecto } = await getSesion();
  const ids = [...new Set((a.leadIds ?? []).filter(Boolean))];
  if (!ids.length) throw new ErrorUsuario("No hay leads.");
  if (a.caller === undefined && a.closer === undefined) throw new ErrorUsuario("Di el caller, el closer o los dos (null para quitarlo).");
  const [callerId, closerId] = [await personaDe(proyecto.id, "caller", a.caller), await personaDe(proyecto.id, "closer", a.closer)];
  // Solo leads de este proyecto (la acción ignora en silencio los de otro: aquí se avisa)
  const { count, error } = await db().from("leads").select("id", { count: "exact", head: true }).in("id", ids).eq("proyecto_id", proyecto.id);
  if (error) throw new Error(`No se pudieron leer los leads: ${error.message}`);
  if ((count ?? 0) !== ids.length) throw new ErrorUsuario(`${ids.length - (count ?? 0)} de esos leads no son de ${proyecto.nombre}. No se ha cambiado nada.`);
  // Fase 4 (Cristian, 11 nov): un cambio de varios leads enseña antes qué haría y solo se hace con confirmar
  if (ids.length > 1 && !a.confirmar) {
    const que = [a.caller !== undefined && `caller: ${a.caller ?? "ninguno"}`, a.closer !== undefined && `closer: ${a.closer ?? "ninguno"}`].filter(Boolean).join(" · ");
    return { vistaPrevia: true as const, haria: `Asignar ${ids.length} leads (${que}).`, paraHacerlo: "No se ha cambiado nada. Si está bien, vuelve a llamar igual con confirmar: true." };
  }
  const r = await asignarLeads(ids, callerId, closerId);
  if (r && "error" in r) throw new ErrorUsuario(r.error);
  return { asignados: ids.length };
}
