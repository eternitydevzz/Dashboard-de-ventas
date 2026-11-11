"use server";

import { exigirSeccion } from "@/lib/permisos";
import { revalidatePath } from "next/cache";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { db, escribir, todas } from "@/lib/datos";
import { esJefe, exigir } from "@/lib/auth";
import { leerNumero } from "@/lib/numero";
import { CIFRAS, PERIODOS, type Cifra, type PeriodoObjetivo, type RolObjetivo } from "@/lib/objetivos-constantes";

const refrescar = () => revalidatePath("/", "layout");
const ROLES: RolObjetivo[] = ["caller", "closer", "director"];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Objetivos y lanzamientos: los ponen el CEO o el director (decisión de Cristian, 10 oct 2026)
export async function guardarObjetivo(o: { para: string; periodo: string; lanzamientoId: string | null; cifra: string; valor: string; dias: number[] }) {
  return seguro(async () => {
    await exigirSeccion("kpis"); // H5
    const { perfil, proyecto } = await exigir(esJefe);
    const periodo = o.periodo as PeriodoObjetivo;
    if (!PERIODOS.some((p) => p.v === periodo)) throw new ErrorUsuario("Elige el periodo.");
    const cifra = CIFRAS.find((c) => c.v === o.cifra);
    if (!cifra) throw new ErrorUsuario("Elige la cifra.");

    // Para quién: «rol:caller» o «persona:<id>» (la persona tiene que ser del proyecto)
    let rol: RolObjetivo | null = null;
    let perfilId: string | null = null;
    if (o.para.startsWith("rol:")) {
      rol = o.para.slice(4) as RolObjetivo;
      if (!ROLES.includes(rol)) throw new ErrorUsuario("Elige para quién es el objetivo.");
    } else if (o.para.startsWith("persona:")) {
      const { data } = await db()
        .from("miembros_proyecto")
        .select("perfil_id, perfiles!inner(rol)")
        .eq("proyecto_id", proyecto.id)
        .eq("perfil_id", o.para.slice(8))
        .maybeSingle();
      const r = (data as unknown as { perfiles: { rol: string } } | null)?.perfiles.rol;
      if (!data || !ROLES.includes(r as RolObjetivo)) throw new ErrorUsuario("Esa persona no es caller, closer ni director de este proyecto.");
      perfilId = o.para.slice(8);
      rol = r as RolObjetivo;
    } else throw new ErrorUsuario("Elige para quién es el objetivo.");
    if (!cifra.roles.includes(rol)) throw new ErrorUsuario(`«${cifra.t}» no es una cifra de ese rol.`);

    let lanzamientoId: string | null = null;
    if (periodo === "lanzamiento") {
      const { data } = await db().from("lanzamientos").select("id").eq("id", o.lanzamientoId ?? "").eq("proyecto_id", proyecto.id).maybeSingle();
      if (!data) throw new ErrorUsuario("Elige el lanzamiento.");
      lanzamientoId = data.id;
    }
    const valor = leerNumero(o.valor);
    if (!(valor > 0) || valor > 1e9) throw new ErrorUsuario("El objetivo tiene que ser mayor que 0.");
    const dias = [...new Set(o.dias)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort();
    if (periodo === "dia" && dias.length === 0) throw new ErrorUsuario("Marca al menos un día.");

    await escribir(
      db().from("objetivos").insert({
        proyecto_id: proyecto.id,
        rol: perfilId ? null : rol,
        perfil_id: perfilId,
        periodo,
        lanzamiento_id: lanzamientoId,
        cifra: cifra.v as Cifra,
        valor: Math.round(valor * 100) / 100,
        dias: periodo === "dia" ? dias : [1, 2, 3, 4, 5],
        creado_por: perfil.id,
      }),
      "objetivos"
    );
    refrescar();
  });
}

// Quitar = una fila nueva sin valor: el histórico guarda el que había
export async function quitarObjetivo(id: string) {
  return seguro(async () => {
    await exigirSeccion("kpis"); // H5
    const { perfil, proyecto } = await exigir(esJefe);
    const { data: o } = await db().from("objetivos").select("rol, perfil_id, periodo, lanzamiento_id, cifra").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!o) throw new ErrorUsuario("Ese objetivo no es de este proyecto.");
    await escribir(db().from("objetivos").insert({ ...o, proyecto_id: proyecto.id, valor: null, creado_por: perfil.id }), "objetivos");
    refrescar();
  });
}

