"use server";

import { cookies } from "next/headers";
import { exigir } from "@/lib/auth";
import { reporteDia } from "@/lib/avisos-ceo";
import { hoyEnZona } from "@/lib/formato";
import { mensajesCaller, mensajesCloser, tocaVentana } from "@/lib/mensajes-entrada";
import { numerosCaller, numerosCloser } from "@/lib/mensajes-entrada-datos";
import { seguro } from "@/lib/resultado";

// Bienvenida con mensajes (Cristian, 11 nov 2026): ventana al entrar para callers y closers, con su motivación,
// el recordatorio de grabar y sus felicitaciones, más sus números. Una vez al día; vuelve a salir el mismo día solo si
// llega una felicitación nueva (cookie «día|vistas», como el reporte del CEO: en otro navegador sale otra vez).
export async function mensajesAlEntrar() {
  return seguro(async () => {
    const { perfil, proyecto } = await exigir(["caller", "closer"]);
    const zona = proyecto.zona_horaria;
    const caller = perfil.rol === "caller";
    const numeros = caller ? await numerosCaller(perfil.id, proyecto.id, zona) : await numerosCloser(perfil.id, proyecto.id, zona);
    const mensajes = "llamadasHoy" in numeros ? mensajesCaller(numeros) : mensajesCloser(numeros);
    const jar = await cookies();
    const nombre = `eternity_mensajes_${perfil.id}_${proyecto.id}`;
    const { toca, nuevaCookie } = tocaVentana(jar.get(nombre)?.value, hoyEnZona(zona), mensajes);
    if (!toca) return null;
    jar.set(nombre, nuevaCookie, { path: "/", maxAge: 60 * 60 * 24 * 2, sameSite: "lax" });
    return { rol: perfil.rol, mensajes, numeros };
  });
}

// Plan GHL F1b (Cristian, 8 nov 2026): el reporte del día anterior sale solo al CEO y una vez al día por persona y proyecto (1.7, 9 nov).
// Sin tabla nueva: el día ya enseñado se apunta en una cookie del navegador (una por persona). Límite conocido:
// en otro navegador u ordenador vuelve a salir una vez.
export async function reporteAlEntrar() {
  return seguro(async () => {
    const { perfil, proyecto } = await exigir((p) => p.rol === "ceo"); // solo CEO, también aquí en el servidor
    const reporte = await reporteDia(proyecto.id, new Date());
    const jar = await cookies();
    const nombre = `eternity_reporte_${perfil.id}_${proyecto.id}`; // por proyecto: cada uno tiene su reporte
    if (jar.get(nombre)?.value === reporte.dia) return null;
    jar.set(nombre, reporte.dia, { path: "/", maxAge: 60 * 60 * 24 * 2, sameSite: "lax" });
    return reporte;
  });
}
