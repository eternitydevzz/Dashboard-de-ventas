"use server";

import { revalidatePath } from "next/cache";
import { exigirSeccion } from "@/lib/permisos";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { esJefe } from "@/lib/auth";
import { db, equipo, todas } from "@/lib/datos";
import { SIN_PAIS } from "@/lib/formato";
import { planReparto, resumenPlan, SIN_TRABAJAR, type ModoReparto } from "@/lib/reparto";

// Bloque A (Cristian, 11 oct 2026): «Repartir leads» a mano, desde la Biblioteca y desde el CRM (CEO y directores).
// Qué leads: los sin asignar (con filtros) o reasignar los de unos callers. Entre qué callers. Cómo (lib/reparto).
// «seleccion» (Cristian, 28 oct): los leads marcados en el CRM (`leadIds`), tengan o no caller (se les cambia)
export type PeticionReparto = {
  origen: "sin_asignar" | "reasignar" | "seleccion";
  deCallers?: string[]; // al reasignar: de quién se quitan
  pipelineId?: string | null;
  etapaId?: string | null;
  evento?: string | null;
  oferta?: string | null; // «vip», «grupal»… (la de la Biblioteca)
  soloBiblioteca?: boolean; // desde la Biblioteca: solo sus leads (los que tienen oferta)
  paises?: string[]; // 1b: solo los de estos países (código o «Sin país»); vacío = todos
  leadIds?: string[]; // si vienen, solo esos (y que cumplan lo demás)
  callers: string[];
  modo: ModoReparto;
  n?: number;
  porPersona?: number;
  tope?: number;
};

async function preparar(p: PeticionReparto) {
  const { perfil, proyecto } = await exigirSeccion("crm", "kpis");
  if (!esJefe(perfil)) throw new ErrorUsuario("Solo el CEO y los directores reparten leads.");
  // Solo callers de verdad de este proyecto (sin perfiles de prueba)
  const gente = await equipo(proyecto.id);
  const callersOk = gente.filter((g) => g.rol === "caller").map((g) => g.id);
  const callers = [...new Set(p.callers)].filter((c) => callersOk.includes(c));
  if (!callers.length) throw new ErrorUsuario("Elige al menos un caller.");
  if (p.origen === "reasignar" && !p.deCallers?.length) throw new ErrorUsuario("Elige de quién se quitan los leads.");
  const seleccion = p.origen === "seleccion";
  if (seleccion && !p.leadIds?.length) throw new ErrorUsuario("Selecciona leads en el CRM.");

  // Los leads que se pueden repartir, de los más nuevos a los más antiguos (como la cola del caller)
  type Fila = { id: string; caller_id: string | null; pais: string | null };
  const pool = seleccion
    ? await porIds(proyecto.id, p.leadIds!, p.oferta ?? null)
    : await todas<Fila>((a, b) => {
        let q = db().from("leads").select("id, caller_id, pais").eq("proyecto_id", proyecto.id);
        q = p.origen === "sin_asignar" ? q.is("caller_id", null) : q.in("caller_id", p.deCallers!);
        if (p.pipelineId) q = q.eq("pipeline_id", p.pipelineId);
        if (p.etapaId) q = q.eq("etapa_id", p.etapaId);
        if (p.evento) q = q.eq("evento", p.evento);
        if (p.oferta) q = q.eq("oferta", p.oferta);
        else if (p.soloBiblioteca) q = q.not("oferta", "is", null);
        return q.order("creado_en", { ascending: false }).order("id").range(a, b);
      });
  const permitidos = p.leadIds?.length ? new Set(p.leadIds) : null;
  // Con selección entran todos los marcados, también los que ya son de uno de estos callers
  const candidatos = pool.filter((l) => !permitidos || permitidos.has(l.id)).filter((l) => seleccion || !callers.includes(l.caller_id ?? ""));
  // 1b (Cristian, 26 oct): cuántos hay de cada país con los demás filtros (para elegir), y solo los países elegidos.
  // Sin calcular (null) cuenta como «Sin país», igual que en pantalla.
  const porPais: Record<string, number> = {};
  for (const l of candidatos) porPais[l.pais ?? SIN_PAIS] = (porPais[l.pais ?? SIN_PAIS] ?? 0) + 1;
  const paises = p.paises?.length ? new Set(p.paises) : null;
  const elegidos = candidatos.filter((l) => !paises || paises.has(l.pais ?? SIN_PAIS));
  const leads = elegidos.map((l) => l.id);
  const conCaller = elegidos.filter((l) => l.caller_id).length; // con selección: a cuántos se les cambia el caller

  // Carga de cada caller (para el tope): sus leads sin trabajar
  const carga: Record<string, number> = {};
  if (p.modo === "tope") {
    await Promise.all(
      callers.map(async (c) => {
        const { count } = await db().from("leads").select("id", { count: "exact", head: true }).eq("proyecto_id", proyecto.id).eq("caller_id", c).in("estado_caller", SIN_TRABAJAR);
        carga[c] = count ?? 0;
      })
    );
  }
  const plan = planReparto(leads, callers, { modo: p.modo, n: p.n, porPersona: p.porPersona, tope: p.tope }, carga);
  return { perfil, proyecto, gente, callers, leads, plan, carga, porPais, conCaller };
}

