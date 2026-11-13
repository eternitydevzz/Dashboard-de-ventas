"use server";

import { validarRotacion } from "@/lib/rotacion";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { revalidatePath } from "next/cache";
import { olvidarTodo } from "@/lib/memoria";
import { exigir, exigirCambiarComisionRol, puedeAdmin, puedeCrearProyectos } from "@/lib/auth";
import { tramosDe, tramosValidos } from "@/lib/comisiones";
import { preguntasValidas } from "@/lib/reportes";
import { db, equipo, escribir } from "@/lib/datos";
import { cifrar, descifrar } from "@/lib/cifrado";
import { reglasValidas } from "@/lib/entrada";
import { datosLandingValidos, type DatosLanding } from "@/lib/entradas-panel";
import { dentroDelLimite } from "@/lib/limite";
import { enviarEmail, urlApp } from "@/lib/email";
import { EMAIL_AVISO_GHL } from "@/lib/ghl-envios";
import { enviosDeEntrada, VER_MAS } from "@/lib/entradas-datos";
import { workflowDeEntrada, type EntradaParaWorkflow } from "@/lib/workflows";
import { mismoContenido, pasosValidos } from "@/lib/workflows-editar";
import { SECCIONES_TODAS, NUNCA, ROLES_PERMISO, seccionesPermitidas } from "@/lib/permisos";
import type { RolPermiso } from "@/lib/permisos-constantes";
import { ajustesValidos, type AjustesCalendario } from "@/lib/disponibilidad";
import { esCloser, type Rol } from "@/lib/tipos";
import { mandarEnlace } from "@/lib/acceso";
import { reordenar } from "@/lib/orden-entradas";
import { tablaValida } from "@/lib/canal";
import { canalesDe } from "@/lib/canales-datos";
import { PIPELINE_ETIQUETA } from "@/lib/ghl-leads";
import { borrarEtiquetaGhl, renombrarEtiquetaGhl } from "@/lib/ghl";

const ROLES: Rol[] = ["ceo", "director", "closer", "caller"];
type Res = { ok?: string; error?: string } | null;
// 25 oct 2026: también borra la memoria compartida (lib/memoria.ts), para que lo guardado se vea al momento
const refrescar = () => {
  olvidarTodo();
  revalidatePath("/", "layout");
};
const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// ---------- Equipo ----------
export async function crearUsuario(_prev: Res, fd: FormData): Promise<Res> {
  // Arreglo 30: mismo envoltorio que el resto (lo inesperado no enseña detalles internos)
  return seguro(async () => {
    const { perfil, proyecto } = await exigir(puedeAdmin);
    const email = texto(fd, "email").toLowerCase();
    const nombre = texto(fd, "nombre");
    const rol = texto(fd, "rol") as Rol;
    const password = String(fd.get("password") ?? "");
    if (!nombre || !email) return { error: "Nombre y email son obligatorios." };
    if (!ROLES.includes(rol)) return { error: "Rol no válido." };
    if (rol === "ceo" && perfil.rol !== "ceo") return { error: "Solo el CEO puede crear otro CEO." };
    if (password.length < 8) return { error: "La contraseña temporal necesita al menos 8 caracteres." };

    const { data, error } = await db().auth.admin.createUser({ email, password, email_confirm: true });
    if (error) return { error: error.message.includes("already") ? "Ya existe un usuario con ese email." : error.message };
    const { error: e2 } = await db().from("perfiles").insert({ id: data.user.id, nombre, email, rol });
    if (e2) {
      await db().auth.admin.deleteUser(data.user.id);
      return { error: e2.message };
    }
    const { count } = await db().from("miembros_proyecto").select("perfil_id", { count: "exact", head: true }).eq("proyecto_id", proyecto.id);
    // C9: si no entra en el proyecto, se borra el usuario (y su perfil con él): sin cuentas huérfanas
    const { error: e3 } = await db().from("miembros_proyecto").insert({ proyecto_id: proyecto.id, perfil_id: data.user.id, orden: count ?? 0 });
    if (e3) {
      await db().auth.admin.deleteUser(data.user.id);
      throw new Error(`No se pudo guardar en «miembros_proyecto»: ${e3.message}`);
    }
    refrescar();
    return { ok: `Usuario creado. Pásale su email y la contraseña temporal; la primera vez verá el onboarding.` };
  });
}

export async function actualizarMiembro(perfilId: string, cambios: { rol?: Rol; activo?: boolean; admin_activo?: boolean }) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigir(puedeAdmin);
    const { data: miembro } = await db().from("miembros_proyecto").select("perfil_id").eq("proyecto_id", proyecto.id).eq("perfil_id", perfilId).maybeSingle();
    if (!miembro) throw new ErrorUsuario("Esa persona no está en este proyecto.");
    const { data: objetivo } = await db().from("perfiles").select("rol").eq("id", perfilId).single();
    if (perfilId === perfil.id) throw new ErrorUsuario("No puedes cambiar tu propio rol o acceso.");
    if (perfil.rol !== "ceo" && (objetivo?.rol === "ceo" || cambios.rol === "ceo")) throw new ErrorUsuario("Solo el CEO puede tocar a otro CEO.");
    if (cambios.admin_activo !== undefined && perfil.rol !== "ceo") throw new ErrorUsuario("Solo el CEO da acceso de administración a los directores.");
    // Arreglo 24 (decisión de Cristian): el perfil es uno para toda la app, así que cambiar el rol o
    // desactivar a alguien afecta a todos sus proyectos → solo el CEO. El director puede quitarlo de su proyecto.
    if ((cambios.rol !== undefined || cambios.activo !== undefined) && perfil.rol !== "ceo") throw new ErrorUsuario("Solo el CEO cambia el rol o desactiva a alguien (afecta a todos sus proyectos). Puedes quitarlo de este proyecto.");
    if (cambios.rol && !ROLES.includes(cambios.rol)) throw new ErrorUsuario("Rol no válido.");
    // 1.7 (9 nov): a la base solo van estos 3 campos (una acción del servidor puede recibir cualquier objeto)
    const permitidos = {
      ...(cambios.rol !== undefined ? { rol: cambios.rol } : {}),
      ...(typeof cambios.activo === "boolean" ? { activo: cambios.activo } : {}),
      ...(typeof cambios.admin_activo === "boolean" ? { admin_activo: cambios.admin_activo } : {}),
    };
    if (!Object.keys(permitidos).length) throw new ErrorUsuario("No hay nada que cambiar.");
    await escribir(db().from("perfiles").update(permitidos).eq("id", perfilId), "perfiles");
    refrescar();
  });
}

export async function cambiarPassword(perfilId: string, password: string) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigir(puedeAdmin);
    if (password.length < 8) throw new ErrorUsuario("Mínimo 8 caracteres.");
    const { data: miembro } = await db().from("miembros_proyecto").select("perfil_id").eq("proyecto_id", proyecto.id).eq("perfil_id", perfilId).maybeSingle();
    if (!miembro) throw new ErrorUsuario("Esa persona no está en este proyecto.");
    const { data: objetivo } = await db().from("perfiles").select("rol").eq("id", perfilId).single();
    if (perfil.rol !== "ceo" && objetivo?.rol === "ceo") throw new ErrorUsuario("Solo el CEO puede tocar a otro CEO.");
    const { error } = await db().auth.admin.updateUserById(perfilId, { password });
    if (error) throw new ErrorUsuario(error.message);
  });
}

// Bloque 6 (Cristian, 11 oct 2026): un administrador manda a alguien del proyecto un enlace para entrar sin
// contraseña. La app genera el enlace (Supabase) y lo envía ella misma con Resend; dura 24 h (ajuste de Supabase, 12 oct).
export async function enviarEnlaceMagico(perfilId: string) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigir(puedeAdmin);
    const { data: miembro } = await db().from("miembros_proyecto").select("perfil_id").eq("proyecto_id", proyecto.id).eq("perfil_id", perfilId).maybeSingle();
    if (!miembro) throw new ErrorUsuario("Esa persona no está en este proyecto.");
    const { data: objetivo } = await db().from("perfiles").select("nombre, email, rol, activo").eq("id", perfilId).single();
    if (!objetivo?.activo) throw new ErrorUsuario("Esa persona está desactivada.");
    if (perfil.rol !== "ceo" && objetivo.rol === "ceo") throw new ErrorUsuario("Solo el CEO puede tocar a otro CEO.");
    const r = await mandarEnlace(objetivo, "ficha", proyecto.nombre);
    if (!r.enviado) throw new ErrorUsuario(`No se pudo enviar el email (${r.motivo}).`);
  });
}

