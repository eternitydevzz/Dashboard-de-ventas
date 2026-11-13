"use server";

import { revalidatePath } from "next/cache";
import { olvidarTodo } from "@/lib/memoria";
import { getSesion, puedeAdmin } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { db, escribir } from "@/lib/datos";
import { anotar, bloqueado } from "@/lib/limite";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { horarioValido } from "@/lib/horarios";
import { mercadoValido } from "@/lib/mercado";
import { MAX_FOTO, conZona, esJpeg, zonaValida } from "./foto-zona";

// 25 oct 2026: también borra la memoria compartida (lib/memoria.ts), para que lo guardado se vea al momento
const refrescar = () => {
  olvidarTodo();
  revalidatePath("/", "layout");
};

// «Mi perfil» (bloque 1 de 1.0): cada persona cambia sus datos, su contraseña y su horario
export async function guardarMiPerfil(datos: { nombre: string; telefono: string; whatsapp: string }) {
  return seguro(async () => {
    const { perfil } = await getSesion();
    const nombre = datos.nombre.trim();
    if (!nombre) throw new ErrorUsuario("El nombre es obligatorio.");
    if (nombre.length > 120 || datos.telefono.length > 40 || datos.whatsapp.length > 40) throw new ErrorUsuario("Algún dato es demasiado largo.");
    await escribir(db().from("perfiles").update({ nombre, telefono: datos.telefono.trim() || null, whatsapp: datos.whatsapp.trim() || null }).eq("id", perfil.id), "perfiles");
    refrescar();
  });
}

// D43: pide la actual, para que una sesión abierta en otro aparato no baste para quedarse la cuenta.
// Mismo freno que el login: 8 fallos cada 15 minutos.
export async function cambiarMiPassword(actual: string, nueva: string, repetida: string) {
  return seguro(async () => {
    const { perfil } = await getSesion();
    if (!actual) throw new ErrorUsuario("Escribe tu contraseña actual.");
    if (nueva.length < 8) throw new ErrorUsuario("La contraseña necesita al menos 8 caracteres.");
    if (nueva !== repetida) throw new ErrorUsuario("Las dos contraseñas no coinciden.");
    const clave = `password:${perfil.id}`;
    const quince = 15 * 60_000;
    if (await bloqueado(clave, 8, quince)) throw new ErrorUsuario("Demasiados intentos fallidos. Espera 15 minutos y vuelve a probar.");
    // Cliente aparte y sin guardar sesión: no toca las cookies de la persona
    const prueba = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: mala } = await prueba.auth.signInWithPassword({ email: perfil.email, password: actual });
    if (mala) {
      await anotar(clave);
      throw new ErrorUsuario("La contraseña actual no es correcta.");
    }
    await prueba.auth.signOut({ scope: "local" }).catch(() => {}); // cierra solo esa sesión de comprobación
    const { error } = await db().auth.admin.updateUserById(perfil.id, { password: nueva });
    if (error) throw new ErrorUsuario(error.message); // de Auth (p. ej. contraseña débil), no de la base
  });
}

// El horario lo cambia la propia persona (en «Mi perfil» o en el onboarding) o un administrador (CEO o director
// con Administración). Cristian, 11 oct 2026. Siempre en la hora del proyecto; solo para callers y closers.
export async function guardarHorario(perfilId: string, horario: unknown) {
  return seguro(async () => {
    const { perfil, proyecto } = await getSesion();
    if (perfilId !== perfil.id && !puedeAdmin(perfil)) throw new ErrorUsuario("Solo puedes cambiar tu propio horario.");
    const { data: quien } = await db().from("perfiles").select("rol").eq("id", perfilId).maybeSingle();
    if (quien?.rol !== "caller" && quien?.rol !== "closer") throw new ErrorUsuario("El horario es para callers y closers.");
    const h = horarioValido(horario);
    if (!h) throw new ErrorUsuario("Pon al menos un tramo en algún día, con la hora de inicio antes que la de fin (HH:MM).");
    const { data, error } = await db().from("miembros_proyecto").update({ horario: h }).eq("proyecto_id", proyecto.id).eq("perfil_id", perfilId).select("perfil_id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new ErrorUsuario("Esa persona no está en este proyecto.");
    refrescar();
  });
}

// 13 nov (Cristian): cada persona elige si es del equipo de Latam o del de España (al entrar y en «Mi perfil»)
export async function guardarMiMercado(mercado: string) {
  return seguro(async () => {
    const { perfil, proyecto } = await getSesion();
    const m = mercadoValido(mercado);
    if (!m) throw new ErrorUsuario("Elige Latam o España.");
    const { data, error } = await db().from("miembros_proyecto").update({ mercado: m }).eq("proyecto_id", proyecto.id).eq("perfil_id", perfil.id).select("perfil_id");
    if (error) throw new ErrorUsuario(/mercado/.test(error.message) ? "Falta aplicar la migración de la base (España)." : error.message);
    if (!data?.length) throw new ErrorUsuario("No estás en este proyecto.");
    refrescar();
  });
}

// N3 (Cristian, 13 nov): la foto de cada persona (al entrar y en «Mi perfil»). Llega ya recortada y reducida.
export async function guardarMiFoto(datos: FormData) {
  return seguro(async () => {
    const { perfil } = await getSesion();
    const archivo = datos.get("foto");
    if (!(archivo instanceof File) || !archivo.size) throw new ErrorUsuario("Elige una foto.");
    if (archivo.size > MAX_FOTO) throw new ErrorUsuario("La foto pesa demasiado.");
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    if (!esJpeg(bytes)) throw new ErrorUsuario("Ese archivo no es una imagen válida.");
    const ruta = `${perfil.id}/${crypto.randomUUID()}.jpg`;
    const fotos = db().storage.from("fotos");
    const { error } = await fotos.upload(ruta, bytes, { contentType: "image/jpeg" });
    if (error) throw new ErrorUsuario(/bucket/i.test(error.message) ? "Falta aplicar la migración de la base (fotos)." : "No se pudo subir la foto. Inténtalo de nuevo.");
    const { error: errGuardar } = await db().from("perfiles").update({ foto: ruta }).eq("id", perfil.id);
    if (errGuardar) {
      await fotos.remove([ruta]); // que no quede un archivo suelto
      throw new ErrorUsuario(/foto/.test(errGuardar.message) ? "Falta aplicar la migración de la base (fotos)." : errGuardar.message);
    }
    // La anterior ya no la usa nadie; si no se borra, solo ocupa sitio
    const anterior = perfil.foto;
    if (anterior) await fotos.remove([anterior]).catch((e) => console.error("[foto] no se pudo borrar la anterior:", e));
    refrescar();
  });
}

// N2 (Cristian, 13 nov): la zona en que ve las horas cada caller y closer (al entrar y en «Mi perfil»)
export async function guardarMiZona(zona: string) {
  return seguro(async () => {
    const { perfil } = await getSesion();
    if (!conZona(perfil.rol)) throw new ErrorUsuario("La zona horaria es para callers y closers.");
    const z = zonaValida(zona);
    if (!z) throw new ErrorUsuario("Elige una de las zonas de la lista.");
    const { error } = await db().from("perfiles").update({ zona_horaria: z }).eq("id", perfil.id);
    if (error) throw new ErrorUsuario(/zona_horaria/.test(error.message) ? "Falta aplicar la migración de la base (zona horaria)." : error.message);
    refrescar();
  });
}
