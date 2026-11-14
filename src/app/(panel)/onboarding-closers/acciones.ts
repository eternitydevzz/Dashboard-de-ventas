"use server";

import { revalidatePath } from "next/cache";
import { exigirSeccion } from "@/lib/permisos";
import { esJefe } from "@/lib/auth";
import { db, escribir } from "@/lib/datos";
import { ErrorUsuario, seguro } from "@/lib/resultado";

// Onboarding de los closers (bloque 7 de 1.0): cada closer marca los de sus clientes; el CEO y los directores, todos.
const refrescar = () => revalidatePath("/", "layout");

export async function marcarPasoCloser(leadId: string, pasoId: string, hecho: boolean) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("agendas");
    const { data: paso } = await db().from("pasos_onboarding_closer").select("id").eq("id", pasoId).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!paso) throw new ErrorUsuario("Ese paso no existe.");
    // Tiene que ser un cliente de un closer; si no eres jefe, uno tuyo
    let q = db().from("ventas").select("id").eq("proyecto_id", proyecto.id).eq("lead_id", leadId);
    if (!esJefe(perfil)) q = q.eq("vendedor_id", perfil.id);
    const { data: venta } = await q.limit(1).maybeSingle();
    if (!venta) throw new ErrorUsuario(esJefe(perfil) ? "Esta persona no ha comprado." : "Este cliente no es tuyo.");
    const { data: f } = await db().from("clientes").select("onboarding_closer").eq("proyecto_id", proyecto.id).eq("lead_id", leadId).maybeSingle();
    const hechos = { ...((f?.onboarding_closer as Record<string, string>) ?? {}) };
    if (hecho) hechos[pasoId] = new Date().toISOString();
    else delete hechos[pasoId];
    const { error } = await db().from("clientes").upsert({ proyecto_id: proyecto.id, lead_id: leadId, onboarding_closer: hechos, actualizado_en: new Date().toISOString() });
    if (error) throw new Error(error.message); // Cristian, 14 nov: el detalle de la base va al registro (seguro), el usuario ve el mensaje genérico
    refrescar();
  });
}

// Los puntos de la checklist: los cambian el CEO y los directores (Cristian, 11 oct 2026)
async function jefe() {
  const sesion = await exigirSeccion("agendas");
  if (!esJefe(sesion.perfil)) throw new ErrorUsuario("Los puntos del onboarding los cambian el CEO o un director.");
  return sesion;
}

export async function guardarPasoCloser(id: string | null, nombre: string) {
  return seguro(async () => {
    const { proyecto } = await jefe();
    const n = nombre.trim();
    if (!n || n.length > 80) throw new ErrorUsuario("Pon un nombre al punto (máximo 80 letras).");
    if (id) {
      const { error } = await db().from("pasos_onboarding_closer").update({ nombre: n }).eq("id", id).eq("proyecto_id", proyecto.id);
      if (error) throw error.code === "23505" ? new ErrorUsuario("Ya hay un punto con ese nombre.") : new Error(error.message);
    } else {
      const { count } = await db().from("pasos_onboarding_closer").select("id", { count: "exact", head: true }).eq("proyecto_id", proyecto.id);
      const { error } = await db().from("pasos_onboarding_closer").insert({ proyecto_id: proyecto.id, nombre: n, orden: count ?? 0 });
      if (error) throw error.code === "23505" ? new ErrorUsuario("Ya hay un punto con ese nombre.") : new Error(error.message);
    }
    refrescar();
  });
}

export async function borrarPasoCloser(id: string) {
  return seguro(async () => {
    const { proyecto } = await jefe();
    await escribir(db().from("pasos_onboarding_closer").delete().eq("id", id).eq("proyecto_id", proyecto.id), "pasos_onboarding_closer");
    refrescar();
  });
}