// Fase 1 (Cristian, 12 oct 2026): mandar el acceso por email a varias personas del proyecto a la vez. Cada una
// recibe un enlace para entrar (24 h, un solo uso) y crea su contraseña al entrar. Solo administradores; a un CEO
// solo lo puede elegir otro CEO. Se manda uno a uno y se dice a quién llegó y a quién no.
export async function enviarAccesos(perfilIds: string[]) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigir(puedeAdmin);
    const ids = [...new Set(perfilIds)].filter((x) => typeof x === "string" && x);
    if (!ids.length) throw new ErrorUsuario("Elige al menos una persona.");
    if (ids.length > 60) throw new ErrorUsuario("Como mucho 60 personas a la vez.");
    const { data: miembros } = await db().from("miembros_proyecto").select("perfil_id").eq("proyecto_id", proyecto.id).in("perfil_id", ids);
    const delProyecto = new Set((miembros ?? []).map((m) => m.perfil_id as string));
    const { data: personas } = await db().from("perfiles").select("id, nombre, email, rol, activo").in("id", ids);
    const enviados: string[] = [];
    const fallos: { nombre: string; motivo: string }[] = [];
    for (const p of personas ?? []) {
      if (!delProyecto.has(p.id)) fallos.push({ nombre: p.nombre, motivo: "no está en este proyecto" });
      else if (!p.activo) fallos.push({ nombre: p.nombre, motivo: "está desactivado" });
      else if (p.rol === "ceo" && perfil.rol !== "ceo") fallos.push({ nombre: p.nombre, motivo: "solo el CEO puede mandárselo a otro CEO" });
      else {
        const r = await mandarEnlace(p, "bienvenida", proyecto.nombre);
        if (r.enviado) enviados.push(p.nombre);
        else fallos.push({ nombre: p.nombre, motivo: r.motivo });
      }
    }
    return { enviados, fallos };
  });
}

// ---------- Reparto automático con % (bloque 2 de 1.0, Cristian 11 oct 2026) ----------
// Encendido: los % de los callers tienen que sumar 100. Apagado: todo al 0 % o que sumen 100 (se guardan para luego).
// Al cambiar los %, la cuenta de cada caller vuelve a cero (el reparto empieza de nuevo con los % nuevos).
export async function guardarReparto(r: { auto: boolean; soloHorario: boolean; pcts: Record<string, number> }) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const callers = (await equipo(proyecto.id)).filter((p) => p.rol === "caller");
    const pcts = new Map<string, number>();
    for (const c of callers) {
      const v = Number(r.pcts[c.id] ?? 0);
      if (!Number.isFinite(v) || v < 0 || v > 100) throw new ErrorUsuario(`El % de ${c.nombre} tiene que ir de 0 a 100.`);
      pcts.set(c.id, Math.round(v * 100) / 100);
    }
    const suma = Math.round([...pcts.values()].reduce((a, b) => a + b, 0) * 100) / 100;
    if (r.auto && suma !== 100) throw new ErrorUsuario(`Los % suman ${suma}; para encender el reparto tienen que sumar 100.`);
    if (!r.auto && suma !== 0 && suma !== 100) throw new ErrorUsuario(`Los % suman ${suma}; tienen que sumar 100 (o estar todos a 0).`);
    const { data: antes } = await db().from("miembros_proyecto").select("perfil_id, reparto_pct").eq("proyecto_id", proyecto.id).in("perfil_id", callers.map((c) => c.id));
    const cambian = (antes ?? []).some((a) => Number(a.reparto_pct) !== pcts.get(a.perfil_id));
    for (const [id, v] of pcts) {
      await escribir(db().from("miembros_proyecto").update({ reparto_pct: v, ...(cambian ? { reparto_cuenta: 0 } : {}) }).eq("proyecto_id", proyecto.id).eq("perfil_id", id), "miembros_proyecto");
    }
    await escribir(db().from("proyectos").update({ reparto_auto: r.auto, reparto_solo_horario: r.soloHorario }).eq("id", proyecto.id), "proyectos");
    refrescar();
  });
}

// ---------- Tramos de comisión (bloque 4 de 1.0, Cristian 10 y 11 oct 2026) ----------
// Los de callers o los de closers, en la moneda del proyecto. Mismas reglas que las comisiones por rol: solo el CEO o
// un director (con Administración), y el director no los de su propio rol (aquí no aplica: son de callers y closers).
export async function guardarTramos(rol: "caller" | "closer", tramos: { desde: number; pct: number }[]) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigir(puedeAdmin);
    if (rol !== "caller" && rol !== "closer") throw new ErrorUsuario("Los tramos son para callers y closers.");
    exigirCambiarComisionRol(perfil, rol);
    const t = tramosValidos(tramos);
    if (!t) throw new ErrorUsuario("Revisa los tramos: el primero empieza en 0, cada uno en un importe distinto, y el % va de 0 a 100.");
    const actuales = tramosDe(proyecto.tramos_comision);
    await escribir(db().from("proyectos").update({ tramos_comision: { ...actuales, [rol]: t } }).eq("id", proyecto.id), "proyectos");
    refrescar();
  });
}

// ---------- Preguntas del reporte de fin de día (bloque 7 de 1.0, Cristian 10 y 11 oct 2026) ----------
// lista null = volver a las de siempre. Los reportes ya enviados se quedan con las suyas.
export async function guardarPreguntasReporte(rol: "caller" | "closer", lista: unknown[] | null) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    if (rol !== "caller" && rol !== "closer") throw new ErrorUsuario("Rol no válido.");
    const actuales = (proyecto.preguntas_reporte && typeof proyecto.preguntas_reporte === "object" ? proyecto.preguntas_reporte : {}) as Record<string, unknown>;
    let nuevas: Record<string, unknown>;
    if (lista === null) {
      nuevas = Object.fromEntries(Object.entries(actuales).filter(([k]) => k !== rol));
    } else {
      const r = preguntasValidas(rol, lista);
      if ("error" in r) throw new ErrorUsuario(r.error);
      nuevas = { ...actuales, [rol]: r.ok };
    }
    await escribir(db().from("proyectos").update({ preguntas_reporte: Object.keys(nuevas).length ? nuevas : null }).eq("id", proyecto.id), "proyectos");
    refrescar();
  });
}

// ---------- Proyecto ----------
// 4.4 (Cristian, 11 oct): el link del calendario de GHL que el caller manda al lead al pulsar «Link enviado»
// 13 nov: con «es», el del equipo de España (vacío = usa el de Latam)
export async function guardarLinkAgenda(link: string, mercado: "latam" | "es" = "latam") {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const limpio = link.trim();
    if (limpio) {
      let ok = false;
      try {
        ok = new URL(limpio).protocol === "https:";
      } catch {
        ok = false;
      }
      if (!ok) throw new ErrorUsuario("El link de agenda tiene que empezar por https://");
    }
    await escribir(db().from("proyectos").update({ [mercado === "es" ? "link_agenda_es" : "link_agenda"]: limpio || null }).eq("id", proyecto.id), "proyectos");
    refrescar();
  });
}

export async function guardarProyecto(_prev: Res, fd: FormData): Promise<Res> {
  // Arreglo 30: mismo envoltorio que el resto (lo inesperado no enseña detalles internos)
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const aviso = texto(fd, "aviso_webhook_url");
    if (aviso) {
      try {
        if (new URL(aviso).protocol !== "https:") return { error: "El webhook de avisos tiene que empezar por https://" };
      } catch {
        return { error: "El webhook de avisos no es un enlace válido." };
      }
    }
    await escribir(db().from("proyectos").update({ aviso_webhook_url: aviso || null }).eq("id", proyecto.id), "proyectos");
    refrescar();
    return { ok: "Guardado." };
  });
}

