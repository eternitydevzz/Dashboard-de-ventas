import type { NextConfig } from "next";

const desarrollo = process.env.NODE_ENV === "development";

// La política de seguridad del navegador (CSP) la pone src/proxy.ts en cada petición, con un nonce
// nuevo (arreglo 36; ver src/lib/csp.ts). Aquí quedan las demás cabeceras de seguridad.
const cabeceras = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // C10 (plan Callers, 7 nov): el micrófono, solo para la propia app (grabar la llamada desde el guion)
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
  ...(desarrollo ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

// cacheComponents desactivado: es un panel privado por usuario,
// todas las páginas dependen de la sesión y se renderizan en cada petición.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Los archivos ya no pasan por las acciones (van directos a Supabase); por debajo de los 4,5 MB de Vercel
    serverActions: { bodySizeLimit: "4mb" },
    // Cuánto guarda el navegador cada pantalla (17 oct 2026, Cristian: 5 min). Según la guía de Next 16 (staleTimes):
    // · static: lo precargado completo (prefetch={true}, las 3 secciones del menú de cada rol) y las páginas estáticas.
    // · dynamic (Next trae 0 s): lo ya visitado y la precarga por defecto (solo hasta loading.tsx, sin datos).
    // Mientras dure, volver a esa pantalla enseña lo guardado sin preguntar al servidor: un cambio de OTRO puede tardar
    // hasta 5 min en verse (avisos-en-vivo.tsx está apagado desde el 25 oct). Lo borran revalidatePath (refrescarTodo),
    // router.refresh y cambiar cookies en una acción; refrescarPantalla() (refresh) recarga la pantalla actual y la guía
    // no dice que borre las demás.
    staleTimes: { static: 300, dynamic: 300 },
  },
  async headers() {
    // C9 (plan Callers, 7 nov): un manual (/api/manuales/<id>) se enmarca dentro de la propia app; el resto, nunca
    const sinMarco = cabeceras.filter((c) => c.key !== "X-Frame-Options");
    return [
      { source: "/((?!api/manuales/).*)", headers: cabeceras },
      { source: "/api/manuales/:id", headers: [...sinMarco, { key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};

export default nextConfig;
