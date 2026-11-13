"use server";

import { revalidatePath } from "next/cache";
import { olvidarTodo } from "@/lib/memoria";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { db, escribir } from "@/lib/datos";
import { exigirSeccion } from "@/lib/permisos";
import type { ComisionPersona } from "@/lib/comisiones";
import type { Rol } from "@/lib/tipos";
import { leerNumero } from "@/lib/numero";
import { mercadoValido, type Mercado } from "@/lib/mercado";
import { exigirCambiarComisionPersona, exigirCambiarComisionRol, exigirPuedeDarRol } from "@/lib/auth";

// 25 oct 2026: también borra la memoria compartida (lib/memoria.ts), para que lo guardado se vea al momento
const refrescar = () => {
  olvidarTodo();
  revalidatePath("/", "layout");
};
const ROLES: Rol[] = ["ceo", "director", "closer", "caller"];

function pct(v: unknown, campo: string) {
  if (v === null || v === undefined || v === "") return null;
  const n = leerNumero(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new ErrorUsuario(`${campo}: pon un porcentaje entre 0 y 100.`);
  return Math.round(n * 100) / 100;
}

// Comisión propia de la persona (null = usa la de su rol)
async function comisionValida(proyectoId: string, c: ComisionPersona): Promise<ComisionPersona> {
  if (!c) return null;
  const por: Record<string, number> = {};
  const ids = Object.keys(c.por_producto ?? {});
  if (ids.length) {
    const { data } = await db().from("productos").select("id").eq("proyecto_id", proyectoId).in("id", ids);
    for (const id of ids) {
      if (!data?.some((p) => p.id === id)) continue; // un producto de otro proyecto se ignora
      const v = pct(c.por_producto![id], "Comisión por producto");
      if (v) por[id] = v;
    }
  }
  return { pct_venta: pct(c.pct_venta, "Comisión por venta"), pct_agenda: pct(c.pct_agenda, "Comisión por agenda"), por_producto: Object.keys(por).length ? por : null };
}

// Misma comisión aunque las claves vengan en otro orden
function mismaComision(a: ComisionPersona, b: ComisionPersona) {
  const ordenar = (x: unknown): unknown =>
    x && typeof x === "object" ? Object.fromEntries(Object.entries(x).sort(([k1], [k2]) => k1.localeCompare(k2)).map(([k, v]) => [k, ordenar(v)])) : x ?? null;
  return JSON.stringify(ordenar(a ?? null)) === JSON.stringify(ordenar(b ?? null));
}

async function deEsteProyecto(tabla: "areas" | "puestos" | "miembros_equipo", id: string | null, proyectoId: string) {
  if (!id) return;
  const { data } = await db().from(tabla).select("id").eq("id", id).eq("proyecto_id", proyectoId).maybeSingle();
  if (!data) throw new ErrorUsuario("Ese dato no es de este proyecto.");
}

export type AltaMiembro = {
  nombres: string[]; // uno o varios a la vez
  area_id: string | null;
  puesto_id: string | null;
  puesto_nuevo?: { nombre: string; rol_base: Rol | "otro" } | null;
  comision: ComisionPersona; // null = la de su rol
  acceso: { modo: "crear"; email: string; password: string; rol: Rol; mercado: Mercado; telefono: string } | { modo: "organigrama" };
  lider: boolean;
};

// 13 nov (Cristian): país y teléfono obligatorios al crear cuenta; sin mercado salía en Latam hasta que entraba
function paisYTelefono(mercadoTxt: unknown, telefonoTxt: string) {
  const mercado = mercadoValido(mercadoTxt);
  if (!mercado) throw new ErrorUsuario("Elige si es de España o de Latam.");
  const telefono = telefonoTxt.trim();
  if (!/^\+?[\d\s().-]{7,20}$/.test(telefono) || telefono.replace(/\D/g, "").length < 7) throw new ErrorUsuario("Pon un teléfono válido (con prefijo, ej. +34 600 000 000).");
  return { mercado, telefono };
}

// Alta de miembro en 6 pasos (persona, puesto, comisión, acceso, rol, revisión)
export async function crearMiembro(a: AltaMiembro) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("equipo");
    const nombres = a.nombres.map((n) => n.trim()).filter(Boolean);
    if (!nombres.length) throw new ErrorUsuario("Pon el nombre de la persona.");
    if (nombres.length > 50) throw new ErrorUsuario("Como mucho 50 personas a la vez.");
    await deEsteProyecto("areas", a.area_id, proyecto.id);
    await deEsteProyecto("puestos", a.puesto_id, proyecto.id);
    let puestoId = a.puesto_id;
    if (a.puesto_nuevo?.nombre.trim()) {
      const rolBase = [...ROLES, "otro"].includes(a.puesto_nuevo.rol_base) ? a.puesto_nuevo.rol_base : "otro";
      const { data, error } = await db().from("puestos").insert({ proyecto_id: proyecto.id, area_id: a.area_id, nombre: a.puesto_nuevo.nombre.trim(), rol_base: rolBase }).select("id").single();
      if (error) throw new ErrorUsuario(error.message);
      puestoId = data.id;
    }
    const comision = await comisionValida(proyecto.id, a.comision);
    if (comision) exigirCambiarComisionPersona(perfil, null);

    let perfilId: string | null = null;
    let email: string | null = null;
    if (a.acceso.modo === "crear") {
      if (nombres.length > 1) throw new ErrorUsuario("Para crear acceso, da de alta a las personas de una en una.");
      email = a.acceso.email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ErrorUsuario("Pon un email válido.");
      if (a.acceso.password.length < 8) throw new ErrorUsuario("La contraseña temporal necesita al menos 8 caracteres.");
      if (!ROLES.includes(a.acceso.rol)) throw new ErrorUsuario("Rol no válido.");
      if (a.acceso.rol === "ceo" && perfil.rol !== "ceo") throw new ErrorUsuario("Solo el CEO puede crear otro CEO.");
      exigirPuedeDarRol(perfil, a.acceso.rol);
      const { mercado, telefono } = paisYTelefono(a.acceso.mercado, a.acceso.telefono);
      const { data, error } = await db().auth.admin.createUser({ email, password: a.acceso.password, email_confirm: true });
      if (error) throw new ErrorUsuario(error.message.includes("already") ? "Ya existe un usuario con ese email." : error.message);
      const { error: e2 } = await db().from("perfiles").insert({ id: data.user.id, nombre: nombres[0], email, rol: a.acceso.rol, telefono });
      if (e2) {
        await db().auth.admin.deleteUser(data.user.id);
        throw new ErrorUsuario(e2.message);
      }
      const { count } = await db().from("miembros_proyecto").select("perfil_id", { count: "exact", head: true }).eq("proyecto_id", proyecto.id);
      await escribir(db().from("miembros_proyecto").insert({ proyecto_id: proyecto.id, perfil_id: data.user.id, orden: count ?? 0, mercado }), "miembros_proyecto");
      perfilId = data.user.id;
    }
    const { error } = await db().from("miembros_equipo").insert(nombres.map((nombre) => ({ proyecto_id: proyecto.id, perfil_id: perfilId, nombre, email, area_id: a.area_id, puesto_id: puestoId, comision, lider: a.lider })));
    if (error) throw new ErrorUsuario(error.message);
    refrescar();
    return { creados: nombres.length };
  });
}

