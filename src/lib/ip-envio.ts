// Plan GHL, punto 3 (Cristian, 7 nov 2026): la IP de la persona, en el seguimiento del lead. Sin base de datos.
// - Si la landing la manda en `ip` (desde un servidor, como api/signup.js), esa, si es una IP válida.
// - Si la Entrada envía desde el navegador, la de la petición (la primera de x-forwarded-for).
// - Desde un servidor o «no lo sé», sin `ip`: ninguna (la de la petición sería la del servidor, no la de la persona).
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]{2,39}$/i;
const valida = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s && (IPV4.test(s) || (s.includes(":") && IPV6.test(s))) ? s : null;
};

export function ipDelEnvio(o: { cuerpo: Record<string, unknown>; cabecera: string | null; enviaDesde: string | null }) {
  if (o.cuerpo.ip !== undefined && o.cuerpo.ip !== "") return valida(o.cuerpo.ip);
  if (o.enviaDesde !== "navegador") return null;
  return valida(o.cabecera?.split(",")[0]);
}
