import Image from "next/image";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { guardarMiZona } from "@/app/(panel)/perfil/acciones";
import { ZONAS, conZona } from "@/app/(panel)/perfil/foto-zona";

// N2 (Cristian, 13 nov): cada caller y closer dice desde qué zona trabaja (como el paso de España/Latam).
// Solo cambia cómo ve las horas; el proyecto y sus cifras siguen en la suya. Se cambia en «Mi perfil».
async function elegir(formData: FormData) {
  "use server";
  const r = await guardarMiZona(String(formData.get("zona") ?? ""));
  if (r && "error" in r) redirect("/onboarding/zona?error=1");
  redirect("/");
}

export default async function ZonaPage({ searchParams }: PageProps<"/onboarding/zona">) {
  const { perfil } = await getSesion();
  if (!perfil.onboarding_completo) redirect("/onboarding");
  if (!conZona(perfil.rol) || (perfil as { zona_horaria?: string | null }).zona_horaria !== null) redirect("/"); // ya elegida (o no aplica)
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={elegir} className="tarjeta w-full max-w-md space-y-4 p-6">
        <Image src="/marca/eternity.png" alt="Eternity" width={48} height={48} className="rounded-xl" />
        <h1 className="text-2xl font-semibold">¿Desde dónde trabajas?</h1>
        <p className="text-sm text-texto-2">Así ves las horas en tu zona. Las cifras del equipo siguen en la hora del proyecto. Puedes cambiarlo cuando quieras en «Mi perfil».</p>
        <div className="grid grid-cols-2 gap-2">
          {ZONAS.map((z) => (
            <button key={z.v} name="zona" value={z.v} className="btn-primario justify-center py-3">{z.t}</button>
          ))}
        </div>
        {error && <p className="text-sm text-mal">No se pudo guardar. Inténtalo de nuevo y, si se repite, avisa al director.</p>}
      </form>
    </main>
  );
}