export async function crearProyecto(_prev: Res, fd: FormData): Promise<Res> {
  // Arreglo 30: mismo envoltorio que el resto (lo inesperado no enseña detalles internos)
  return seguro(async () => {
    const { perfil } = await exigir(puedeCrearProyectos);
    const nombre = texto(fd, "nombre");
    const region = texto(fd, "region");
    if (!nombre) return { error: "Pon un nombre." };
    const config = region === "es" ? { moneda: "EUR", zona_horaria: "Europe/Madrid" } : { moneda: "USD", zona_horaria: "America/New_York" };
    const color = /^#[0-9a-f]{6}$/i.test(texto(fd, "color")) ? texto(fd, "color") : "#2f55d4";
    const { data, error } = await db().from("proyectos").insert({ nombre, color, ...config }).select().single();
    if (error) return { error: error.code === "23505" ? "Ya existe un proyecto con ese nombre." : error.message };
    await escribir(db().from("miembros_proyecto").insert({ proyecto_id: data.id, perfil_id: perfil.id }), "miembros_proyecto");
    const { data: pipe } = await db().from("pipelines").insert({ proyecto_id: data.id, nombre: "Principal", orden: 0 }).select().single();
    if (pipe)
      await escribir(db().from("etapas").insert(
        ["Nuevos", "Agendados", "En seguimiento", "Cerrados", "Descartados"].map((n, i) => ({ pipeline_id: pipe.id, nombre: n, orden: i, color: ["#64748b", "#2f55d4", "#d97706", "#16a34a", "#dc2626"][i] }))
      ), "etapas");
    refrescar();
    return { ok: `Proyecto «${nombre}» creado (${config.moneda}, ${config.zona_horaria}). Cámbiate a él desde el selector de proyecto.` };
  });
}

export async function regenerarSecreto() {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const nuevo = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");
    await escribir(db().from("proyectos").update({ webhook_secreto: nuevo }).eq("id", proyecto.id), "proyectos");
    refrescar();
  });
}

// ---------- Personas en varios proyectos ----------
// Solo el CEO ve a la gente de todos los proyectos, así que solo él añade a alguien que ya existe.
export async function anadirAlProyecto(perfilId: string) {
  return seguro(async () => {
    const { proyecto } = await exigir((p) => p.rol === "ceo");
    const { data: persona } = await db().from("perfiles").select("id").eq("id", perfilId).maybeSingle();
    if (!persona) throw new ErrorUsuario("Esa persona no existe.");
    const { count } = await db().from("miembros_proyecto").select("perfil_id", { count: "exact", head: true }).eq("proyecto_id", proyecto.id);
    const { error } = await db().from("miembros_proyecto").insert({ proyecto_id: proyecto.id, perfil_id: perfilId, orden: count ?? 0 });
    if (error) throw new ErrorUsuario(error.code === "23505" ? "Ya está en este proyecto." : error.message);
    refrescar();
  });
}

// Quita a la persona de este proyecto (no borra su usuario ni sus datos).
export async function quitarDelProyecto(perfilId: string) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigir(puedeAdmin);
    if (perfilId === perfil.id) throw new ErrorUsuario("No puedes quitarte a ti mismo.");
    const { data: objetivo } = await db().from("perfiles").select("rol").eq("id", perfilId).maybeSingle();
    if (!objetivo) throw new ErrorUsuario("Esa persona no existe.");
    if (perfil.rol !== "ceo" && objetivo.rol === "ceo") throw new ErrorUsuario("Solo el CEO puede tocar a otro CEO.");
    await escribir(db().from("miembros_proyecto").delete().eq("proyecto_id", proyecto.id).eq("perfil_id", perfilId), "miembros_proyecto");
    // Arreglo 23 (decisión de Cristian): sus leads de este proyecto quedan sin asignar, para repartirlos
    const [{ data: comoCaller }, { data: comoCloser }] = await Promise.all([
      escribir(db().from("leads").update({ caller_id: null }).eq("proyecto_id", proyecto.id).eq("caller_id", perfilId).select("id"), "leads"),
      escribir(db().from("leads").update({ closer_id: null }).eq("proyecto_id", proyecto.id).eq("closer_id", perfilId).select("id"), "leads"),
    ]);
    refrescar();
    return { sinAsignar: new Set([...(comoCaller ?? []), ...(comoCloser ?? [])].map((l) => l.id)).size };
  });
}

// ---------- Entradas (una dirección por landing) ----------
// Comprueba que el pipeline y la columna son de este proyecto (y que la columna es de ese pipeline).
async function destinoValido(proyectoId: string, pipelineId: string | null, etapaId: string | null) {
  if (!pipelineId) return { pipeline_id: null, etapa_id: null };
  const { data: p } = await db().from("pipelines").select("id").eq("id", pipelineId).eq("proyecto_id", proyectoId).eq("tipo", "normal").maybeSingle();
  if (!p) throw new ErrorUsuario("Ese pipeline no es de este proyecto.");
  if (etapaId) {
    const { data: e } = await db().from("etapas").select("id").eq("id", etapaId).eq("pipeline_id", pipelineId).maybeSingle();
    if (!e) throw new ErrorUsuario("Esa columna no es de ese pipeline.");
  }
  return { pipeline_id: pipelineId, etapa_id: etapaId || null };
}

async function entradaDelProyecto(id: string, proyectoId: string) {
  const { data } = await db().from("entradas").select("id").eq("id", id).eq("proyecto_id", proyectoId).maybeSingle();
  if (!data) throw new ErrorUsuario("Entrada no encontrada.");
}

export async function crearEntrada(_prev: Res, fd: FormData): Promise<Res> {
  const r = await seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorUsuario("Pon un nombre (por ejemplo, el de la landing).");
    const destino = await destinoValido(proyecto.id, texto(fd, "pipeline_id") || null, texto(fd, "etapa_id") || null);
    // Panel de endpoints (7 nov): de qué landing y formulario es, y desde dónde envía
    const landing = datosLandingValidos({ landing: fd.get("landing"), formulario: fd.get("formulario"), envia_desde: fd.get("envia_desde") });
    const { data: ultima } = await db().from("entradas").select("orden").eq("proyecto_id", proyecto.id).order("orden", { ascending: false }).limit(1).maybeSingle();
    const { error } = await db().from("entradas").insert({ proyecto_id: proyecto.id, nombre, ...destino, ...landing, orden: ultima ? Number(ultima.orden) + 1 : 0 });
    if (error) throw new ErrorUsuario(error.message);
    refrescar();
    return { ok: "Entrada creada. Su dirección está en la lista: cópiala y pásasela al programador de la landing." };
  });
  return r;
}

// Comprueba nombre, destino y reglas y devuelve lo que se escribe (sin escribir nada)
type CambiosEntrada = { nombre: string; pipeline_id: string | null; etapa_id: string | null; reglas: unknown };
async function validarEntrada(proyectoId: string, cambios: CambiosEntrada) {
  if (!String(cambios.nombre ?? "").trim()) throw new ErrorUsuario("Pon un nombre.");
  const destino = await destinoValido(proyectoId, cambios.pipeline_id, cambios.etapa_id);
  const reglas = reglasValidas(cambios.reglas);
  for (const r of reglas) if (r.pipeline_id || r.etapa_id) await destinoValido(proyectoId, r.pipeline_id ?? null, r.etapa_id ?? null);
  return { nombre: String(cambios.nombre).trim(), ...destino, reglas };
}

export async function guardarEntrada(id: string, cambios: CambiosEntrada & { activa: boolean }) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    await entradaDelProyecto(id, proyecto.id);
    const fila = await validarEntrada(proyecto.id, cambios);
    await escribir(db().from("entradas").update({ ...fila, activa: cambios.activa }).eq("id", id), "entradas");
    refrescar();
  });
}

// Panel de endpoints (Cristian, 7 nov): UN solo «Guardar» por Entrada. Primero se comprueba todo (Entrada, datos de la
// landing y lo de GHL) y después se escribe en una sola actualización: o se guarda todo o no se guarda nada.
// `ghl` = null cuando el proyecto no tiene GHL conectado: lo de GHL no se toca.
export async function guardarEntradaCompleta(id: string, c: { entrada: CambiosEntrada & Partial<Record<keyof DatosLanding, unknown>>; ghl: CambiosGhlEntrada | null }) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    await entradaDelProyecto(id, proyecto.id);
    const fila = await validarEntrada(proyecto.id, c.entrada);
    const landing = datosLandingValidos(c.entrada);
    await exigirNoGhl(id, "guardar sus ajustes mandando a GHL", { desde: landing.envia_desde, enciende: c.ghl?.activo });
    if (c.ghl?.activo) await noLaMandaUnWorkflow(id);
    const ghl = c.ghl ? await validarGhl(proyecto.id, c.ghl) : {};
    await escribir(db().from("entradas").update({ ...fila, ...landing, ...ghl }).eq("id", id), "entradas");
    refrescar();
    return { ok: true as const };
  });
}

