// N3 y N2 (Cristian, 13 nov 2026): foto de perfil obligatoria para todos y zona horaria de cada caller y closer.
// Lo que no depende de Next ni de la base, para poder probarlo.

// La foto se recorta cuadrada y se reduce en el navegador antes de subirla (queda en unos 20-40 KB)
export const LADO_FOTO = 256;
export const MAX_ORIGINAL = 20 * 1024 * 1024; // la que elige la persona (una foto de móvil)
export const MAX_FOTO = 1024 * 1024; // la que llega al servidor ya reducida (igual que el tope del espacio «fotos»)

// Solo rutas que crea guardarMiFoto: <id de la persona>/<uuid>.jpg
export const rutaFotoValida = (ruta: string) => /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(ruta);

// No basta con el tipo que dice el navegador: los primeros bytes de un JPEG son FF D8 FF
export const esJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

// Cristian (13 nov): las 6 zonas en que trabaja el equipo. Solo cambia cómo ve las horas cada uno.
export const ZONAS = [
  { v: "America/Bogota", t: "Colombia" },
  { v: "America/Mexico_City", t: "México" },
  { v: "America/Chicago", t: "Chicago" },
  { v: "America/New_York", t: "Nueva York" },
  { v: "America/Argentina/Buenos_Aires", t: "Argentina" },
  { v: "Europe/Madrid", t: "España" },
] as const;
export type Zona = (typeof ZONAS)[number]["v"];
export const zonaValida = (v: unknown): Zona | null => ZONAS.find((z) => z.v === v)?.v ?? null;

export const conZona = (rol: string) => rol === "caller" || rol === "closer";

// El paso de entrada que le falta (después del de España/Latam). `undefined` en la columna = la base aún no tiene
// la migración: no se pregunta, para no dejar a nadie fuera; null = sin poner.
export function pasoPendiente(p: { rol: string; foto?: string | null; zona_horaria?: string | null }) {
  if (p.foto === null) return "/onboarding/foto";
  if (conZona(p.rol) && p.zona_horaria === null) return "/onboarding/zona";
  return null;
}
