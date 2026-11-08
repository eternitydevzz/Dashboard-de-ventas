// Plan GHL (16 oct): el canal de cada cita sale del UTM o de la página de agenda. Ejemplos sacados de citas reales.
import { describe, expect, it } from "vitest";
import { CANALES, CANALES_POR_DEFECTO, canalDeOrigen, etiquetaCanal, limpiarUrl, nombreCanal, opcionesCanal, origenCitaGhl, tablaValida, type TablaCanales } from "@/lib/canal";

describe("canalDeOrigen", () => {
  it("lee utm_source de la página", () => {
    expect(canalDeOrigen("https://codigomaestria.com/agenda?utm_source=callers")).toBe("callers");
    expect(canalDeOrigen("https://codigomaestria.com/agenda?utm_source=callers&utm_source=callers")).toBe("callers");
    expect(canalDeOrigen("https://codigomaestria.com/agenda?utm_source=email")).toBe("email");
    expect(canalDeOrigen("https://codigomaestria.com/agenda?utm_source=YT")).toBe("yt");
    expect(canalDeOrigen("codigomaestria.com/agenda?utm_source=ig")).toBe("ig");
  });

  it("vale el utm del widget de GHL y el que GHL ya separó", () => {
    expect(canalDeOrigen("https://api.leadconnectorhq.com/widget/booking/X7qpsbS2ChORZkwO4O3f?first_name=A&utm_source=callers&inicio=Ahora")).toBe("callers");
    expect(canalDeOrigen("https://codigomaestria.com/agenda", "webinar")).toBe("webinar");
  });

  it("acepta los alias y la errata «bibliotec»", () => {
    expect(canalDeOrigen(null, "bibliotec")).toBe("biblioteca");
    // Plan GHL, A (Cristian, 7 nov): la agenda de la Biblioteca manda `agenda-biblioteca` (cita real del 28 oct salió «otro»)
    expect(canalDeOrigen(null, "agenda-biblioteca")).toBe("biblioteca");
    expect(canalDeOrigen("https://codigomaestria.com/agenda?utm_source=Agenda-Biblioteca")).toBe("biblioteca");
    expect(canalDeOrigen(null, "instagram")).toBe("ig");
    expect(canalDeOrigen(null, "youtube")).toBe("yt");
    expect(canalDeOrigen("https://codigomaestria.com/agenda?utm_source=p1")).toBe("p1"); // Píldora 1 (como en GHL)
  });

  it("las páginas viejas cuentan como su canal", () => {
    expect(canalDeOrigen("https://codigomaestria.com/agenda-yt")).toBe("yt");
    expect(canalDeOrigen("https://codigomaestria.com/agenda-ig/")).toBe("ig");
  });

  it("la web de la Biblioteca es canal Biblioteca sin UTM; si trae UTM, manda el UTM", () => {
    expect(canalDeOrigen("https://biblioteca.codigomaestria.com/recursos")).toBe("biblioteca");
    expect(canalDeOrigen("https://Biblioteca.CodigoMaestria.com/")).toBe("biblioteca");
    expect(canalDeOrigen("https://biblioteca.codigomaestria.com/recursos?utm_source=yt")).toBe("yt");
    expect(canalDeOrigen("http://localhost:4321/recursos.html")).toBe("directo");
  });

  it("Facu y DFY: gana la página aunque traiga utm_source (Cristian, 8 nov)", () => {
    expect(canalDeOrigen("https://codigomaestria.com/agenda-fc")).toBe("facu");
    expect(canalDeOrigen("https://codigomaestria.com/agenda-fc/?utm_source=ig")).toBe("facu");
    expect(canalDeOrigen("codigomaestria.com/agenda-fc/")).toBe("facu");
    expect(canalDeOrigen("https://services.eternity.llc/software-demo")).toBe("dfy");
    expect(canalDeOrigen("https://services.eternity.llc/software-demo?utm_source=prueba")).toBe("dfy");
    expect(canalDeOrigen("https://codigomaestria.com/agenda?utm_source=callers&utm_source=caller")).toBe("callers");
    expect(nombreCanal("facu")).toBe("Facu");
  });

  it("sin UTM es «directo»; un UTM desconocido es «otro»; sin datos, null", () => {
    expect(canalDeOrigen("https://codigomaestria.com/agenda")).toBe("directo");
    expect(canalDeOrigen("https://api.leadconnectorhq.com/widget/booking/X7qpsbS2ChORZkwO4O3f")).toBe("directo");
    expect(canalDeOrigen("https://codigomaestria.com/agenda?utm_source=facebook")).toBe("otro");
    expect(canalDeOrigen(null, null)).toBeNull();
    expect(canalDeOrigen("", "")).toBeNull();
  });

  it("con otra tabla manda la tabla (Plan GHL, B2a)", () => {
    // Filas como las de B2b: «dominio/ruta» gana al UTM; «dominio» solo vale sin UTM; «ruta» es página vieja
    const tabla: TablaCanales = [
      { clave: "ig", nombre: "Instagram", alias: ["TikTok"], paginas: ["agenda-tt", "ig.ejemplo.com"] },
      { clave: "facu", nombre: "Facu", alias: [], paginas: ["codigomaestria.com/agenda-yt"] },
    ];
    expect(canalDeOrigen(null, "tiktok", tabla)).toBe("ig");
    expect(canalDeOrigen(null, "yt", tabla)).toBe("otro"); // ya no está en la tabla
    expect(canalDeOrigen("https://codigomaestria.com/agenda-tt/", null, tabla)).toBe("ig");
    expect(canalDeOrigen("https://codigomaestria.com/agenda-tt?utm_source=facebook", null, tabla)).toBe("otro");
    expect(canalDeOrigen("https://ig.ejemplo.com/hola", null, tabla)).toBe("ig");
    expect(canalDeOrigen("https://ig.ejemplo.com/hola?utm_source=raro", null, tabla)).toBe("otro");
    expect(canalDeOrigen("https://codigomaestria.com/agenda-yt?utm_source=ig", null, tabla)).toBe("facu");
    expect(canalDeOrigen("https://biblioteca.codigomaestria.com/recursos", null, tabla)).toBe("directo");
    expect(canalDeOrigen(null, "yt", CANALES_POR_DEFECTO)).toBe("yt");
    expect(CANALES_POR_DEFECTO.find((c) => c.clave === "dfy")).toEqual({ clave: "dfy", nombre: "DFY", alias: ["dfy"], paginas: ["services.eternity.llc/software-demo"] });
  });

  it("la página se guarda sin datos personales (solo la ruta y los utm)", () => {
    expect(limpiarUrl("https://api.leadconnectorhq.com/widget/booking/X7q?first_name=Ana&email=a@b.com&phone=+1555&utm_source=callers")).toBe(
      "https://api.leadconnectorhq.com/widget/booking/X7q?utm_source=callers"
    );
    expect(limpiarUrl("https://codigomaestria.com/agenda-yt")).toBe("https://codigomaestria.com/agenda-yt");
    expect(limpiarUrl(null)).toBeNull();
  });

  it("nombre para la pantalla", () => {
    expect(nombreCanal("yt")).toBe("YouTube");
    expect(nombreCanal(null)).toBeNull();
    expect(nombreCanal("raro")).toBeNull();
  });

  // Plan GHL B2b: los canales vienen de la base (Administración → Etiquetas y UTMs → Canales)
  const renombrada = CANALES_POR_DEFECTO.map((c) => (c.clave === "yt" ? { ...c, nombre: "YT Ads" } : c));
  it("nombre, etiqueta y origen salen de la tabla; Directo y Otro siguen igual (B2b)", () => {
    expect(nombreCanal("yt", renombrada)).toBe("YT Ads");
    expect(etiquetaCanal("yt", renombrada)).toBe("Canal: YT Ads");
    expect(origenCitaGhl({ canal: "yt" }, renombrada)).toBe("GHL · YT Ads");
    expect(nombreCanal("directo", renombrada)).toBe("Directo");
    expect(etiquetaCanal("otro", renombrada)).toBe("Canal: Otro");
    expect(etiquetaCanal("yt")).toBe("Canal: YouTube"); // sin tabla, como siempre
  });

  it("opciones de los filtros: la tabla en su orden y después Directo y Otro (B2b)", () => {
    expect(opcionesCanal([renombrada[1], renombrada[0]])).toEqual([
      { clave: "yt", nombre: "YT Ads" },
      { clave: "callers", nombre: "Callers" },
      { clave: "directo", nombre: "Directo" },
      { clave: "otro", nombre: "Otro" },
    ]);
    expect(opcionesCanal(CANALES_POR_DEFECTO).map((c) => c.clave)).toEqual([...CANALES]);
  });

  it("al guardar: limpia (sin barras, sin mayúsculas, sin repetidos) y rechaza lo raro (B2b)", () => {
    expect(tablaValida(CANALES_POR_DEFECTO)).toEqual({ ok: CANALES_POR_DEFECTO });
    const con = (clave: string, cambio: object) => CANALES_POR_DEFECTO.map((c) => (c.clave === clave ? { ...c, ...cambio } : c));
    const limpia = tablaValida(con("yt", { nombre: "  YT Ads ", alias: [" YT", "youtube", "yt", ""], paginas: ["/agenda-yt/", "CodigoMaestria.com/agenda-yt2/"] }));
    expect("ok" in limpia && limpia.ok.find((c) => c.clave === "yt")).toEqual({ clave: "yt", nombre: "YT Ads", alias: ["yt", "youtube"], paginas: ["agenda-yt", "codigomaestria.com/agenda-yt2"] });
    // el orden de la lista es el orden
    expect(tablaValida([...CANALES_POR_DEFECTO].reverse())).toEqual({ ok: [...CANALES_POR_DEFECTO].reverse() });
    const error = (x: unknown) => expect(tablaValida(x)).toEqual({ error: expect.any(String) });
    for (const p of ["https://codigomaestria.com/agenda-yt", "agenda yt", "agenda?x=1", "agenda/fc", "recursos.html#a"]) error(con("yt", { paginas: [p] }));
    error(con("yt", { alias: ["y t"] }));
    error(con("yt", { nombre: " " }));
    error(con("yt", { nombre: "instagram" })); // repetido (sin mayúsculas)
    error(con("yt", { nombre: "Directo" })); // es de los fijos
    error(con("yt", { alias: ["ig"] })); // ya es de Instagram
    error(con("yt", { paginas: ["agenda-ig"] }));
    error(CANALES_POR_DEFECTO.slice(1)); // falta uno
    error([...CANALES_POR_DEFECTO, { clave: "directo", nombre: "Directo", alias: [], paginas: [] }]);
    error([...CANALES_POR_DEFECTO, CANALES_POR_DEFECTO[0]]);
    error(null);
    error(con("yt", { alias: "yt" }));
  });
});