// «Apagar esta entrada» / «Encender»: solo cambia «activa» (apagada, la dirección responde 404)
export async function cambiarActivaEntrada(id: string, activa: boolean) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    await entradaDelProyecto(id, proyecto.id);
    await escribir(db().from("entradas").update({ activa: !!activa }).eq("id", id), "entradas");
    refrescar();
    return { ok: true as const };
  });
}

// «Ver más»: los 50 envíos siguientes de una Entrada (no refresca la página: solo lee)
export async function masEnviosEntrada(id: string, desde: number) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    await entradaDelProyecto(id, proyecto.id);
    const n = Math.max(0, Math.floor(Number(desde) || 0));
    return { ok: true as const, datos: await enviosDeEntrada(id, n, VER_MAS) };
  });
}

export async function nuevaDireccionEntrada(id: string) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    await entradaDelProyecto(id, proyecto.id);
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
    await escribir(db().from("entradas").update({ token }).eq("id", id), "entradas");
    refrescar();
  });
}

export async function borrarEntrada(id: string) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    await entradaDelProyecto(id, proyecto.id);
    // Los envíos ya recibidos y sus leads se quedan; solo se borra la dirección
    await escribir(db().from("entradas").delete().eq("id", id), "entradas");
    refrescar();
  });
}

// ---------- Entradas → GHL por la API (Plan GHL, fase 1, Cristian 6 nov 2026) ----------
// «Qué hacer en GHL»: interruptor, campos unidos, pipeline y columna de GHL, etiqueta base, espera y campo de «completo».
const idGhl = (x: unknown) => (typeof x === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(x.trim()) ? x.trim() : null);
// Plan GHL, B (Cristian, 7 nov): varias oportunidades (lista de pipelines; sin columna = la primera de GHL) y etiquetas fijas
export type OportunidadGhlEntrada = { pipeline_id: string; etapa_id: string | null };
export type CambiosGhlEntrada = {
  activo: boolean;
  campos: Record<string, string>;
  oportunidades: OportunidadGhlEntrada[];
  etiqueta_base: string;
  etiquetas_extra: string[];
  espera_seg: number;
  campo_completo: string;
};
const MAX_OPORTUNIDADES = 5;
const MAX_ETIQUETAS_EXTRA = 10;
export async function guardarGhlEntrada(id: string, c: CambiosGhlEntrada) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    await entradaDelProyecto(id, proyecto.id);
    if (c.activo) await exigirNoGhl(id, "encender «Mandar a GHL»", { enciende: true });
    if (c.activo) await noLaMandaUnWorkflow(id);
    await escribir(db().from("entradas").update(await validarGhl(proyecto.id, c)).eq("id", id), "entradas");
    refrescar();
  });
}

// Comprueba «Qué hacer en GHL» y devuelve lo que se escribe (sin escribir nada)
async function validarGhl(proyectoId: string, c: CambiosGhlEntrada) {
  {
    const campos: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.campos && typeof c.campos === "object" ? c.campos : {})) {
      const campo = String(k).trim().slice(0, 120);
      const ghl = idGhl(v);
      if (campo && ghl) campos[campo] = ghl;
    }
    const espera = Math.round(Number(c.espera_seg));
    if (!Number.isFinite(espera) || espera < 0 || espera > 3600) throw new ErrorUsuario("La espera va de 0 a 3600 segundos.");
    // Pipelines: los vacíos fuera, cada uno una vez (el primero manda), ids con forma de GHL
    const oportunidades: OportunidadGhlEntrada[] = [];
    for (const o of Array.isArray(c.oportunidades) ? c.oportunidades : []) {
      const bruto = typeof o?.pipeline_id === "string" ? o.pipeline_id.trim() : "";
      if (!bruto) continue;
      const pipeline = idGhl(bruto);
      if (!pipeline) throw new ErrorUsuario("Un pipeline de GHL no es válido.");
      const etapaBruta = typeof o.etapa_id === "string" ? o.etapa_id.trim() : "";
      const etapa = etapaBruta ? idGhl(etapaBruta) : null;
      if (etapaBruta && !etapa) throw new ErrorUsuario("Una columna de GHL no es válida.");
      if (!oportunidades.some((x) => x.pipeline_id === pipeline)) oportunidades.push({ pipeline_id: pipeline, etapa_id: etapa });
    }
    if (oportunidades.length > MAX_OPORTUNIDADES) throw new ErrorUsuario(`Como mucho ${MAX_OPORTUNIDADES} pipelines de GHL por Entrada.`);
    // Etiquetas fijas: en minúsculas (como las guarda GHL), sin comas ni repetidas
    const extra = [...new Set((Array.isArray(c.etiquetas_extra) ? c.etiquetas_extra : []).map((t) => String(t ?? "").trim().toLowerCase()).filter(Boolean))];
    if (extra.some((t) => t.length > 80 || t.includes(","))) throw new ErrorUsuario("Cada etiqueta fija, sin comas y de 80 letras como mucho.");
    if (extra.length > MAX_ETIQUETAS_EXTRA) throw new ErrorUsuario(`Como mucho ${MAX_ETIQUETAS_EXTRA} etiquetas fijas.`);
    const base = String(c.etiqueta_base ?? "").trim().slice(0, 80);
    if (c.activo && !Object.keys(campos).length && !base && !oportunidades.length && !extra.length) throw new ErrorUsuario("Para encender GHL, une al menos un campo, pon una etiqueta o elige un pipeline.");
    if (c.activo) {
      const { data: p } = await db().from("proyectos").select("ghl_token, ghl_location_id").eq("id", proyectoId).single();
      if (!p?.ghl_token || !p.ghl_location_id) throw new ErrorUsuario("Este proyecto no tiene GHL conectado (pestaña Integraciones GHL).");
    }
    return {
      ghl_activo: !!c.activo,
      ghl_campos: campos,
      ghl_oportunidades: oportunidades,
      // El primero también en las columnas de antes: si se vuelve al código anterior, sigue creando una oportunidad
      ghl_pipeline_id: oportunidades[0]?.pipeline_id ?? null,
      ghl_etapa_id: oportunidades[0]?.etapa_id ?? null,
      ghl_etiqueta_base: base || null,
      ghl_etiquetas_extra: extra,
      ghl_espera_seg: espera,
      ghl_campo_completo: String(c.campo_completo ?? "").trim().slice(0, 120),
    };
  }
}

// ---------- Workflows, 4a-1 (docs/plan-workflows.md, Cristian 7 nov 2026) ----------
// «Probar como workflow»: crea el workflow de la Entrada desde su «Qué hacer en GHL», en MODO PRUEBA (no llama a GHL:
// solo compara con lo de hoy). Uno encendido por Entrada.
export async function crearWorkflowDePrueba(entradaId: string) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const { data: en } = await db()
      .from("entradas")
      .select("id, nombre, ghl_campos, ghl_pipeline_id, ghl_etapa_id, ghl_oportunidades, ghl_etiqueta_base, ghl_etiquetas_extra, ghl_espera_seg, ghl_campo_completo")
      .eq("id", entradaId)
      .eq("proyecto_id", proyecto.id)
      .maybeSingle<EntradaParaWorkflow>();
    if (!en) throw new ErrorUsuario("Entrada no encontrada.");
    const { data: ya } = await db().from("workflows").select("id").eq("entrada_id", en.id).eq("encendido", true).limit(1);
    if (ya?.length) throw new ErrorUsuario("Esta Entrada ya tiene un workflow en marcha.");
    const w = workflowDeEntrada(en);
    await escribir(db().from("workflows").insert({ proyecto_id: proyecto.id, nombre: w.nombre.slice(0, 120), disparador: w.disparador, entrada_id: en.id, pasos: w.pasos, modo: "prueba" }), "workflows");
    refrescar();
    return { ok: true as const };
  });
}

