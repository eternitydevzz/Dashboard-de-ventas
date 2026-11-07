"use server";

import { revalidatePath } from "next/cache";
import { esJefe, exigir, getSesion } from "@/lib/auth";
import { db } from "@/lib/datos";
import { exigirSeccion } from "@/lib/permisos";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { guionValido, resumenMarcas, type Marcas, type RolGuion } from "@/lib/guiones";
import { cargarGuion, rolDelGuion } from "@/lib/guiones-datos";

// Fase 6 · Guion de llamadas: lo editan el CEO y los directores; lo usan callers y closers al llamar.
const ROLES: RolGuion[] = ["caller", "closer"];
const sinTabla = (m: string) => /guiones|guion_marcas|schema cache|does not exist/i.test(m);

export async function guardarGuion(rol: RolGuion, contenido: unknown) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigir(esJefe);
    if (!ROLES.includes(rol)) throw new ErrorUsuario("Guion no válido.");
    const g = guionValido(contenido);
    if (!g) throw new ErrorUsuario("El guion necesita al menos un paso con título.");
    const { error } = await db().from("guiones").upsert({ proyecto_id: proyecto.id, rol, contenido: g, actualizado_en: new Date().toISOString(), actualizado_por: perfil.id });
    if (error) throw new ErrorUsuario(sinTabla(error.message) ? "Falta aplicar la migración de la base (guiones)." : error.message);
    revalidatePath("/", "layout");
  });
}

// Vuelve al guion de ejemplo
export async function restaurarGuion(rol: RolGuion) {
  return seguro(async () => {
    const { proyecto } = await exigir(esJefe);
    if (!ROLES.includes(rol)) throw new ErrorUsuario("Guion no válido.");
    const { error } = await db().from("guiones").delete().eq("proyecto_id", proyecto.id).eq("rol", rol);
    if (error && !sinTabla(error.message)) throw new ErrorUsuario(error.message);
    revalidatePath("/", "layout");
  });
}

// Lo que marcó quien llama, al terminar (con su resultado). Si la base aún no tiene la tabla, no se guarda.
export async function guardarMarcasGuion(leadId: string, marcas: Marcas, resultado: string | null) {
  return seguro(async () => {
    // F22 (plan Callers, 7 nov): pide la sección, como el resto de acciones del lead (antes, solo que fuera suyo)
    await exigirSeccion("cola", "crm", "agendas", "clientes");
    const { perfil, proyecto } = await getSesion();
    const { data: lead } = await db().from("leads").select("id, caller_id, closer_id").eq("id", leadId).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!lead) throw new ErrorUsuario("Lead no encontrado.");
    if (!esJefe(perfil) && lead.caller_id !== perfil.id && lead.closer_id !== perfil.id) throw new ErrorUsuario("Este lead no está asignado a ti.");
    const rol = rolDelGuion(perfil.rol);
    const { guion } = await cargarGuion(proyecto.id, rol);
    // Solo índices válidos de pasos que existen
    const limpias: Marcas = {};
    for (const p of guion.pasos) {
      const v = (marcas?.[p.id] ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < p.checklist.length);
      if (v.length) limpias[p.id] = [...new Set(v)];
    }
    const { hechos, total } = resumenMarcas(guion, limpias);
    const { error } = await db().from("guion_marcas").insert({
      proyecto_id: proyecto.id,
      lead_id: leadId,
      perfil_id: perfil.id,
      rol,
      marcas: limpias,
      hechos,
      total,
      resultado: resultado ? String(resultado).slice(0, 40) : null,
    });
    if (error && !sinTabla(error.message)) throw new ErrorUsuario(error.message);
  });
}
