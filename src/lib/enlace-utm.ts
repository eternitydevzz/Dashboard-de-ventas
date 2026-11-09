// B4 (plan GHL): enlace de una landing con su canal (utm_source) y campaña (utm_campaign). Cálculo puro.
// Landings de agenda de hoy (plan GHL, sección 7); en el generador también se puede escribir otra. Sin software-demo:
// ahí la página gana al UTM (1.7, 9 nov).
export const LANDINGS = ["https://codigomaestria.com/agenda", "https://codigomaestria.com/agenda-fc"];

// `set` pisa un utm que ya traiga la landing: nunca sale un parámetro repetido. Landing rota: null.
export function enlaceUtm(landing: string, canal: string, campana: string): string | null {
  const l = landing.trim();
  try {
    const u = new URL(/^https?:\/\//i.test(l) ? l : `https://${l}`);
    u.searchParams.set("utm_source", canal);
    if (campana.trim()) u.searchParams.set("utm_campaign", campana.trim());
    return u.toString();
  } catch {
    return null;
  }
}