// Fase 4d, B3 (plan GHL 2.4, Cristian 8 nov 2026): un workflow «cuando se agenda / se cancela una cita», sin Entrada.
// Nace en prueba, sin pasos (se ponen en el editor) y APAGADO: no crea ejecuciones vacías hasta que se encienda.
export async function crearWorkflowDeCita(evento: "agendada" | "cancelada") {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    if (evento !== "agendada" && evento !== "cancelada") throw new ErrorUsuario("Evento de cita no válido.");
    const nombre = evento === "agendada" ? "Cita agendada" : "Cita cancelada";
    await escribir(db().from("workflows").insert({ proyecto_id: proyecto.id, nombre, disparador: { tipo: "cita", evento }, entrada_id: null, pasos: [], modo: "prueba", encendido: false }), "workflows");
    refrescar();
    return { ok: true as const };
  });
}

// A3 (plan GHL, Cristian 8 nov 2026): «cuando se pone la etiqueta…», como los de cita: sin Entrada, en prueba y APAGADO
export async function crearWorkflowDeEtiqueta(etiqueta: string) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const e = typeof etiqueta === "string" ? etiqueta.trim() : "";
    if (!e || e.length > 80 || e.includes(",")) throw new ErrorUsuario("Escribe la etiqueta (sin comas y de 80 letras como mucho)."); // B3a: como las fijas
    await escribir(db().from("workflows").insert({ proyecto_id: proyecto.id, nombre: `Etiqueta «${e}»`, disparador: { tipo: "etiqueta", etiqueta: e }, entrada_id: null, pasos: [], modo: "prueba", encendido: false }), "workflows");
    refrescar();
    return { ok: true as const };
  });
}

// «Parar la prueba»: el workflow deja de recibir leads y lo que esperaba queda «parada»
export async function pararWorkflow(workflowId: string) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const { data: w } = await db().from("workflows").select("id").eq("id", workflowId).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!w) throw new ErrorUsuario("Workflow no encontrado.");
    await escribir(db().from("workflows").update({ encendido: false, actualizado_en: new Date().toISOString() }).eq("id", workflowId), "workflows");
    refrescar();
    return { ok: true as const };
  });
}

// Rediseño de Workflows (Cristian, 11 nov 2026): la «×» de cada workflow (pregunta 2 veces en pantalla). Sus ejecuciones
// caen con él (on delete cascade): las que esperaban se cancelan, decidido por Cristian. Uno en real con Entrada no:
// es el que manda sus leads a GHL («Qué hacer en GHL» está apagado) y la Entrada se quedaría sin mandar.
export async function borrarWorkflow(workflowId: string) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const w = await workflowConEntrada(workflowId, proyecto.id);
    if (w.entrada_id && w.modo === "real") throw new ErrorUsuario("Este workflow manda los leads de su Entrada a GHL. Pulsa primero «Volver a lo de hoy» y después bórralo.");
    await escribir(db().from("workflows").delete().eq("id", w.id).eq("proyecto_id", proyecto.id), "workflows");
    refrescar();
    return { ok: true as const };
  });
}

// ---------- Workflows, 4c: guardar desde el editor y encender (Cristian, 7 nov 2026) ----------
// Guardar: valida los pasos (pasosValidos) y, si cambian, sube la versión. Las ejecuciones en curso terminan con los
// pasos que guardaron al empezar (columna `pasos` de workflow_ejecuciones).
export async function guardarWorkflow(workflowId: string, pasos: unknown) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const { data: w } = await db().from("workflows").select("id, pasos, version, modo").eq("id", workflowId).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!w) throw new ErrorUsuario("Workflow no encontrado.");
    const limpios = pasosValidos(pasos);
    if (mismoContenido(limpios, w.pasos)) return { ok: true as const, version: w.version as number };
    const version = (w.version as number) + 1;
    await escribir(db().from("workflows").update({ pasos: limpios, version, actualizado_en: new Date().toISOString() }).eq("id", w.id), "workflows");
    refrescar();
    return { ok: true as const, version };
  });
}

// Encender un workflow parado (en prueba). No, si su Entrada ya tiene otro en marcha.
export async function encenderWorkflow(workflowId: string) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const w = await workflowConEntrada(workflowId, proyecto.id);
    if (w.entrada_id) {
      const { data: otros } = await db().from("workflows").select("id").eq("entrada_id", w.entrada_id).eq("encendido", true).neq("id", w.id).limit(1);
      if (otros?.length) throw new ErrorUsuario("Su Entrada ya tiene otro workflow en marcha: para ese primero.");
    }
    await escribir(db().from("workflows").update({ encendido: true, actualizado_en: new Date().toISOString() }).eq("id", w.id), "workflows");
    refrescar();
    return { ok: true as const };
  });
}

// ---------- Workflows, 4a-2: pasar a real y volver a lo de hoy (Cristian, 7 nov 2026) ----------
// Nunca deben mandar los dos ni ninguno. Al pasar a real: primero el workflow a «real» y después se apaga «Mandar a GHL»
// de la Entrada (si eso falla, el workflow vuelve a «prueba»). Un momento con los dos encendidos solo repetiría llamadas
// que no duplican nada en GHL (el contacto se actualiza, las etiquetas no se repiten y la oportunidad se busca antes).
// Lo que esperaba para GHL por el camino de hoy pasa a mandarlo su ejecución del workflow.
// Fase 4d, B3: también los de cita (entrada_id null): no tienen «Qué hacer en GHL» que apagar ni a la que volver.
async function workflowConEntrada(workflowId: string, proyectoId: string) {
  const { data: w } = await db().from("workflows").select("id, entrada_id, modo, encendido").eq("id", workflowId).eq("proyecto_id", proyectoId).maybeSingle();
  if (!w) throw new ErrorUsuario("Workflow no encontrado.");
  return w as { id: string; entrada_id: string | null; modo: string; encendido: boolean };
}

export async function pasarWorkflowAReal(workflowId: string) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const w = await workflowConEntrada(workflowId, proyecto.id);
    if (!w.encendido || w.modo !== "prueba") throw new ErrorUsuario("Solo se puede pasar a real un workflow en prueba y en marcha.");
    if (w.entrada_id) await exigirNoGhl(w.entrada_id, "pasar su workflow a real", { enciende: true });
    const { data: p } = await db().from("proyectos").select("ghl_token, ghl_location_id").eq("id", proyecto.id).single();
    if (!p?.ghl_token || !p.ghl_location_id) throw new ErrorUsuario("Este proyecto no tiene GHL conectado (pestaña Integraciones GHL).");
    const ahora = new Date().toISOString();
    await escribir(db().from("workflows").update({ modo: "real", actualizado_en: ahora }).eq("id", w.id), "workflows");
    if (!w.entrada_id) {
      refrescar();
      return { ok: true as const };
    }
    const { error } = await db().from("entradas").update({ ghl_activo: false }).eq("id", w.entrada_id);
    if (error) {
      await db().from("workflows").update({ modo: "prueba", actualizado_en: ahora }).eq("id", w.id);
      throw new ErrorUsuario("No se pudo apagar «Mandar a GHL» de la Entrada: el workflow sigue en prueba. Inténtalo de nuevo.");
    }
    await escribir(db().from("webhook_eventos").update({ ghl_estado: null, ghl_error: "Lo manda su workflow" }).eq("entrada_id", w.entrada_id).eq("ghl_estado", "esperando"), "webhook_eventos");
    refrescar();
    return { ok: true as const };
  });
}

// «Volver a lo de hoy»: la Entrada vuelve a mandar con «Qué hacer en GHL», el workflow se para (queda en prueba) y lo que
// su ejecución tenía esperando lo manda el camino de hoy en la próxima lectura.
export async function devolverAHoy(workflowId: string) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const w = await workflowConEntrada(workflowId, proyecto.id);
    if (w.modo !== "real") throw new ErrorUsuario("Este workflow no está en real.");
    // Cita (sin Entrada): no hay «lo de hoy»; solo vuelve a prueba (sigue encendido o apagado como estaba)
    if (!w.entrada_id) {
      await escribir(db().from("workflows").update({ modo: "prueba", actualizado_en: new Date().toISOString() }).eq("id", w.id), "workflows");
      refrescar();
      return { ok: true as const };
    }
    await exigirNoGhl(w.entrada_id, "volver a «Mandar a GHL» (Volver a lo de hoy)", { enciende: true });
    const ahora = new Date().toISOString();
    await escribir(db().from("entradas").update({ ghl_activo: true }).eq("id", w.entrada_id), "entradas");
    await escribir(db().from("workflows").update({ modo: "prueba", encendido: false, actualizado_en: ahora }).eq("id", w.id), "workflows");
    const { data: pend } = await db().from("workflow_ejecuciones").select("lead_id").eq("workflow_id", w.id).eq("estado", "esperando");
    for (const leadId of [...new Set((pend ?? []).map((x) => x.lead_id as string))]) {
      const { data: ult } = await db().from("webhook_eventos").select("id").eq("entrada_id", w.entrada_id).eq("lead_id", leadId).eq("procesado", true).order("recibido_en", { ascending: false }).limit(1).maybeSingle();
      if (ult) await escribir(db().from("webhook_eventos").update({ ghl_estado: "esperando", ghl_intentos: 0, ghl_error: null, ghl_enviar_en: ahora }).eq("id", ult.id), "webhook_eventos");
    }
    refrescar();
    return { ok: true as const };
  });
}

