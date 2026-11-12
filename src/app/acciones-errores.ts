"use server";

import { headers } from "next/headers";
import { guardarError } from "@/lib/errores-app";
import { dentroDelLimite } from "@/lib/limite";

// 12 nov 2026: los fallos del navegador no se guardaban en ningún sitio (un caller nuevo estuvo sin poder entrar y no
// había rastro). La pantalla de error (app/error.tsx) los manda aquí y salen en los avisos del CEO («otros errores»).
// La puede llamar cualquiera, también sin sesión (el login): textos recortados y 20 por conexión cada hora.
export async function anotarErrorNavegador(ruta: string, mensaje: string) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!(await dentroDelLimite(`error-navegador:${ip}`, 20, 60 * 60_000))) return;
  await guardarError("navegador", `${String(ruta).slice(0, 100)} · ${String(mensaje).slice(0, 300)}`);
}
