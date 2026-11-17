"use server";

import { headers } from "next/headers";
import { guardarError } from "@/lib/errores-app";
import { dentroDelLimite } from "@/lib/limite";
import { ipDe } from "@/lib/ip-envio";

// 12 nov 2026: los fallos del navegador no se guardaban en ningún sitio (un caller nuevo estuvo sin poder entrar y no
// había rastro). La pantalla de error (app/error.tsx) los manda aquí y salen en los avisos del CEO («otros errores»).
// La puede llamar cualquiera, también sin sesión (el login): textos recortados, 20 por conexión y 60 en total cada hora
// (S4-1, 17 nov: desde muchas IPs se podía llenar el email del CEO). En los avisos sale marcado «sin verificar».
export async function anotarErrorNavegador(ruta: string, mensaje: string) {
  const ip = ipDe(await headers());
  if (!(await dentroDelLimite(`error-navegador:${ip}`, 20, 60 * 60_000))) return;
  if (!(await dentroDelLimite("error-navegador:todos", 60, 60 * 60_000))) return;
  await guardarError("navegador", `${String(ruta).slice(0, 100)} · ${String(mensaje).slice(0, 300)}`);
}
