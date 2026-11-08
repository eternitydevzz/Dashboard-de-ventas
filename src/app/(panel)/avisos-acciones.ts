"use server";

import { cookies } from "next/headers";
import { exigir } from "@/lib/auth";
import { reporteDia } from "@/lib/avisos-ceo";
import { seguro } from "@/lib/resultado";

// Plan GHL F1b (Cristian, 8 nov 2026): el reporte del día anterior sale solo al CEO y una vez al día por persona.
// Sin tabla nueva: el día ya enseñado se apunta en una cookie del navegador (una por persona). Límite conocido:
// en otro navegador u ordenador vuelve a salir una vez.
export async function reporteAlEntrar() {
  return seguro(async () => {
    const { perfil, proyecto } = await exigir((p) => p.rol === "ceo"); // solo CEO, también aquí en el servidor
    const reporte = await reporteDia(proyecto.id, new Date());
    const jar = await cookies();
    const nombre = `eternity_reporte_${perfil.id}`;
    if (jar.get(nombre)?.value === reporte.dia) return null;
    jar.set(nombre, reporte.dia, { path: "/", maxAge: 60 * 60 * 24 * 2, sameSite: "lax" });
    return reporte;
  });
}