// Los leads marcados, por trozos de 200 (el filtro `in` va en la dirección), de los más nuevos a los más antiguos
async function porIds(proyectoId: string, ids: string[], oferta: string | null) {
  const filas: { id: string; caller_id: string | null; pais: string | null; creado_en: string }[] = [];
  const unicos = [...new Set(ids)];
  for (let i = 0; i < unicos.length; i += 200) {
    let q = db().from("leads").select("id, caller_id, pais, creado_en").eq("proyecto_id", proyectoId).in("id", unicos.slice(i, i + 200));
    if (oferta) q = q.eq("oferta", oferta);
    const { data, error } = await q;
    if (error) throw new Error(`No se pudieron leer los leads: ${error.message}`);
    filas.push(...(data ?? []));
  }
  return filas.sort((a, b) => b.creado_en.localeCompare(a.creado_en) || a.id.localeCompare(b.id));
}

// Vista previa: «Carla 20 · Diego 20…» sin cambiar nada
export async function previsualizarReparto(p: PeticionReparto) {
  return seguro(async () => {
    const { gente, callers, leads, plan, carga, porPais, conCaller } = await preparar(p);
    const n = resumenPlan(plan, callers);
    return {
      porPais,
      conCaller,
      disponibles: leads.length,
      total: plan.size,
      porCaller: callers.map((c) => ({ id: c, nombre: gente.find((g) => g.id === c)?.nombre ?? "—", n: n[c] ?? 0, carga: carga[c] ?? null })),
    };
  });
}

export async function repartirLeads(p: PeticionReparto) {
  return seguro(async () => {
    const { perfil, proyecto, gente, plan } = await preparar(p);
    if (!plan.size) throw new ErrorUsuario("No hay leads que repartir con esos filtros.");
    const porCaller = new Map<string, string[]>();
    for (const [lead, caller] of plan) porCaller.set(caller, [...(porCaller.get(caller) ?? []), lead]);
    const nombre = (id: string) => gente.find((g) => g.id === id)?.nombre ?? "—";
    const modo = { equitativo: "equitativo", aleatorio: "aleatorio", fijo: "fijo por persona", tope: "con tope" }[p.modo];
    for (const [caller, ids] of porCaller) {
      for (let i = 0; i < ids.length; i += 200) {
        const trozo = ids.slice(i, i + 200);
        const { error } = await db().from("leads").update({ caller_id: caller }).in("id", trozo).eq("proyecto_id", proyecto.id);
        if (error) throw new Error(`No se pudo repartir: ${error.message}`);
        // Cada reparto queda en el historial del lead
        await db().from("actividades").insert(trozo.map((id) => ({ proyecto_id: proyecto.id, lead_id: id, perfil_id: perfil.id, tipo: "asignacion", nota: `Caller: ${nombre(caller)} · reparto ${modo}${p.origen === "reasignar" ? " (reasignado)" : p.origen === "seleccion" ? " (selección)" : ""}` })));
      }
    }
    revalidatePath("/", "layout");
    return { repartidos: plan.size };
  });
}
