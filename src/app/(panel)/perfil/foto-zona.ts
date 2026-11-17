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
export const esZonaDeLista = (v: unknown) => ZONAS.some((z) => z.v === v);

// A5 (17 nov 2026): «Otro». Vale cualquier zona que entienda el sistema y cumpla el formato que pide la base
// (migración 20261124100000_zona_otro.sql).
const FORMATO_ZONA = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/;
export function zonaValida(v: unknown): string | null {
  if (typeof v !== "string" || !FORMATO_ZONA.test(v)) return null;
  if (esZonaDeLista(v)) return v;
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return v;
  } catch {
    return null;
  }
}

// Las del sistema más las 6 (Node no lista America/Argentina/Buenos_Aires), sin repetir
export function todasLasZonas(): string[] {
  const sistema = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [...new Set([...sistema, ...ZONAS.map((z) => z.v)])].filter((z) => zonaValida(z) !== null);
}

export function horaEnZona(zona: string, ahora: Date): string {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ahora);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "00";
  return `${parte("hour")}:${parte("minute")}`;
}

// El desplegable de «Otro»: cada zona con la hora que es ahora allí, ordenadas por hora (la persona busca la suya)
export function opcionesZona(ahora = new Date()) {
  return todasLasZonas()
    .map((v) => ({ v, t: `${horaEnZona(v, ahora)} · ${v.replaceAll("_", " ")}` }))
    .sort((a, b) => a.t.localeCompare(b.t));
}

export const MAX_PAIS = 80;
export function paisValido(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const p = v.trim();
  return p.length >= 1 && p.length <= MAX_PAIS ? p : null;
}

export const conZona = (rol: string) => rol === "caller" || rol === "closer";

// El paso de entrada que le falta (después del de España/Latam). `undefined` en la columna = la base aún no tiene
// la migración: no se pregunta, para no dejar a nadie fuera; null = sin poner.
export function pasoPendiente(p: { rol: string; foto?: string | null; zona_horaria?: string | null }) {
  if (p.foto === null) return "/onboarding/foto";
  if (conZona(p.rol) && p.zona_horaria === null) return "/onboarding/zona";
  return null;
}
