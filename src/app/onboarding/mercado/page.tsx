import Image from "next/image";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { leerMercado } from "@/lib/mercado-datos";
import { MERCADOS } from "@/lib/mercado";
import { guardarMiMercado } from "@/app/(panel)/perfil/acciones";

// 13 nov (Cristian): al entrar, quien aún no lo ha elegido dice si trabaja desde España o desde Latinoamérica.
// Con eso ve sus links de agenda y de pago, recursos, guion y manuales. Lo puede cambiar en «Mi perfil».
async function elegir(formData: FormData) {
  "use server";
  const r = await guardarMiMercado(String(formData.get("mercado") ?? ""));
  if (r && "error" in r) redirect("/onboarding/mercado?error=1");
  redirect("/");
}

export default async function MercadoPage({ searchParams }: PageProps<"/onboarding/mercado">) {
  const { perfil, proyecto } = await getSesion();
  if (!perfil.onboarding_completo) redirect("/onboarding");
  if ((await leerMercado(proyecto.id, perfil.id)) !== null) redirect("/"); // ya elegido (o no aplica)
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={elegir} className="tarjeta w-full max-w-md space-y-4 p-6">
        <Image src="/marca/eternity.png" alt="Eternity" width={48} height={48} className="rounded-xl" />
        <h1 className="text-2xl font-semibold">¿Trabajas desde España o desde Latinoamérica?</h1>
        <p className="text-sm text-texto-2">Así ves los links de agenda y de pago, los recursos, el guion y los manuales de tu equipo en {proyecto.nombre}. Puedes cambiarlo cuando quieras en «Mi perfil».</p>
        <div className="grid grid-cols-2 gap-2">
          {MERCADOS.map((m) => (
            <button key={m.v} name="mercado" value={m.v} className="btn-primario justify-center py-3">{m.v === "es" ? "Desde España" : "Desde Latinoamérica"}</button>
          ))}
        </div>
        {error && <p className="text-sm text-mal">No se pudo guardar. Inténtalo de nuevo y, si se repite, avisa al director.</p>}
      </form>
    </main>
  );
}
