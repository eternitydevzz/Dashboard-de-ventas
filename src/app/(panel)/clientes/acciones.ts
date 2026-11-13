"use server";

import { revalidatePath } from "next/cache";
import { ErrorUsuario, notaValida, seguro } from "@/lib/resultado";
import { db, registrarActividad, todas, escribir } from "@/lib/datos";
import { exigirSeccion, soloLoSuyo } from "@/lib/permisos";
import { clientesSuyos } from "./cargar";
import { esJefe } from "@/lib/auth";
import { telefonoClave } from "@/lib/leads";
import { conPais } from "@/lib/pais";
import { registrarVenta } from "@/app/(panel)/leads/acciones";
import { ESTADOS_CLIENTE, type EstadoCliente } from "@/lib/clientes";

const refrescar = () => revalidatePath("/", "layout");
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Solo se toca la ficha de alguien que ha comprado (decisión de Cristian: Clientes = quien compró)
async function clientePermitido(leadId: string) {
  const sesion = await exigirSeccion("clientes");
  // H5: a un caller o closer, solo sus clientes (los que vendió o agendó)
  if (soloLoSuyo(sesion.perfil, "clientes") && !(await clientesSuyos(sesion.proyecto.id, sesion.perfil.id)).has(leadId)) throw new ErrorUsuario("Este cliente no es tuyo.");
  const { data: venta } = await db().from("ventas").select("id").eq("proyecto_id", sesion.proyecto.id).eq("lead_id", leadId).limit(1).maybeSingle();
  if (!venta) throw new ErrorUsuario("Esta persona no ha comprado: no es un cliente.");
  return sesion;
}
async function actualizarFicha(proyectoId: string, leadId: string, cambios: Record<string, unknown>) {
  const { error } = await db().from("clientes").upsert({ proyecto_id: proyectoId, lead_id: leadId, ...cambios, actualizado_en: new Date().toISOString() });
  if (error) throw new ErrorUsuario(error.message);
}

export async function cambiarEstadoCliente(leadId: string, estado: EstadoCliente) {
  return seguro(async () => {
    const { proyecto } = await clientePermitido(leadId);
    if (!ESTADOS_CLIENTE.some((x) => x.v === estado)) throw new ErrorUsuario("Estado no válido.");
    await actualizarFicha(proyecto.id, leadId, { estado });
    refrescar();
  });
}

// Seguimiento: una nota (opcional) y la próxima fecha de contacto (vacía = sin fecha)
export async function anotarSeguimiento(leadId: string, nota: string, proximo: string) {
  return seguro(async () => {
    nota = notaValida(nota);
    const { perfil, proyecto } = await clientePermitido(leadId);
    if (proximo && !FECHA.test(proximo)) throw new ErrorUsuario("Fecha no válida.");
    if (nota.length > 4000) throw new ErrorUsuario("La nota es demasiado larga.");
    if (nota.trim()) {
      await escribir(db().from("seguimientos_cliente").insert({ proyecto_id: proyecto.id, lead_id: leadId, nota: nota.trim(), perfil_id: perfil.id }), "seguimientos_cliente");
      await registrarActividad({ proyecto_id: proyecto.id, lead_id: leadId, perfil_id: perfil.id, tipo: "nota", resultado: null, nota: `Seguimiento de cliente: ${nota.trim()}` });
    }
    await actualizarFicha(proyecto.id, leadId, { proximo_contacto: proximo || null });
    refrescar();
  });
}

export async function marcarPasoOnboarding(leadId: string, pasoId: string, hecho: boolean) {
  return seguro(async () => {
    const { proyecto } = await clientePermitido(leadId);
    const { data: paso } = await db().from("pasos_onboarding").select("id").eq("id", pasoId).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!paso) throw new ErrorUsuario("Ese paso no existe.");
    const { data: f } = await db().from("clientes").select("onboarding").eq("proyecto_id", proyecto.id).eq("lead_id", leadId).maybeSingle();
    const onboarding = { ...((f?.onboarding as Record<string, string>) ?? {}) };
    if (hecho) onboarding[pasoId] = new Date().toISOString();
    else delete onboarding[pasoId];
    await actualizarFicha(proyecto.id, leadId, { onboarding });
    refrescar();
  });
}

export async function guardarCasoExito(leadId: string, c: { caso: boolean; resultado: string; enlace: string; fecha: string }) {
  return seguro(async () => {
    const { proyecto } = await clientePermitido(leadId);
    const enlace = c.enlace.trim();
    if (enlace && !/^https:\/\/[^\s]+$/i.test(enlace)) throw new ErrorUsuario("El enlace del testimonio tiene que empezar por https://");
    if (c.fecha && !FECHA.test(c.fecha)) throw new ErrorUsuario("Fecha no válida.");
    if (c.caso && !c.resultado.trim()) throw new ErrorUsuario("Escribe qué resultado consiguió.");
    await actualizarFicha(proyecto.id, leadId, { caso_exito: c.caso, caso_resultado: c.resultado.trim() || null, caso_enlace: enlace || null, caso_fecha: c.fecha || null });
    refrescar();
  });
}

