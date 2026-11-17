import Image from "next/image";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { entrar } from "./acciones";

// A1 (Cristian, 17 nov 2026): aquí llega el enlace mágico del email. Abrirlo NO lo gasta (lo abren también los
// lectores de correo, los antivirus y las vistas previas, y a veces la persona dos veces): solo enseña el botón
// «Entrar», que lo gasta (acciones.ts). Si ya hay sesión, entra directo sin gastarlo.
const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function ConfirmarPage({ searchParams }: PageProps<"/auth/confirm">) {
  const sp = await searchParams;
  const tokenHash = texto(sp.token_hash);
  const perfil = texto(sp.siguiente) === "perfil";
  if (texto(sp.type) !== "magiclink" || !tokenHash || tokenHash.length > 500) redirect("/login?error=enlace");

  const { data } = await (await createSessionClient()).auth.getClaims();
  if (data?.claims?.sub) redirect(perfil ? "/entrando?siguiente=perfil" : "/entrando");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={entrar} className="tarjeta w-full max-w-md space-y-4 p-6">
        <Image src="/marca/eternity.png" alt="Eternity" width={48} height={48} className="rounded-xl" />
        <h1 className="text-2xl font-semibold">Entrar en Eternity</h1>
        <p className="text-sm text-texto-2">Pulsa el botón para entrar en la app de ventas. El enlace solo vale una vez.</p>
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value="magiclink" />
        {perfil && <input type="hidden" name="siguiente" value="perfil" />}
        <button className="btn-primario w-full justify-center py-3">Entrar</button>
      </form>
    </main>
  );
}
