"use server";

import { exigirSeccion } from "@/lib/permisos";
import { revalidatePath } from "next/cache";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { db, escribir } from "@/lib/datos";
import { cifrar, descifrar } from "@/lib/cifrado";
import { getSesion, esJefe } from "@/lib/auth";
import { esCloser, type Rol } from "@/lib/tipos";
import { sincronizarFathom } from "@/lib/fathom-sync";
import { reunionesFathom } from "@/lib/fathom";
import { after } from "next/server";
import { encolarAnalisis, hayClaveIa, procesarPendientes } from "@/lib/ia";

// El análisis con IA va después de responder, para no hacer esperar a la pantalla
const analizarDespues = (proyectoId: string) => {
  if (hayClaveIa()) after(() => procesarPendientes(proyectoId).then(() => undefined));
};

const refrescar = () => revalidatePath("/", "layout");

async function sesionAgendas() {
  const s = await getSesion();
  if (!esJefe(s.perfil) && s.perfil.rol !== "closer") throw new ErrorUsuario("No tienes permiso para esto.");
  return s;
}

// Cuenta de Fathom de un closer: nombre, API key (solo se escribe) y formato de título
export async function guardarCuentaFathom(id: string | null, c: { nombre: string; apiKey: string; formato: string; perfilId: string }) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { perfil, proyecto } = await sesionAgendas();
    const dueno = esJefe(perfil) ? c.perfilId : perfil.id; // un closer solo añade la suya
    const { data: m } = await db().from("miembros_proyecto").select("perfil_id, perfiles!inner(rol, tambien_closer)").eq("proyecto_id", proyecto.id).eq("perfil_id", dueno).maybeSingle();
    if (!m || !esCloser(m.perfiles as unknown as { rol: Rol; tambien_closer: boolean })) throw new ErrorUsuario("Elige el closer de esta cuenta.");
    if (!c.nombre.trim()) throw new ErrorUsuario("Pon un nombre a la cuenta.");
    const key = c.apiKey.trim();
    if (key && (key.length < 10 || /\s/.test(key))) throw new ErrorUsuario("La API key no parece válida.");
    const formato = c.formato.trim() || null;
    if (formato && !/\{\s*nombre(\s+cliente)?\s*\}/i.test(formato)) throw new ErrorUsuario("El formato de título tiene que llevar {nombre cliente}.");
    if (id) {
      const { data: ya } = await db().from("cuentas_fathom").select("perfil_id").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle();
      if (!ya || (!esJefe(perfil) && ya.perfil_id !== perfil.id)) throw new ErrorUsuario("Esa cuenta no es tuya.");
      await escribir(db().from("cuentas_fathom").update({ nombre: c.nombre.trim(), formato_titulo: formato, perfil_id: dueno, ...(key ? { api_key: cifrar(key) } : {}) }).eq("id", id), "cuentas_fathom");
    } else {
      if (!key) throw new ErrorUsuario("Pega la API key de Fathom.");
      await escribir(db().from("cuentas_fathom").insert({ proyecto_id: proyecto.id, perfil_id: dueno, nombre: c.nombre.trim(), api_key: cifrar(key), formato_titulo: formato }), "cuentas_fathom");
    }
    refrescar();
  });
}

export async function borrarCuentaFathom(id: string) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { perfil, proyecto } = await sesionAgendas();
    const { data: ya } = await db().from("cuentas_fathom").select("perfil_id").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!ya || (!esJefe(perfil) && ya.perfil_id !== perfil.id)) throw new ErrorUsuario("Esa cuenta no es tuya.");
    await escribir(db().from("cuentas_fathom").delete().eq("id", id), "cuentas_fathom"); // las grabaciones ya traídas se quedan
    refrescar();
  });
}

// Prueba la clave antes de guardarla (pide una página de reuniones de los últimos 7 días)
export async function probarFathom(id: string) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { perfil, proyecto } = await sesionAgendas();
    const { data: c } = await db().from("cuentas_fathom").select("perfil_id, api_key").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!c || (!esJefe(perfil) && c.perfil_id !== perfil.id)) throw new ErrorUsuario("Esa cuenta no es tuya.");
    try {
      const r = await reunionesFathom({ apiKey: descifrar(c.api_key, "la API key de Fathom"), desde: new Date(Date.now() - 7 * 86_400_000), maxPaginas: 1 });
      return { mensaje: `Conectado. ${r.length} grabaciones en los últimos 7 días.` };
    } catch (e) {
      throw new ErrorUsuario(e instanceof Error ? e.message : "No se pudo conectar con Fathom.");
    }
  });
}

export async function sincronizarFathomAhora() {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { perfil, proyecto } = await sesionAgendas();
    const res = await sincronizarFathom(proyecto.id, esJefe(perfil) ? {} : { perfilIds: [perfil.id] });
    analizarDespues(proyecto.id);
    refrescar();
    if (!res.length) throw new ErrorUsuario("No hay ninguna cuenta de Fathom. Añádela en «Cuentas».");
    return { resumen: res.map((r) => (r.error ? `${r.cuenta}: ${r.error}` : `${r.cuenta}: ${r.nuevas} nuevas, ${r.conciliadas} conciliadas`)).join(" · ") };
  });
}

async function grabacionPermitida(id: string) {
  const s = await sesionAgendas();
  const { data: g } = await db().from("grabaciones").select("id, closer_id").eq("id", id).eq("proyecto_id", s.proyecto.id).maybeSingle();
  if (!g || (!esJefe(s.perfil) && g.closer_id !== s.perfil.id)) throw new ErrorUsuario("Esa grabación no es tuya.");
  return { ...s, g };
}

export async function conciliarGrabacionManual(id: string, citaId: string) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    const { proyecto, g } = await grabacionPermitida(id);
    const { data: cita } = await db().from("citas").select("id, closer_id").eq("id", citaId).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!cita) throw new ErrorUsuario("Esa cita no existe.");
    if (g.closer_id && cita.closer_id !== g.closer_id) throw new ErrorUsuario("La cita es de otro closer.");
    const { data: otra } = await db().from("grabaciones").select("id").eq("cita_id", citaId).neq("id", id).maybeSingle();
    if (otra) throw new ErrorUsuario("Esa cita ya tiene otra grabación.");
    await escribir(db().from("grabaciones").update({ cita_id: citaId, conciliacion: "manual", motivo: "A mano" }).eq("id", id), "grabaciones");
    await encolarAnalisis(proyecto.id, id);
    analizarDespues(proyecto.id);
    refrescar();
  });
}

export async function desunirGrabacion(id: string, descartar = false) {
  return seguro(async () => {
    await exigirSeccion("agendas"); // H5
    await grabacionPermitida(id);
    await escribir(db().from("grabaciones").update({ cita_id: null, conciliacion: descartar ? "descartada" : "pendiente", motivo: descartar ? "Descartada (no es una llamada de venta)" : "Desunida a mano" }).eq("id", id), "grabaciones");
    refrescar();
  });
}
