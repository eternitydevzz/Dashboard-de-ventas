// Plan GHL (Cristian, 16 oct 2026): cada cita se mide por el UTM de la página donde reservó
// (`codigomaestria.com/agenda?utm_source=yt`). Las páginas viejas (`/agenda-yt`, `/agenda-ig`) valen igual.
// Excepción (Cristian, 8 nov): en `agenda-fc` (Facu) y `software-demo` (DFY) gana la página, aunque traiga utm_source.
// Sin UTM = «directo». Un UTM que no es de la lista = «otro» (la página queda guardada en la cita).

export const CANALES = ["callers", "yt", "ig", "p1", "email", "biblioteca", "webinar", "dfy", "facu", "directo", "otro"] as const;
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
  facu: "Facu",
  directo: "Directo",
  otro: "Otro",
};

// Cristian, 17 oct: un solo pipeline de agendas. Todas las citas van a «Agendan» de «0. Agendas General»; el canal
// se ve por la etiqueta «Canal: …» y el filtro (antes, 16 oct, cada cita iba además al pipeline de su canal).
export const PIPELINE_GENERAL = "0. Agendas General";
export const PREFIJO_ETIQUETA = "Canal: ";
export const SIN_CANAL = "sin_canal"; // valor del filtro para las citas sin canal (las de antes del 13 oct)
export const etiquetaCanal = (c: Canal) => `${PREFIJO_ETIQUETA}${NOMBRE_CANAL[c]}`;

// Una fila por canal, como las guardará B2b (el orden de la lista es el orden). `alias`: lo que puede venir en
// utm_source (sin mayúsculas). `paginas`: «dominio/ruta» gana al UTM (Cristian, 8 nov: agenda-fc y software-demo);
// «dominio» (con punto) vale solo sin UTM; «ruta» (sin punto) es una página vieja de agenda, sin UTM.
export type TablaCanales = { clave: Canal; nombre: string; alias: string[]; paginas: string[] }[];

const fila = (clave: Canal, alias: string[], paginas: string[] = []) => ({ clave, nombre: NOMBRE_CANAL[clave], alias, paginas });

// Semilla de B2b. «bibliotec»: errata vista en un link real (15 oct). «agenda-biblioteca»: lo que manda la agenda de la
// Biblioteca (Cristian, 7 nov). biblioteca.codigomaestria.com es Biblioteca aunque no lleve UTM (Cristian, 27 oct).
export const CANALES_POR_DEFECTO: TablaCanales = [
  fila("callers", ["callers", "caller"], ["agenda-callers"]),
  fila("yt", ["yt", "youtube"], ["agenda-yt"]),
  fila("ig", ["ig", "instagram"], ["agenda-ig"]),
  fila("p1", ["p1"]),
  fila("email", ["email", "mail"]),
  fila("biblioteca", ["biblioteca", "bibliotec", "agenda-biblioteca"], ["biblioteca.codigomaestria.com"]),
  fila("webinar", ["webinar"]),
  fila("dfy", ["dfy"], ["services.eternity.llc/software-demo"]),
  fila("facu", [], ["codigomaestria.com/agenda-fc"]),
];

// Primer canal de la tabla con un valor de `lista` igual a `v` (sin mayúsculas)
function buscar(tabla: TablaCanales, lista: (c: TablaCanales[number]) => string[], v: string) {
  return tabla.find((c) => lista(c).some((x) => x.toLowerCase() === v))?.clave;
}

function leerUrl(url: string) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return null;
  }
}

// `url`: página desde la que reservó · `utmSource`: el que GHL ya separó (si viene). Sin ninguno de los dos: null.
// `tabla`: los canales como dato (Plan GHL, B2a); sin ella, los de siempre. Aquí no se lee la base: lo importa un cliente.
export function canalDeOrigen(url?: string | null, utmSource?: string | null, tabla: TablaCanales = CANALES_POR_DEFECTO): Canal | null {
  const u = url?.trim() ? leerUrl(url.trim()) : null;
  const fijas = (c: TablaCanales[number]) => c.paginas.filter((p) => p.includes("/"));
  const fija = u && buscar(tabla, fijas, `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "").toLowerCase()}`);
  if (fija) return fija;
  const utm = (utmSource?.trim() || u?.searchParams.get("utm_source")?.trim() || "").toLowerCase();
  if (utm) return buscar(tabla, (c) => c.alias, utm) ?? "otro";
  if (!u) return null;
  const pagina = u.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  const rutas = (c: TablaCanales[number]) => c.paginas.filter((p) => !p.includes("/") && !p.includes("."));
  const dominios = (c: TablaCanales[number]) => c.paginas.filter((p) => !p.includes("/") && p.includes("."));
  return buscar(tabla, rutas, pagina) ?? buscar(tabla, dominios, u.hostname.toLowerCase()) ?? "directo";
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
