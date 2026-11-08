"use server";

import { revalidatePath } from "next/cache";
import { olvidarTodo } from "@/lib/memoria";
import { exigir, puedeAdmin } from "@/lib/auth";
import { db, escribir } from "@/lib/datos";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { cargarDatosPermisos } from "@/lib/permisos-datos";
import { calcularNivel, filasPermisoPipeline, nivelDefecto, type Nivel } from "@/lib/pipelines";
import { horarioValido } from "@/lib/horarios";
import { ajustesValidos } from "@/lib/disponibilidad";
import type { Perfil, TipoPipeline } from "@/lib/tipos";

// Ficha completa de cada persona (bloque 5 de 1.0, Cristian 11 oct 2026). Lo que va más allá de «datos y comisión»
// (acceso, permisos, horario, integraciones) es solo para el CEO y los directores con Administración.
// 25 oct 2026: también borra la memoria compartida (lib/memoria.ts), para que lo guardado se vea al momento
const refrescar = () => {
  olvidarTodo();
  revalidatePath("/", "layout");
};

async function personaDelProyecto(perfilId: string) {
  const sesion = await exigir(puedeAdmin);
  const { data: m } = await db().from("miembros_proyecto").select("*").eq("proyecto_id", sesion.proyecto.id).eq("perfil_id", perfilId).maybeSingle();
  if (!m) throw new ErrorUsuario("Esa persona no está en este proyecto.");
  const { data: p } = await db().from("perfiles").select("*").eq("id", perfilId).single<Perfil>();
  if (!p) throw new ErrorUsuario("Persona no encontrada.");
  if (sesion.perfil.rol !== "ceo" && p.rol === "ceo") throw new ErrorUsuario("Solo el CEO puede tocar a otro CEO.");
  return { ...sesion, miembro: m, persona: p };
}

export async function cargarFicha(perfilId: string) {
  return seguro(async () => {
    const { perfil, proyecto, miembro, persona } = await personaDelProyecto(perfilId);
    const [permisos, { data: pipes }, { data: fathom }] = await Promise.all([
      cargarDatosPermisos(perfil, proyecto.id),
      db().from("pipelines").select("id, nombre, tipo").eq("proyecto_id", proyecto.id).order("orden"),
      db().from("cuentas_fathom").select("id, nombre").eq("proyecto_id", proyecto.id).eq("perfil_id", perfilId).order("nombre"),
    ]);
    const filas = await filasPermisoPipeline((pipes ?? []).map((p) => p.id));
    const general = ajustesValidos(proyecto.calendario);
    return {
      soyCeo: perfil.rol === "ceo",
      soyYo: perfil.id === perfilId,
      zona: proyecto.zona_horaria,
      persona: { id: persona.id, nombre: persona.nombre, email: persona.email, telefono: persona.telefono ?? "", whatsapp: persona.whatsapp ?? "", rol: persona.rol, activo: persona.activo, admin_activo: persona.admin_activo, es_prueba: !!persona.es_prueba, tambien_closer: !!persona.tambien_closer, onboarding_completo: persona.onboarding_completo },
      horario: horarioValido(miembro.horario),
      calendario: { general, propios: miembro.calendario ? ajustesValidos(miembro.calendario, general) : null },
      reparto: { auto: proyecto.reparto_auto, pct: Number(miembro.reparto_pct ?? 0) },
      ghl: { userId: (miembro.ghl_user_id as string | null) ?? "", calendarId: (miembro.ghl_calendar_id as string | null) ?? "" },
      fathom: (fathom ?? []) as { id: string; nombre: string }[],
      permisos,
      pipelines: (pipes ?? []).map((p) => {
        const propio = filas.find((f) => f.pipeline_id === p.id && f.perfil_id === perfilId)?.nivel ?? null;
        const delRol = filas.find((f) => f.pipeline_id === p.id && f.rol === persona.rol)?.nivel ?? nivelDefecto(p.tipo as TipoPipeline, persona.rol);
        return { id: p.id as string, nombre: p.nombre as string, propio, delRol, efectivo: calcularNivel(persona, { id: p.id, tipo: p.tipo as TipoPipeline }, filas) as Nivel };
      }),
    };
  });
}

// Teléfono y WhatsApp de otra persona (los suyos, cada uno en «Mi perfil»)
export async function guardarContactoPersona(perfilId: string, c: { telefono: string; whatsapp: string }) {
  return seguro(async () => {
    await personaDelProyecto(perfilId);
    if (c.telefono.length > 40 || c.whatsapp.length > 40) throw new ErrorUsuario("Algún dato es demasiado largo.");
    await escribir(db().from("perfiles").update({ telefono: c.telefono.trim() || null, whatsapp: c.whatsapp.trim() || null }).eq("id", perfilId), "perfiles");
    refrescar();
  });
}

// Cambiar el email de acceso: lo hace el administrador directamente, sin pedir confirmación (criterio apuntado en el plan)
export async function cambiarEmailPersona(perfilId: string, emailTxt: string) {
  return seguro(async () => {
    const { proyecto } = await personaDelProyecto(perfilId);
    const email = emailTxt.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ErrorUsuario("Pon un email válido.");
    const { data: otro } = await db().from("perfiles").select("id").eq("email", email).neq("id", perfilId).maybeSingle();
    if (otro) throw new ErrorUsuario("Ya hay otra persona con ese email.");
    const { error } = await db().auth.admin.updateUserById(perfilId, { email, email_confirm: true });
    if (error) throw new ErrorUsuario(error.message.includes("already") ? "Ya hay otra persona con ese email." : error.message);
    await escribir(db().from("perfiles").update({ email }).eq("id", perfilId), "perfiles");
    await escribir(db().from("miembros_equipo").update({ email }).eq("perfil_id", perfilId).eq("proyecto_id", proyecto.id), "miembros_equipo");
    refrescar();
  });
}

// La marca «perfil de prueba»: solo el CEO (Cristian, 11 oct 2026). Saca a la persona de cifras, reparto y comisiones.
export async function marcarPrueba(perfilId: string, prueba: boolean) {
  return seguro(async () => {
    const { perfil } = await personaDelProyecto(perfilId);
    if (perfil.rol !== "ceo") throw new ErrorUsuario("Solo el CEO marca o desmarca un perfil de prueba.");
    if (perfilId === perfil.id) throw new ErrorUsuario("No puedes marcarte a ti mismo como perfil de prueba.");
    await escribir(db().from("perfiles").update({ es_prueba: prueba }).eq("id", perfilId), "perfiles");
    refrescar();
  });
}

// Plan GHL E2: el interruptor «También closer» (solo un caller; lo cambia quien ya edita fichas, comprobado en personaDelProyecto)
export async function guardarTambienCloser(perfilId: string, valor: boolean) {
  return seguro(async () => {
    const { persona } = await personaDelProyecto(perfilId);
    if (persona.rol !== "caller") throw new ErrorUsuario("«También closer» es solo para callers.");
    await escribir(db().from("perfiles").update({ tambien_closer: valor === true }).eq("id", perfilId), "perfiles");
    refrescar();
  });
}