export async function crearLanzamiento(l: { nombre: string; inicio: string; fin: string; evento: string }) {
  return seguro(async () => {
    await exigirSeccion("kpis"); // H5
    const { proyecto } = await exigir(esJefe);
    const nombre = l.nombre.trim();
    if (!nombre || nombre.length > 120) throw new ErrorUsuario("Pon el nombre del lanzamiento (máximo 120 caracteres).");
    if (!FECHA.test(l.inicio) || !FECHA.test(l.fin)) throw new ErrorUsuario("Pon la fecha de inicio y la de fin.");
    if (l.fin < l.inicio) throw new ErrorUsuario("La fecha de fin no puede ser anterior a la de inicio.");
    await escribir(db().from("lanzamientos").insert({ proyecto_id: proyecto.id, nombre, inicio: l.inicio, fin: l.fin, evento: l.evento.trim() || null }), "lanzamientos");
    refrescar();
  });
}

export async function borrarLanzamiento(id: string) {
  return seguro(async () => {
    await exigirSeccion("kpis"); // H5
    const { proyecto } = await exigir(esJefe);
    const { data } = await db().from("lanzamientos").select("id").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!data) throw new ErrorUsuario("Ese lanzamiento no es de este proyecto.");
    // Sus objetivos se borran con él (en cascada)
    await escribir(db().from("lanzamientos").delete().eq("id", id), "lanzamientos");
    refrescar();
  });
}

// 1c (Cristian, 26 oct 2026): la pestaña «Leads» pide aquí todos los leads, compactos, justo después de pintar la
// página (así la precarga del menú no los lee). Solo director y CEO, como la Biblioteca.
export async function cargarLeadsPestana() {
  return seguro(async () => {
    await exigirSeccion("kpis");
    const { proyecto } = await exigir(esJefe);
    const { cargarLeadsKpis } = await import("@/lib/leads-kpis");
    return cargarLeadsKpis(proyecto);
  });
}

// B1 (plan GHL): la pestaña «UTMs» pide aquí los leads con su seguimiento (CAMPOS_LEAD no lo trae). Solo director y CEO.
// Landing: la ruta de page_url; si no hay, la Entrada del último envío del lead.
export async function cargarUtmsPestana() {
  return seguro(async () => {
    await exigirSeccion("kpis");
    const { proyecto } = await exigir(esJefe);
    const { filaUtm } = await import("@/lib/utms");
    const { cargarLeadsKpis } = await import("@/lib/leads-kpis");
    const { descompactarLeads } = await import("@/lib/leads-vista");
    const pid = proyecto.id;
    // Rediseño (11 nov 2026): las marcas del embudo de cada lead, de la misma carga que KPIs → Leads (1 min en memoria)
    const [leads, { data: entradas, error }, kpis] = await Promise.all([
      todas<{ id: string; nombre: string | null; apellido: string | null; creado_en: string; etiquetas: string[] | null; seguimiento: Record<string, string> | null }>((a, b) =>
        db().from("leads").select("id, nombre, apellido, creado_en, etiquetas, seguimiento").eq("proyecto_id", pid).order("id").range(a, b)
      ),
      db().from("entradas").select("id, nombre").eq("proyecto_id", pid),
      cargarLeadsKpis(proyecto),
    ]);
    const marcasDe = new Map(descompactarLeads(kpis).leads.map((l) => [l.id, l.marcas]));
    if (error) throw new Error(error.message);
    const nombreEntrada = new Map((entradas ?? []).map((e) => [e.id as string, e.nombre as string]));
    // Del envío más reciente al más antiguo: el primero que sale de cada lead es su Entrada
    const entradaDe = new Map<string, string>();
    if (nombreEntrada.size) {
      const envios = await todas<{ lead_id: string; entrada_id: string }>((a, b) =>
        db().from("webhook_eventos").select("lead_id, entrada_id").in("entrada_id", [...nombreEntrada.keys()]).not("lead_id", "is", null).order("recibido_en", { ascending: false }).order("id").range(a, b)
      );
      for (const e of envios) if (!entradaDe.has(e.lead_id)) entradaDe.set(e.lead_id, nombreEntrada.get(e.entrada_id) ?? "");
    }
    return leads.map((l) => filaUtm(l, entradaDe.get(l.id), marcasDe.get(l.id) ?? 0));
  });
}
