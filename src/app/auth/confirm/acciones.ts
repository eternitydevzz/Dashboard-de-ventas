"use server";

import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";

// A1 (Cristian, 17 nov 2026): el enlace mágico se gasta aquí, al pulsar «Entrar» (POST), y no al abrir el email.
// Es pública a propósito (quien llega aún no tiene sesión): la prueba de quién es la da el propio código del enlace.
// Si va bien, deja la sesión iniciada (cookies) y lleva a /entrando; si el enlace ya se usó o caducó, al login con aviso.
export async function entrar(formData: FormData): Promise<void> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const tipo = String(formData.get("type") ?? "");
  const siguiente = formData.get("siguiente") === "perfil";
  if (tipo !== "magiclink" || !tokenHash || tokenHash.length > 500) redirect("/login?error=enlace");
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error) redirect("/login?error=enlace");
  // Primero la pantalla de entrada con la marca (Cristian, 12 oct): ella lleva luego al destino
  redirect(siguiente ? "/entrando?siguiente=perfil" : "/entrando");
}
