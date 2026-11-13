import "server-only";
import { db, todas, equipo, conBajas, idsDePrueba, deVerdad } from "@/lib/datos";
import { esJefe } from "@/lib/auth";
import { enMemoria, UN_MINUTO } from "@/lib/memoria";
import type { CitaM, LeadM, PagoM, VentaM } from "@/lib/metricas-agendas";
import { esCloser, type Perfil, type Proyecto } from "@/lib/tipos";

// Todo lo que necesitan las métricas de Agendas, de una vez.
// `conPrueba`: un closer de prueba que mira lo suyo (sin él, lo de los perfiles de prueba no cuenta; 1.0)
// D43: compartido 1 minuto (lib/memoria.ts). Solo depende del proyecto y de `conPrueba`; lo de cada persona se filtra después.
export function cargarAgendas(proyecto: Proyecto, conPrueba = false) {
  return enMemoria(`agendas:${proyecto.id}:${conPrueba}`, UN_MINUTO, () => cargarDeLaBase(proyecto.id, conPrueba));
}

async function cargarDeLaBase(pid: string, conPrueba: boolean) {
  const [citasT, ventasT, pagosT, leads, pipelines, productos, gente, prueba] = await Promise.all([
    todas<CitaM>((a, b) => db().from("citas").select("id, lead_id, closer_id, agendada_por, fecha, estado, estrellas_caller, estrellas_closer, canal").eq("proyecto_id", pid).order("id").range(a, b)),
    todas<VentaM>((a, b) => db().from("ventas").select("id, lead_id, vendedor_id, producto_id, facturacion, cash_collected, fecha, devuelto, devuelto_en").eq("proyecto_id", pid).order("id").range(a, b)),
    todas<PagoM>((a, b) => db().from("pagos").select("venta_id, importe, fecha, ventas!inner(proyecto_id)").eq("ventas.proyecto_id", pid).order("id").range(a, b)),
    todas<LeadM>((a, b) => db().from("leads").select("id, pipeline_id, evento, seguimiento").eq("proyecto_id", pid).order("id").range(a, b)),
    db().from("pipelines").select("id, nombre").eq("proyecto_id", pid).eq("tipo", "normal").order("orden"),
    db().from("productos").select("id, nombre").eq("proyecto_id", pid).order("orden"),
    equipo(pid, conPrueba),
    conPrueba ? Promise.resolve(new Set<string>()) : idsDePrueba(),
  ]);
  // Con memoria, un fallo no puede quedarse 1 minuto como «sin pipelines» o «sin productos»
  if (pipelines.error) throw new Error(`No se pudieron leer los pipelines: ${pipelines.error.message}`);
  if (productos.error) throw new Error(`No se pudieron leer los productos: ${productos.error.message}`);
  const ok = deVerdad(prueba);
  const citas = citasT.filter((c) => ok(c.closer_id) && ok(c.agendada_por));
  const ventas = ventasT.filter((v) => ok(v.vendedor_id));
  const quedan = new Set(ventas.map((v) => v.id));
  const pagos = pagosT.filter((p) => quedan.has(p.venta_id));
  // Arreglo 11: los closers que ya no están siguen contando en los periodos en que trabajaron
  const genteHistorica = await conBajas(gente, [...citas.flatMap((c) => [c.closer_id, c.agendada_por]), ...ventas.map((v) => v.vendedor_id)]);
  const eventos = [...new Set(leads.map((l) => l.evento).filter((e): e is string => !!e))].sort();
  return { citas, ventas, pagos, leads, pipelines: pipelines.data ?? [], productos: productos.data ?? [], gente: genteHistorica, eventos };
}

// Qué closers puede ver esta persona: el closer solo a sí mismo; los jefes, a todos o al elegido.
export function closersVisibles(perfil: Perfil, gente: Perfil[], elegido: string | null) {
  const closers = gente.filter(esCloser);
  // H5: un caller con «Agendas» ve las citas que agendó él, con cualquier closer (las filtra quien carga los datos)
  if (perfil.rol === "caller") return { closers, ids: closers.map((c) => c.id), todos: closers };
  if (!esJefe(perfil)) return { closers: closers.filter((c) => c.id === perfil.id), ids: [perfil.id], todos: closers };
  const ids = elegido && closers.some((c) => c.id === elegido) ? [elegido] : closers.map((c) => c.id);
  return { closers: closers.filter((c) => ids.includes(c.id)), ids, todos: closers };
}
