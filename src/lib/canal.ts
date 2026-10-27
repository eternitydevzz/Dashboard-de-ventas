// Plan GHL (Cristian, 16 oct 2026): cada cita se mide por el UTM de la página donde reservó
// (`codigomaestria.com/agenda?utm_source=yt`). Las páginas viejas (`/agenda-yt`, `/agenda-ig`) valen igual.
// Sin UTM = «directo». Un UTM que no es de la lista = «otro» (la página queda guardada en la cita).

export const CANALES = ["callers", "yt", "ig", "p1", "email", "biblioteca", "webinar", "dfy", "directo", "otro"] as const;
export type Canal = (typeof CANALES)[number];

export const NOMBRE_CANAL: Record<Canal, string> = {
  callers: "Callers",
  yt: "YouTube",
  ig: "Instagram",
  p1: "Píldora 1",
  email: "Email",
  biblioteca: "Biblioteca",
  webinar: "Webinar",
  dfy: "DFY",
  directo: "Directo",
  otro: "Otro",
};

// Cristian, 17 oct: un solo pipeline de agendas. Todas las citas van a «Agendan» de «0. Agendas General»; el canal
// se ve por la etiqueta «Canal: …» y el filtro (antes, 16 oct, cada cita iba además al pipeline de su canal).
export const PIPELINE_GENERAL = "0. Agendas General";
export const PREFIJO_ETIQUETA = "Canal: ";
export const SIN_CANAL = "sin_canal"; // valor del filtro para las citas sin canal (las de antes del 13 oct)
export const etiquetaCanal = (c: Canal) => `${PREFIJO_ETIQUETA}${NOMBRE_CANAL[c]}`;

// Lo que puede venir en utm_source (en minúsculas). «bibliotec»: errata vista en un link real (15 oct).
const ALIAS: Record<string, Canal> = {
  callers: "callers",
  caller: "callers",
  yt: "yt",
  youtube: "yt",
  ig: "ig",
  instagram: "ig",
  p1: "p1",
  email: "email",
  mail: "email",
  biblioteca: "biblioteca",
  bibliotec: "biblioteca",
  webinar: "webinar",
  dfy: "dfy",
};

// Páginas viejas de agenda (sin UTM)
const PAGINAS: Record<string, Canal> = { "agenda-yt": "yt", "agenda-ig": "ig", "agenda-callers": "callers" };
// Cristian, 27 oct: lo que se reserva en la web de la Biblioteca es canal Biblioteca aunque no lleve UTM
const DOMINIOS: Record<string, Canal> = { "biblioteca.codigomaestria.com": "biblioteca" };

function leerUrl(url: string) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return null;
  }
}

// `url`: página desde la que reservó · `utmSource`: el que GHL ya separó (si viene). Sin ninguno de los dos: null.
export function canalDeOrigen(url?: string | null, utmSource?: string | null): Canal | null {
  const u = url?.trim() ? leerUrl(url.trim()) : null;
  const utm = (utmSource?.trim() || u?.searchParams.get("utm_source")?.trim() || "").toLowerCase();
  if (utm) return ALIAS[utm] ?? "otro";
  if (!u) return null;
  const pagina = u.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  return PAGINAS[pagina] ?? DOMINIOS[u.hostname.toLowerCase()] ?? "directo";
}

// Para guardar la página sin datos personales: el widget de GHL lleva nombre, email y teléfono en la dirección.
// Se queda con la página y los utm_*.
export function limpiarUrl(url?: string | null): string | null {
  const u = url?.trim() ? leerUrl(url.trim()) : null;
  if (!u) return null;
  const utm = [...u.searchParams].filter(([k]) => k.toLowerCase().startsWith("utm_"));
  const q = new URLSearchParams(utm).toString();
  return `${u.origin}${u.pathname}${q ? `?${q}` : ""}`.slice(0, 500);
}

export function nombreCanal(c: string | null | undefined) {
  return c && c in NOMBRE_CANAL ? NOMBRE_CANAL[c as Canal] : null;
}

// Lo que se ve en una cita de GHL (Llamadas y tablero de Closers): «GHL · YouTube»; sin canal, como antes
export function origenCitaGhl(c: { canal?: string | null }) {
  const n = nombreCanal(c.canal);
  return n ? `GHL · ${n}` : "Calendario GHL";
}
