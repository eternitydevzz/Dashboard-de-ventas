"use client";

import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { refrescarTodo, tokenTiempoReal } from "@/app/(panel)/acciones-globales";

// Velocidad (17 oct 2026), tiempo real: escucha el canal privado del proyecto (avisos de la base, sin datos;
// migración 20261017150000_avisos_en_vivo) y, cuando alguien cambia leads, citas, tarjetas o ventas, vuelve a
// pedir la página que se está viendo. Varios avisos seguidos = un solo refresco. Con la pestaña oculta, espera a
// que vuelva a estar a la vista. Si el canal no conecta, la app sigue igual que antes (sin tiempo real).
const ESPERA_MS = 1500;

// 17 oct 2026: la sesión la da el servidor (tokenTiempoReal), ya renovada por el proxy. Con `accessToken`, el cliente
// del navegador no renueva ni borra la sesión (antes, createBrowserClient la renovaba a la vez que el servidor: dos
// renovaciones con el mismo token, errores 400 y riesgo de sacar a la persona). El tiempo real pide el token en cada
// latido (~25 s): se guarda en la pestaña y solo se pide de nuevo cuando le quedan menos de 5 min.
const MARGEN_MS = 5 * 60_000;
let guardado: { token: string; caduca: number } | null = null;
function caducidad(token: string) {
  try {
    const carga = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(carga)) as { exp: number }).exp * 1000;
  } catch {
    return 0;
  }
}
async function tokenDeSesion() {
  if (guardado && guardado.caduca - Date.now() > MARGEN_MS) return guardado.token;
  const token = await tokenTiempoReal().catch(() => null);
  if (!token) return guardado?.token ?? "";
  guardado = { token, caduca: caducidad(token) };
  return token;
}

// APAGADO (25 oct 2026, Cristian): con 10 personas trabajando, cada cambio hacía que todas las pestañas recargaran
// su pantalla y volvieran a precargar las 16 secciones (refrescarTodo): hasta 10.700 peticiones a Supabase cada
// 5 min y la base del plan gratis se quedó colgada. F8 (plan Callers, 7 nov): el refresco de antes (cada 60 s en
// CRM y Callers) tampoco volvió: se quitó en el commit e06b1bf. Callers y CRM se ponen al día al navegar o al guardar.
const ACTIVO = false;

export function AvisosEnVivo({ proyectoId }: { proyectoId: string }) {
  useEffect(() => {
    if (!ACTIVO) return;
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { accessToken: tokenDeSesion });
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let pendiente = false;
    let vivo = true;

    const refrescar = () => {
      if (document.visibilityState === "visible") {
        pendiente = false;
        // Todo lo guardado (las secciones se guardan 5 min): así ninguna enseña datos de antes del cambio
        void refrescarTodo().catch((e) => console.warn("[avisos en vivo] refrescar", e));
      } else {
        pendiente = true;
      }
    };
    const alAviso = () => {
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(refrescar, ESPERA_MS);
    };
    const alVolver = () => {
      if (pendiente && document.visibilityState === "visible") refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);

    const canal = supabase.channel(`proyecto:${proyectoId}`, { config: { private: true } });
    void tokenDeSesion().then((token) => supabase.realtime.setAuth(token)).then(() => {
      if (!vivo) return;
      canal.on("broadcast", { event: "cambio" }, alAviso).subscribe((estado, error) => {
        if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") console.warn("[avisos en vivo]", estado, error?.message ?? "");
      });
    });

    return () => {
      vivo = false;
      if (temporizador) clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", alVolver);
      void supabase.removeChannel(canal);
    };
  }, [proyectoId]);
  return null;
}