// Con su workflow en real, la Entrada no puede volver a «Mandar a GHL» por su cuenta (mandarían los dos)
async function noLaMandaUnWorkflow(entradaId: string) {
  const { data } = await db().from("workflows").select("id").eq("entrada_id", entradaId).eq("encendido", true).eq("modo", "real").limit(1);
  if (data?.length) throw new ErrorUsuario("Esta Entrada la manda su workflow (modo real). Para volver a «Qué hacer en GHL», usa «Volver a lo de hoy» en la línea del workflow.");
}

// Plan GHL, sección 5 (forma B, Cristian 8 nov 2026): una Entrada «Desde un workflow de GHL» no manda a GHL, ni con
// «Mandar a GHL» ni con su workflow en real (círculo sin fin). Si lo intenta: error en pantalla y email a info@ (1 por
// Entrada y hora). `desde` = lo que va a quedar (si no, lo guardado); `enciende` = si mandará (si no, lo guardado).
async function exigirNoGhl(entradaId: string, intento: string, o: { desde?: string | null; enciende?: boolean }) {
  const { data: en } = await db().from("entradas").select("nombre, envia_desde, ghl_activo").eq("id", entradaId).maybeSingle();
  if (!en || (o.desde === undefined ? en.envia_desde : o.desde) !== "ghl") return;
  if (!o.enciende) {
    const { data: real } = await db().from("workflows").select("id").eq("entrada_id", entradaId).eq("encendido", true).eq("modo", "real").limit(1);
    if (!(o.enciende ?? en.ghl_activo) && !real?.length) return;
  }
  if (await dentroDelLimite(`ghl-bloqueado:${entradaId}`, 1, 60 * 60_000)) {
    const r = await enviarEmail({
      para: [EMAIL_AVISO_GHL],
      asunto: `GHL: «${en.nombre}» ha intentado mandar a GHL (bucle)`,
      texto: `La Entrada «${en.nombre}» recibe desde un workflow de GHL y alguien ha intentado ${intento}. Se ha bloqueado: sería un círculo sin fin.\n\n${urlApp()}/admin?tab=entradas`,
    });
    if (!r.enviado) console.error("[entradas] no se pudo mandar el email del bucle:", r.motivo);
  }
  throw new ErrorUsuario("Esta Entrada recibe desde un workflow de GHL: no puede mandar a GHL (sería un círculo sin fin). Deja «Mandar a GHL» apagado y su workflow en prueba, o cambia «¿Desde dónde manda los datos?».");
}

// «Reintentar» las ejecuciones en error de un workflow: vuelven a esperar con los intentos a cero
export async function reintentarEjecuciones(workflowId: string) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const { data: w } = await db().from("workflows").select("id").eq("id", workflowId).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!w) throw new ErrorUsuario("Workflow no encontrado.");
    await escribir(
      db().from("workflow_ejecuciones").update({ estado: "esperando", intentos: 0, error: null, siguiente_en: new Date().toISOString() }).eq("workflow_id", workflowId).eq("estado", "error"),
      "workflow_ejecuciones"
    );
    refrescar();
    return { ok: true as const };
  });
}

// «Reintentar» un envío en rojo: vuelve a esperar con los intentos a cero; lo manda la siguiente lectura (≤ 1 min)
export async function reintentarEnvioGhl(eventoId: string) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const { data: ev } = await db().from("webhook_eventos").select("id, entrada_id, lead_id, ghl_estado").eq("id", eventoId).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!ev?.entrada_id || !ev.lead_id) throw new ErrorUsuario("Envío no encontrado.");
    if (ev.ghl_estado !== "error") throw new ErrorUsuario("Este envío no está en error.");
    // Todos los de ese lead en esa Entrada que estén en rojo vuelven juntos (es un solo envío a GHL)
    await escribir(
      db()
        .from("webhook_eventos")
        .update({ ghl_estado: "esperando", ghl_intentos: 0, ghl_error: null, ghl_enviar_en: new Date().toISOString() })
        .eq("entrada_id", ev.entrada_id)
        .eq("lead_id", ev.lead_id)
        .eq("ghl_estado", "error"),
      "webhook_eventos"
    );
    refrescar();
  });
}

// ---------- GHL por API: calendarios de los closers (V2-3) ----------
// El token solo se escribe; la pantalla nunca lo vuelve a enseñar entero.
export async function guardarConexionGhl(token: string, locationId: string) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const t = token.trim();
    const loc = locationId.trim();
    if (!loc) throw new ErrorUsuario("Pon el id de la subcuenta (Location ID) de GHL.");
    if (t && t.length < 20) throw new ErrorUsuario("Ese token parece incompleto.");
    await escribir(db().from("proyectos").update({ ghl_location_id: loc, ...(t ? { ghl_token: cifrar(t) } : {}) }).eq("id", proyecto.id), "proyectos");
    refrescar();
  });
}

export async function guardarCalendarioCloser(perfilId: string, calendarId: string, userId: string) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const { data } = await db().from("miembros_proyecto").select("perfil_id, perfiles!inner(rol)").eq("proyecto_id", proyecto.id).eq("perfil_id", perfilId).or("rol.eq.closer,tambien_closer.eq.true", { referencedTable: "perfiles" }).maybeSingle(); // E1: también closer
    if (!data) throw new ErrorUsuario("Esa persona no es closer de este proyecto.");
    await escribir(db().from("miembros_proyecto").update({ ghl_calendar_id: calendarId.trim() || null, ghl_user_id: userId.trim() || null }).eq("proyecto_id", proyecto.id).eq("perfil_id", perfilId), "miembros_proyecto");
    refrescar();
  });
}

export async function probarConexionGhl() {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const { data: p } = await db().from("proyectos").select("ghl_token, ghl_location_id").eq("id", proyecto.id).single();
    if (!p?.ghl_token || !p.ghl_location_id) throw new ErrorUsuario("Primero guarda el token y el id de la subcuenta.");
    const { data: m } = await db().from("miembros_proyecto").select("ghl_calendar_id, ghl_user_id").eq("proyecto_id", proyecto.id).or("ghl_calendar_id.not.is.null,ghl_user_id.not.is.null").limit(1).maybeSingle();
    if (!m) throw new ErrorUsuario("Pon el calendario de GHL de al menos un closer para poder probar.");
    const { eventosGhl } = await import("@/lib/ghl");
    try {
      const ev = await eventosGhl({ token: descifrar(p.ghl_token, "el token de GHL"), locationId: p.ghl_location_id, calendarId: m.ghl_calendar_id, userId: m.ghl_user_id, desde: new Date(Date.now() - 7 * 86_400_000), hasta: new Date(Date.now() + 30 * 86_400_000) });
      return { ok: `Conexión correcta: ${ev.length} citas encontradas en el calendario (últimos 7 días y próximos 30).` };
    } catch (e) {
      throw new ErrorUsuario(e instanceof Error ? e.message : "No se pudo conectar con GHL.");
    }
  });
}

