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

// B2b: el nombre sale de la tabla del proyecto (se puede renombrar); Directo y Otro no son filas
export function nombreCanal(c: string | null | undefined, tabla: TablaCanales = CANALES_POR_DEFECTO) {
  return tabla.find((x) => x.clave === c)?.nombre ?? (c && c in NOMBRE_CANAL ? NOMBRE_CANAL[c as Canal] : null);
}
export const etiquetaCanal = (c: Canal, tabla: TablaCanales = CANALES_POR_DEFECTO) => `${PREFIJO_ETIQUETA}${nombreCanal(c, tabla)}`;

// Opciones de los filtros de canal: los de la tabla en su orden y, al final, Directo y Otro
export const opcionesCanal = (tabla: TablaCanales) => [...tabla, ...(["directo", "otro"] as const).map((clave) => ({ clave, nombre: NOMBRE_CANAL[clave] }))].map(({ clave, nombre }) => ({ clave, nombre }));

// Lo que se ve en una cita de GHL (Llamadas y tablero de Closers): «GHL · YouTube»; sin canal, como antes
export function origenCitaGhl(c: { canal?: string | null }, tabla: TablaCanales = CANALES_POR_DEFECTO) {
  const n = nombreCanal(c.canal, tabla);
  return n ? `GHL · ${n}` : "Calendario GHL";
}

// B2b · al guardar la tabla desde Administración: las 9 claves fijas una vez cada una (Directo y Otro no son filas),
// nombres sin repetir, y alias y páginas sin mayúsculas, sin barras de los lados y de un solo canal.
// Página = «dominio/ruta», «dominio» (con punto) o «ruta» (sin punto ni barra), como las lee canalDeOrigen.
const CLAVES_FILA: readonly Canal[] = CANALES.filter((c) => c !== "directo" && c !== "otro");
const ALIAS = /^[a-z0-9._~-]{1,100}$/;
const PAGINA = /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[a-z0-9._~-]+)*|[a-z0-9_~-]+)$/;
export function tablaValida(filas: unknown): { ok: TablaCanales } | { error: string } {
  if (!Array.isArray(filas) || filas.length !== CLAVES_FILA.length) return { error: `Tienen que estar los ${CLAVES_FILA.length} canales.` };
  const ok: TablaCanales = [];
  const usados = new Map<string, string>(); // alias o página → nombre del canal que ya lo tiene
  for (const f of filas as Record<string, unknown>[]) {
    const clave = f?.clave as Canal;
    if (!CLAVES_FILA.includes(clave) || ok.some((c) => c.clave === clave)) return { error: "Canal no válido o repetido." };
    const nombre = typeof f.nombre === "string" ? f.nombre.trim() : "";
    if (!nombre || nombre.length > 40) return { error: "Cada canal necesita un nombre (hasta 40 letras)." };
    if ([...ok.map((c) => c.nombre), NOMBRE_CANAL.directo, NOMBRE_CANAL.otro].some((n) => n.toLowerCase() === nombre.toLowerCase())) return { error: `El nombre «${nombre}» ya está cogido.` };
    if (!Array.isArray(f.alias) || !Array.isArray(f.paginas)) return { error: `Alias o páginas no válidos en «${nombre}».` };
    const unicos = (xs: string[]) => [...new Set(xs.filter(Boolean))];
    const limpio = (x: unknown) => String(x ?? "").trim().toLowerCase();
    const alias = unicos(f.alias.map(limpio));
    const paginas = unicos(f.paginas.map((x) => limpio(x).replace(/^\/+|\/+$/g, "")));
    const mal = alias.find((a) => !ALIAS.test(a)) ?? paginas.find((p) => p.length > 200 || !PAGINA.test(p));
    if (mal) return { error: `«${mal}» no vale en «${nombre}» (página: dominio/ruta, dominio o ruta, sin https:// ni ?).` };
    for (const x of [...alias.map((a) => `alias «${a}»`), ...paginas.map((p) => `página «${p}»`)]) {
      if (usados.has(x)) return { error: `El ${x} ya es de «${usados.get(x)}».` };
      usados.set(x, nombre);
    }
    ok.push({ clave, nombre, alias, paginas });
  }
  return { ok };
}
