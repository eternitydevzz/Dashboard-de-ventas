// Plan GHL (16 oct): el canal de cada cita sale del UTM o de la página de agenda. Ejemplos sacados de citas reales.
import { describe, expect, it } from "vitest";
import { CANALES_POR_DEFECTO, canalDeOrigen, limpiarUrl, nombreCanal, type TablaCanales } from "@/lib/canal";

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
});
