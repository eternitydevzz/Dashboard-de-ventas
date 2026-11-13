import Image from "next/image";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { FormMiFoto } from "@/app/(panel)/perfil/cliente";

// N3 (Cristian, 13 nov): sin foto no se entra a la app (todos los roles). Se cambia después en «Mi perfil».
export default async function FotoPage() {
  const { perfil } = await getSesion();
  if (!perfil.onboarding_completo) redirect("/onboarding");
  const foto = perfil.foto;
  if (foto !== null) redirect("/"); // ya tiene (o la base aún no tiene la columna)
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="tarjeta w-full max-w-md space-y-4 p-6">
        <Image src="/marca/eternity.png" alt="Eternity" width={48} height={48} className="rounded-xl" />
        <h1 className="text-2xl font-semibold">Pon tu foto de perfil</h1>
        <p className="text-sm text-texto-2">Así el equipo te reconoce. Puedes cambiarla cuando quieras en «Mi perfil».</p>
        <FormMiFoto nombre={perfil.nombre} foto={null} entrada />
      </div>
    </main>
  );
}