export async function actualizarMiembroEquipo(id: string, c: { nombre: string; area_id: string | null; puesto_id: string | null; lider: boolean; activo: boolean; comision: ComisionPersona }) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("equipo");
    const { data: m } = await db().from("miembros_equipo").select("perfil_id, comision").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!m) throw new ErrorUsuario("Ese dato no es de este proyecto.");
    await deEsteProyecto("areas", c.area_id, proyecto.id);
    await deEsteProyecto("puestos", c.puesto_id, proyecto.id);
    if (!c.nombre.trim()) throw new ErrorUsuario("Pon el nombre.");
    const comision = await comisionValida(proyecto.id, c.comision);
    if (!mismaComision(comision, m.comision as ComisionPersona)) exigirCambiarComisionPersona(perfil, m.perfil_id);
    await escribir(db().from("miembros_equipo").update({ nombre: c.nombre.trim(), area_id: c.area_id, puesto_id: c.puesto_id, lider: c.lider, activo: c.activo, comision }).eq("id", id), "miembros_equipo");
    refrescar();
  });
}

// Bloque 4 de 1.0: el interruptor de cada persona, «mandan los tramos» o «manda su % propio» (solo callers y closers)
export async function cambiarModoComision(id: string, modo: "tramos" | "propio") {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("equipo");
    if (modo !== "tramos" && modo !== "propio") throw new ErrorUsuario("Elige tramos o % propio.");
    const { data: m } = await db().from("miembros_equipo").select("perfil_id, perfiles(rol)").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!m) throw new ErrorUsuario("Ese dato no es de este proyecto.");
    const rol = (m.perfiles as unknown as { rol: Rol } | null)?.rol;
    if (rol !== "caller" && rol !== "closer") throw new ErrorUsuario("Los tramos son para callers y closers.");
    exigirCambiarComisionPersona(perfil, m.perfil_id);
    await escribir(db().from("miembros_equipo").update({ comision_modo: modo }).eq("id", id), "miembros_equipo");
    refrescar();
  });
}