// ---------- Pasos del onboarding ----------
export async function guardarPasoOnboarding(id: string | null, nombre: string) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("clientes");
    if (soloLoSuyo(perfil, "clientes")) throw new ErrorUsuario("Los pasos del onboarding los cambian el CEO o el director."); // H5
    if (!nombre.trim()) throw new ErrorUsuario("Pon un nombre al paso.");
    if (id) {
      const { error } = await db().from("pasos_onboarding").update({ nombre: nombre.trim() }).eq("id", id).eq("proyecto_id", proyecto.id);
      if (error) throw new ErrorUsuario(error.code === "23505" ? "Ya hay un paso con ese nombre." : error.message);
    } else {
      const { count } = await db().from("pasos_onboarding").select("id", { count: "exact", head: true }).eq("proyecto_id", proyecto.id);
      const { error } = await db().from("pasos_onboarding").insert({ proyecto_id: proyecto.id, nombre: nombre.trim(), orden: count ?? 0 });
      if (error) throw new ErrorUsuario(error.code === "23505" ? "Ya hay un paso con ese nombre." : error.message);
    }
    refrescar();
  });
}

export async function borrarPasoOnboarding(id: string) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("clientes");
    if (soloLoSuyo(perfil, "clientes")) throw new ErrorUsuario("Los pasos del onboarding los cambian el CEO o el director."); // H5
    await escribir(db().from("pasos_onboarding").delete().eq("id", id).eq("proyecto_id", proyecto.id), "pasos_onboarding");
    refrescar();
  });
}

// ---------- Nuevo cliente = sus datos + su venta (respuesta de Cristian) ----------
export async function nuevoCliente(formData: FormData) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("clientes");
    if (soloLoSuyo(perfil, "clientes")) throw new ErrorUsuario("Un cliente nuevo lo crean el CEO o el director (tus ventas, desde tus leads)."); // H5
    const nombre = String(formData.get("nombre") ?? "").trim();
    const apellido = String(formData.get("apellido") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const telefono = String(formData.get("telefono") ?? "").trim();
    if (!nombre) throw new ErrorUsuario("Pon el nombre del cliente.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorUsuario("El email no es válido.");
    if (!email && telefonoClave(telefono).length < 6) throw new ErrorUsuario("Pon el email o el teléfono.");
    // Si ya existe (por email o teléfono), la venta va a ese lead
    let leadId: string | null = null;
    // C9: «_» y «%» son comodines de ilike (a_b@x.com encontraba a axb@x.com): se escapan; ilike y no eq porque
    // el índice único es por lower(email) y puede haber emails guardados con mayúsculas
    if (email) leadId = (await db().from("leads").select("id").eq("proyecto_id", proyecto.id).ilike("email", email.replace(/[\\%_]/g, "\\$&")).maybeSingle()).data?.id ?? null;
    if (!leadId && telefonoClave(telefono).length >= 6) {
      const data = await todas<{ id: string; telefono: string | null }>((a, b) => db().from("leads").select("id, telefono").eq("proyecto_id", proyecto.id).not("telefono", "is", null).order("id").range(a, b));
      leadId = data.find((l) => telefonoClave(l.telefono) === telefonoClave(telefono))?.id ?? null;
    }
    let creado = false;
    if (!leadId) {
      const { data: pipe } = await db().from("pipelines").select("id").eq("proyecto_id", proyecto.id).eq("tipo", "normal").order("orden").limit(1).maybeSingle();
      const { data: etapa } = pipe ? await db().from("etapas").select("id").eq("pipeline_id", pipe.id).order("orden").limit(1).maybeSingle() : { data: null };
      const { data: nuevo, error } = await db()
        .from("leads")
        .insert({ proyecto_id: proyecto.id, nombre, apellido, email: email || null, telefono: telefono || null, ...conPais(telefono || null), origen: "manual", pipeline_id: pipe?.id ?? null, etapa_id: etapa?.id ?? null, ...(esJefe(perfil) ? {} : perfil.rol === "closer" ? { closer_id: perfil.id } : { caller_id: perfil.id }) })
        .select("id")
        .single();
      if (error) throw new ErrorUsuario(error.message);
      leadId = nuevo.id;
      creado = true;
    }
    const r = await registrarVenta(leadId!, formData);
    if (r && typeof r === "object" && "error" in r) {
      if (creado) await db().from("leads").delete().eq("id", leadId!); // no dejar un lead a medias
      throw new ErrorUsuario(String(r.error));
    }
    refrescar();
    return { leadId };
  });
}