// ---------- Permisos por sección (V2-8 y Paso H5) ----------
// Paso H5 (decisiones de Cristian, 10 oct 2026): todas las secciones, por rol y por persona (manda la persona).
// Los cambian el CEO y el director con Administración; el director nunca se da más a sí mismo
// (ni su rol ni su ficha) ni da lo que él no tiene. Equipo y Finanzas, nunca a callers ni closers.
async function quienCambiaPermisos() {
  const sesion = await exigir(puedeAdmin);
  const mias = await seccionesPermitidas(sesion.perfil, sesion.proyecto.id);
  const comprobar = (rol: RolPermiso, seccion: string, permitido: boolean | null) => {
    const s = SECCIONES_TODAS.find((x) => x.v === seccion);
    if (!s) throw new ErrorUsuario("Sección no válida.");
    if (permitido && NUNCA[rol].has(s.v)) throw new ErrorUsuario(`«${s.t}» no se puede dar a ${rol === "director" ? "directores" : `${rol}s`}.`);
    if (permitido && sesion.perfil.rol !== "ceo" && !mias.has(s.v)) throw new ErrorUsuario(`No puedes dar «${s.t}»: tú no la tienes.`);
    return s.v;
  };
  return { ...sesion, comprobar };
}

export async function guardarPermisoSeccion(rol: RolPermiso, seccion: string, permitido: boolean) {
  return seguro(async () => {
    const { perfil, proyecto, comprobar } = await quienCambiaPermisos();
    if (!ROLES_PERMISO.includes(rol)) throw new ErrorUsuario("Rol no válido.");
    if (perfil.rol !== "ceo" && rol === "director") throw new ErrorUsuario("Los permisos de los directores solo los cambia el CEO.");
    const s = comprobar(rol, seccion, permitido);
    const { error } = await db().from("permisos_seccion").upsert({ proyecto_id: proyecto.id, rol, seccion: s, permitido: !!permitido });
    if (error) throw new ErrorUsuario(error.message);
    refrescar();
  });
}

// En la ficha de una persona: true / false, o null = «como su rol» (se borra su fila)
export async function guardarPermisoPersona(perfilId: string, seccion: string, permitido: boolean | null) {
  return seguro(async () => {
    const { perfil, proyecto, comprobar } = await quienCambiaPermisos();
    if (perfilId === perfil.id) throw new ErrorUsuario("Tus propios permisos te los cambia el CEO.");
    const { data: m } = await db().from("miembros_proyecto").select("perfil_id, perfiles!inner(rol)").eq("proyecto_id", proyecto.id).eq("perfil_id", perfilId).maybeSingle();
    const rol = (m as unknown as { perfiles: { rol: string } } | null)?.perfiles.rol;
    if (!m || !ROLES_PERMISO.includes(rol as RolPermiso)) throw new ErrorUsuario("Esa persona no es caller, closer ni director de este proyecto (el CEO lo tiene todo siempre).");
    const s = comprobar(rol as RolPermiso, seccion, permitido);
    const r =
      permitido === null
        ? await db().from("permisos_persona").delete().eq("proyecto_id", proyecto.id).eq("perfil_id", perfilId).eq("seccion", s)
        : await db().from("permisos_persona").upsert({ proyecto_id: proyecto.id, perfil_id: perfilId, seccion: s, permitido });
    if (r.error) throw new ErrorUsuario(r.error.message);
    refrescar();
  });
}

// ---------- Ajustes de las llamadas de los closers (bloque 1 de 1.0) ----------
// perfilId null = los del proyecto (valen para todos); con perfilId = los de ese closer (null = vuelve a los del proyecto).
// Solo los pone un administrador (Cristian, 11 oct 2026).
export async function guardarCalendario(perfilId: string | null, ajustes: { duracion: number; descanso: number; aviso: number; max_dia: number | null } | null) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    let valor: AjustesCalendario | null = null;
    if (ajustes) {
      valor = ajustesValidos(ajustes, { duracion: -1, descanso: -1, aviso: -1, max_dia: -1 });
      if (valor.duracion < 0) throw new ErrorUsuario("La duración va de 5 a 480 minutos.");
      if (valor.descanso < 0) throw new ErrorUsuario("El descanso va de 0 a 240 minutos.");
      if (valor.aviso < 0) throw new ErrorUsuario("El aviso mínimo va de 0 a 30 días.");
      if (valor.max_dia !== null && valor.max_dia < 0) throw new ErrorUsuario("El máximo de llamadas por día va de 1 a 100 (o vacío, sin máximo).");
    }
    if (!perfilId) {
      if (!valor) throw new ErrorUsuario("Faltan los ajustes.");
      await escribir(db().from("proyectos").update({ calendario: valor }).eq("id", proyecto.id), "proyectos");
    } else {
      const { data: quien } = await db().from("perfiles").select("rol, tambien_closer").eq("id", perfilId).maybeSingle();
      if (!quien || !esCloser(quien as { rol: Rol; tambien_closer: boolean })) throw new ErrorUsuario("Estos ajustes son para closers."); // también Facu (9 nov)
      const { data, error } = await db().from("miembros_proyecto").update({ calendario: valor }).eq("proyecto_id", proyecto.id).eq("perfil_id", perfilId).select("perfil_id");
      if (error) throw new ErrorUsuario(error.message);
      if (!data?.length) throw new ErrorUsuario("Esa persona no está en este proyecto.");
    }
    refrescar();
  });
}

// Usuario de GHL de cada persona (para saber quién hizo cada llamada de GHL, V2-11)
export async function guardarUsuarioGhl(perfilId: string, userId: string) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const u = userId.trim();
    if (u && !/^[A-Za-z0-9_-]{6,64}$/.test(u)) throw new ErrorUsuario("El id de usuario de GHL no parece válido.");
    const { data } = await db().from("miembros_proyecto").update({ ghl_user_id: u || null }).eq("proyecto_id", proyecto.id).eq("perfil_id", perfilId).select("perfil_id");
    if (!data?.length) throw new ErrorUsuario("Esa persona no está en este proyecto.");
    refrescar();
  });
}

// ---------- Rotación de closers del «Agendado» del caller (plan Callers C11; Cristian, 7 nov) ----------
// % por closer (0 a 100) que suman 100, o todos a 0 (sin rotación: el caller no puede agendar a mano).
// Al cambiar los %, la cuenta de cada closer vuelve a cero (la rotación empieza de nuevo con los % nuevos).
export async function guardarRotacion(pcts: Record<string, number>) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const closers = (await equipo(proyecto.id)).filter((p) => p.rol === "closer");
    const limpio = validarRotacion(Object.fromEntries(closers.map((c) => [c.id, Number(pcts[c.id] ?? 0)])));
    const { data: antes } = await db().from("miembros_proyecto").select("perfil_id, rotacion_pct").eq("proyecto_id", proyecto.id).in("perfil_id", closers.map((c) => c.id));
    const cambian = (antes ?? []).some((a) => Number(a.rotacion_pct) !== limpio[a.perfil_id]);
    for (const [id, v] of Object.entries(limpio)) {
      await escribir(db().from("miembros_proyecto").update({ rotacion_pct: v, ...(cambian ? { rotacion_cuenta: 0 } : {}) }).eq("proyecto_id", proyecto.id).eq("perfil_id", id), "miembros_proyecto");
    }
    refrescar();
  });
}

// ---------- Calendarios de GHL del proyecto (columna proyectos.ghl_calendarios) ----------
// Vacíos y repetidos fuera; un id con forma rara rechaza toda la lista. Lista vacía = sync por closer, como antes.
export async function guardarCalendariosProyecto(ids: string[]) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    if (!Array.isArray(ids)) throw new ErrorUsuario("Lista de calendarios no válida.");
    const limpios: string[] = [];
    for (const x of ids) {
      if (typeof x === "string" && !x.trim()) continue;
      const id = idGhl(x);
      if (!id) throw new ErrorUsuario(`El calendario «${String(x).slice(0, 40)}» no es válido (solo letras, números, - y _).`);
      if (!limpios.includes(id)) limpios.push(id);
    }
    await escribir(db().from("proyectos").update({ ghl_calendarios: limpios }).eq("id", proyecto.id), "proyectos");
    refrescar();
  });
}

// ---------- Orden de las Entradas (plan GHL 2.8) ----------
// Intercambia con la vecina y reescribe `orden` de todas (0,1,2…) para que no haya empates
export async function moverEntrada(id: string, direccion: "arriba" | "abajo") {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const { data } = await db().from("entradas").select("id").eq("proyecto_id", proyecto.id).order("orden").order("creado_en");
    const actual = (data ?? []).map((e: { id: string }) => e.id);
    if (!actual.includes(id)) throw new ErrorUsuario("Entrada no encontrada.");
    const nuevo = reordenar(actual, id, direccion);
    if (!nuevo) throw new ErrorUsuario(direccion === "arriba" ? "Ya es la primera." : "Ya es la última.");
    for (const [orden, eid] of nuevo.entries()) {
      await escribir(db().from("entradas").update({ orden }).eq("id", eid).eq("proyecto_id", proyecto.id), "entradas");
    }
    refrescar();
  });
}