// A quien estaba «solo en el organigrama», darle acceso más tarde
export async function darAccesoMiembro(id: string, emailTxt: string, password: string, rol: Rol, mercadoTxt: string, telefonoTxt: string) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("equipo");
    const { data: m } = await db().from("miembros_equipo").select("*").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!m) throw new ErrorUsuario("Persona no encontrada.");
    if (m.perfil_id) throw new ErrorUsuario("Esta persona ya tiene acceso.");
    const email = emailTxt.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ErrorUsuario("Pon un email válido.");
    if (password.length < 8) throw new ErrorUsuario("La contraseña temporal necesita al menos 8 caracteres.");
    if (!ROLES.includes(rol) || (rol === "ceo" && perfil.rol !== "ceo")) throw new ErrorUsuario("Rol no válido.");
    exigirPuedeDarRol(perfil, rol);
    const { mercado, telefono } = paisYTelefono(mercadoTxt, telefonoTxt);
    const { data, error } = await db().auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new ErrorUsuario(error.message.includes("already") ? "Ya existe un usuario con ese email." : error.message);
    const { error: e2 } = await db().from("perfiles").insert({ id: data.user.id, nombre: m.nombre, email, rol, telefono });
    if (e2) {
      await db().auth.admin.deleteUser(data.user.id);
      throw new ErrorUsuario(e2.message);
    }
    const { count } = await db().from("miembros_proyecto").select("perfil_id", { count: "exact", head: true }).eq("proyecto_id", proyecto.id);
    await escribir(db().from("miembros_proyecto").insert({ proyecto_id: proyecto.id, perfil_id: data.user.id, orden: count ?? 0, mercado }), "miembros_proyecto");
    await escribir(db().from("miembros_equipo").update({ perfil_id: data.user.id, email }).eq("id", id), "miembros_equipo");
    refrescar();
  });
}

// ---------- Áreas, puestos y comisión de cada rol ----------
export async function guardarArea(id: string | null, nombre: string, color: string) {
  return seguro(async () => {
    const { proyecto } = await exigirSeccion("equipo");
    if (!nombre.trim()) throw new ErrorUsuario("Pon un nombre.");
    const c = /^#[0-9a-f]{6}$/i.test(color) ? color : "#64748b";
    if (id) {
      await deEsteProyecto("areas", id, proyecto.id);
      await escribir(db().from("areas").update({ nombre: nombre.trim(), color: c }).eq("id", id), "areas");
    } else {
      const { count } = await db().from("areas").select("id", { count: "exact", head: true }).eq("proyecto_id", proyecto.id);
      await escribir(db().from("areas").insert({ proyecto_id: proyecto.id, nombre: nombre.trim(), color: c, orden: count ?? 0 }), "areas");
    }
    refrescar();
  });
}

export async function borrarArea(id: string) {
  return seguro(async () => {
    const { proyecto } = await exigirSeccion("equipo");
    await deEsteProyecto("areas", id, proyecto.id);
    const { count } = await db().from("miembros_equipo").select("id", { count: "exact", head: true }).eq("area_id", id).eq("activo", true);
    if (count) throw new ErrorUsuario("Esta área tiene personas: muévelas a otra antes de borrarla.");
    await escribir(db().from("areas").delete().eq("id", id), "areas");
    refrescar();
  });
}

export async function guardarComisionRol(rol: Rol, pctVenta: string, pctAgenda: string) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("equipo");
    if (!ROLES.includes(rol)) throw new ErrorUsuario("Rol no válido.");
    exigirCambiarComisionRol(perfil, rol);
    const venta = pct(pctVenta, "Comisión por venta") ?? 0;
    const agenda = rol === "caller" ? pct(pctAgenda, "Comisión por agenda") ?? 0 : 0;
    await escribir(db().from("comisiones_rol").upsert({ proyecto_id: proyecto.id, rol, pct_venta: venta, pct_agenda: agenda }), "comisiones_rol");
    refrescar();
  });
}
