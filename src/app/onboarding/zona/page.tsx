import Image from "next/image";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { guardarMiZona } from "@/app/(panel)/perfil/acciones";
import { MAX_PAIS, ZONAS, conZona, opcionesZona } from "@/app/(panel)/perfil/foto-zona";

// N2 (Cristian, 13 nov): cada caller y closer dice desde qué zona trabaja (como el paso de España/Latam).
// Solo cambia cómo ve las horas; el proyecto y sus cifras siguen en la suya. Se cambia en «Mi perfil».
// A5 (17 nov): «Otro» para quien no está en las 6: escribe de dónde es y elige su hora.
async function elegir(formData: FormData) {
  "use server";
  const pais = formData.get("pais");
  const r = await guardarMiZona(String(formData.get("zona") ?? ""), typeof pais === "string" ? pais : null);
  if (r && "error" in r) redirect("/onboarding/zona?error=1");
  redirect("/");
}

export default async function ZonaPage({ searchParams }: PageProps<"/onboarding/zona">) {
  const { perfil } = await getSesion();
  if (!perfil.onboarding_completo) redirect("/onboarding");
  if (!conZona(perfil.rol) || perfil.zona_horaria !== null) redirect("/"); // ya elegida (o no aplica)
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="tarjeta w-full max-w-md space-y-4 p-6">
        <Image src="/marca/eternity.png" alt="Eternity" width={48} height={48} className="rounded-xl" />
        <h1 className="text-2xl font-semibold">¿Desde dónde trabajas?</h1>
        <p className="text-sm text-texto-2">Así ves las horas en tu zona. Las cifras del equipo siguen en la hora del proyecto. Puedes cambiarlo cuando quieras en «Mi perfil».</p>
        <form action={elegir} className="grid grid-cols-2 gap-2">
          {ZONAS.map((z) => (
            <button key={z.v} name="zona" value={z.v} className="btn-primario justify-center py-3">{z.t}</button>
          ))}
        </form>
        <details className="rounded-lg border border-borde p-3">
          <summary className="cursor-pointer text-sm font-medium">Otro (no estoy en ninguna de estas)</summary>
          <form action={elegir} className="mt-3 space-y-3">
            <label className="block"><span className="etiqueta-campo">¿De dónde eres?</span><input className="campo" name="pais" required maxLength={MAX_PAIS} placeholder="Perú" /></label>
            <label className="block">
              <span className="etiqueta-campo">Elige la hora que es ahora donde estás</span>
              <select className="campo" name="zona" required defaultValue="">
                <option value="" disabled>Elige tu hora…</option>
                {opcionesZona().map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
              </select>
            </label>
            <button className="btn-primario">Guardar</button>
          </form>
        </details>
        {error && <p className="text-sm text-mal">No se pudo guardar. Si elegiste «Otro», escribe de dónde eres y elige tu hora. Si se repite, avisa al director.</p>}
      </div>
    </main>
  );
}