// ---------- Canales (Plan GHL B2b, Cristian 8 nov) ----------
// Guarda la tabla entera. Las claves no cambian; si cambia un nombre, la función SQL renombra también «Canal: X»
// en los leads, las reglas de las Entradas y los disparadores, a la vez (supabase/migrations/20261109120000_canales.sql).
export async function guardarCanales(filas: unknown) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const r = tablaValida(filas);
    if ("error" in r) throw new ErrorUsuario(r.error);
    const antes = await canalesDe(proyecto.id); // sin filas, los de siempre: su nombre es el que llevan los leads
    const p_filas = r.ok.map((c) => ({ ...c, antes: antes.find((a) => a.clave === c.clave)?.nombre ?? null }));
    await escribir(db().rpc("guardar_canales", { p_proyecto: proyecto.id, p_filas }), "canales");
    refrescar();
  });
}

// ---------- Etiquetas (Plan GHL B3a, Cristian 8 nov) ----------
// Siempre en minúsculas (como GHL). Las escritas en el código no se renombran ni se borran: las de los pipelines
// (ghl-leads.ts), las de la Biblioteca (20261017160000_biblioteca_filas.sql), las `-completo`/`-incompleto` (etiquetas.ts)
// y «Canal: …» (se cambian en Canales). Nada de esto toca GHL.
const DEL_CODIGO = [...PIPELINE_ETIQUETA.map((x) => x.etiqueta), "recursos-ia"];
const delCodigo = (t: string) => DEL_CODIGO.includes(t) || /-(in)?completo$/.test(t) || t.startsWith("canal:");
const etiquetaLimpia = (x: unknown) => (typeof x === "string" ? x.trim().toLowerCase() : "");
const etiquetaBuena = (t: string) => !!t && t.length <= 80 && !t.includes(",");
function etiquetaValida(x: unknown, cambia = false) {
  const t = etiquetaLimpia(x);
  if (!etiquetaBuena(t)) throw new ErrorUsuario("Escribe la etiqueta (sin comas y de 80 letras como mucho).");
  if (cambia && delCodigo(t)) throw new ErrorUsuario(`«${t}» la usa el código de la app: no se puede renombrar, unir ni borrar.`);
  return t;
}

export async function crearEtiqueta(nombre: unknown) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const t = etiquetaValida(nombre);
    const { data: ultima } = await db().from("etiquetas").select("orden").eq("proyecto_id", proyecto.id).order("orden", { ascending: false }).limit(1).maybeSingle();
    const { error } = await db().from("etiquetas").insert({ proyecto_id: proyecto.id, nombre: t, orden: ultima ? Number(ultima.orden) + 1 : 0 });
    if (error) throw new ErrorUsuario(error.code === "23505" ? "Esa etiqueta ya existe." : error.message);
    refrescar();
    return { ok: true as const };
  });
}

// Renombrar (si `a` ya existe, se unen sin repetir) o borrar (`a` = null), en una sola función SQL que cambia a la vez
// leads, Entradas, reglas, pasos y disparadores de los workflows (supabase/migrations/20261109130000_etiquetas.sql).
export async function renombrarEtiqueta(de: unknown, a: unknown) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const d = etiquetaValida(de, true);
    const n = a === null ? null : etiquetaValida(a, true);
    if (n === d) throw new ErrorUsuario("Pon un nombre distinto.");
    // Plan GHL 1.7 (9 nov): si es la etiqueta base de una Entrada, sus «-completo»/«-incompleto» cambian con ella
    const { data: bases, error: errB } = n === null ? { data: [], error: null } : await db().from("entradas").select("id").eq("proyecto_id", proyecto.id).ilike("ghl_etiqueta_base", d.replace(/[\\%_]/g, "\\$&")).limit(1); // la base puede ir con mayúsculas («Biblioteca-form»)
    if (errB) throw new Error(`No se pudieron leer las Entradas: ${errB.message}`);
    await escribir(db().rpc("renombrar_etiqueta", { p_proyecto: proyecto.id, p_de: d, p_a: n }), "etiquetas");
    const r = await etiquetaEnGhl(proyecto.id, d, n);
    const avisos = r.aviso ? [r.aviso] : [];
    if (n !== null && bases?.length) {
      for (const suf of ["-completo", "-incompleto"]) {
        await escribir(db().rpc("renombrar_etiqueta", { p_proyecto: proyecto.id, p_de: d + suf, p_a: n + suf }), "etiquetas");
        const rs = await etiquetaEnGhl(proyecto.id, d + suf, n + suf);
        if (rs.aviso && !avisos.includes(rs.aviso)) avisos.push(rs.aviso);
      }
    }
    refrescar();
    return { ok: true as const, ...r, ...(avisos.length ? { aviso: avisos.join(" ") } : {}) };
  });
}

// Plan GHL 1.7 (9 nov): la marca «usada por GHL» se cambia en pantalla
export async function marcarEtiquetaGhl(nombre: unknown, usada: unknown) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    const t = etiquetaValida(nombre);
    await escribir(db().from("etiquetas").upsert({ proyecto_id: proyecto.id, nombre: t, usada_ghl: usada === true }, { onConflict: "proyecto_id,nombre" }), "etiquetas");
    refrescar();
    return { ok: true as const };
  });
}

// B3b (Cristian, 8 nov): lo mismo en GHL, después de la base y solo con GHL conectado. Si GHL falla, la base ya cambió:
// se dice en el aviso y no se deshace. Unir cambia como mucho MAX_UNIR_GHL contactos por pulsación (≈ 250 ms cada uno,
// para caber en el tiempo de la acción); repetir la misma acción sigue (en la base ya no hace nada).
const MAX_UNIR_GHL = 100; // ~250 ms por contacto: 100 ≈ 25 s, lejos del límite de la acción
async function etiquetaEnGhl(proyectoId: string, de: string, a: string | null): Promise<{ aviso?: string; faltan?: number }> {
  const { data: p, error: errP } = await db().from("proyectos").select("ghl_token, ghl_location_id").eq("id", proyectoId).single();
  if (errP) throw new Error(`No se pudo leer el proyecto: ${errP.message}`);
  const vuelve = `En GHL sigue «${de}»: si GHL vuelve a mandar uno de esos leads, «${de}» puede volver.`;
  if (!p?.ghl_token || !p.ghl_location_id) return { aviso: `Este proyecto no tiene GHL conectado. ${vuelve}` };
  try {
    const o = { token: descifrar(p.ghl_token, "el token de GHL"), locationId: p.ghl_location_id };
    if (a === null) {
      await borrarEtiquetaGhl({ ...o, nombre: de });
      return {};
    }
    const { faltan } = await renombrarEtiquetaGhl({ ...o, de, a, max: MAX_UNIR_GHL });
    return faltan ? { faltan, aviso: `En GHL faltan ${faltan} contactos por unir: pulsa «Seguir uniendo en GHL».` } : {};
  } catch (e) {
    // Al unir, `faltan` deja el botón «Seguir uniendo en GHL» para reintentar (en la base ya no hace nada)
    return { ...(a !== null ? { faltan: 1 } : {}), aviso: `En el dashboard ya está hecho, pero en GHL no: ${e instanceof Error ? e.message : "error desconocido."} No se ha deshecho nada. ${a !== null ? "Pulsa «Seguir uniendo en GHL» para reintentar. " : ""}${vuelve}` };
  }
}

// Guarda el orden de la lista entera (las de los leads también pasan a tener fila; la marca «usada por GHL» no cambia)
export async function ordenarEtiquetas(nombres: unknown) {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeAdmin);
    if (!Array.isArray(nombres) || nombres.length > 2000) throw new ErrorUsuario("Lista de etiquetas no válida.");
    const lista = [...new Set(nombres.map(etiquetaLimpia).filter(etiquetaBuena))];
    await escribir(db().from("etiquetas").upsert(lista.map((nombre, orden) => ({ proyecto_id: proyecto.id, nombre, orden })), { onConflict: "proyecto_id,nombre" }), "etiquetas");
    refrescar();
    return { ok: true as const };
  });
}
