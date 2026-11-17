import Image from "next/image";
import { FormularioLogin, PedirEnlace } from "./formulario";

const ERRORES: Record<string, string> = {
  "sin-acceso": "Tu usuario está desactivado. Habla con tu director.",
  "sin-conexion": "Ahora mismo no podemos conectar con la base de datos. Tu usuario está bien: espera un minuto y vuelve a entrar.",
  "sin-proyecto": "Todavía no tienes ningún proyecto asignado. Habla con tu director.",
  enlace: "Ese enlace ya se usó o ha caducado (dura 24 horas). Usa el último email que te llegó: cada enlace nuevo anula los anteriores. También puedes entrar con tu contraseña o pedir otro aquí abajo («¿No puedes entrar?»).",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const aviso = typeof error === "string" ? ERRORES[error] : undefined;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image src="/marca/eternity.png" alt="Eternity" width={64} height={64} className="rounded-2xl" priority />
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Eternity</h1>
            <p className="text-sm text-texto-3">Panel de ventas del equipo</p>
          </div>
        </div>
        <div className="tarjeta p-6">
          {aviso && <p className="mb-4 rounded-lg bg-aviso-suave px-3 py-2 text-sm text-aviso">{aviso}</p>}
          <FormularioLogin />
          <div className="mt-5 border-t border-borde pt-4">
            <PedirEnlace />
          </div>
        </div>
      </div>
    </main>
  );
}
