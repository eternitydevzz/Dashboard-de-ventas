// Política de seguridad del navegador (guía «Content Security Policy» de Next 16, con nonces).
// Arreglo 36: los scripts solo se ejecutan si llevan el nonce de esa petición (ya no 'unsafe-inline');
// Next pone el nonce solo en sus scripts porque todas las páginas se generan en cada petición.
// Los estilos mantienen 'unsafe-inline': el nonce no cubre los atributos style="…" que usa la app.
// El navegador solo habla con Supabase para subir archivos (PDF y CSV) con un enlace firmado y, desde el
// 17 oct 2026, para los avisos en vivo (WebSocket, sin datos).
export function politicaCsp(nonce: string, desarrollo = process.env.NODE_ENV === "development") {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
  // Velocidad (17 oct 2026): el tiempo real (avisos-en-vivo.tsx) habla con Supabase por WebSocket (wss://)
  const supabaseWs = supabase.replace(/^http/, "ws");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desarrollo ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${supabase ? ` ${supabase} ${supabaseWs}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(desarrollo ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

// C9 (plan Callers, 7 nov): los manuales son .html propios que se ven dentro de la app. Se sirven aparte
// (/api/manuales/<id>) con esta política: «sandbox» sin allow-same-origin = origen propio y vacío, así que sus
// scripts (índice, modo oscuro) corren pero no pueden leer la sesión, las cookies ni la página de la app, ni mandar
// datos a ningún sitio (connect-src 'none'). Solo la app puede enmarcarlo (frame-ancestors 'self').
export const CSP_VISOR = [
  "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox",
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com data:",
  "img-src https: data: blob:",
  "media-src https: data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join("; ");
