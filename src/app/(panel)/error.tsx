"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { anotarErrorNavegador } from "@/app/acciones-errores";

// Pantalla si algo falla al cargar una sección del panel.
export default function ErrorPanel({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    // 12 nov 2026: se guarda para los avisos del CEO (si no se puede guardar, la pantalla sigue igual)
    anotarErrorNavegador(location.pathname, `${error.name}: ${error.message}${error.digest ? ` (código ${error.digest})` : ""}`).catch(() => {});
  }, [error]);
  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="tarjeta max-w-md p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-mal-suave text-mal">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">Esta sección no ha cargado</h1>
        <p className="mt-1 text-sm text-texto-2">Puede ser un fallo puntual de conexión. Prueba otra vez; si se repite, avisa al director{error.digest ? ` con este código: ${error.digest}` : ""}.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={() => retry()} className="btn-primario"><RotateCcw className="h-4 w-4" /> Reintentar</button>
          <Link href="/" className="btn-secundario">Ir al inicio</Link>
        </div>
      </div>
    </main>
  );
}
