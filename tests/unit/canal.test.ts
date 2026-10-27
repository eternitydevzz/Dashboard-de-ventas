// Plan GHL (16 oct): el canal de cada cita sale del UTM o de la página de agenda. Ejemplos sacados de citas reales.
import { describe, expect, it } from "vitest";
import { canalDeOrigen, limpiarUrl, nombreCanal } from "@/lib/canal";

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

  it("sin UTM es «directo»; un UTM desconocido es «otro»; sin datos, null", () => {
    expect(canalDeOrigen("https://codigomaestria.com/agenda")).toBe("directo");
    expect(canalDeOrigen("https://api.leadconnectorhq.com/widget/booking/X7qpsbS2ChORZkwO4O3f")).toBe("directo");
    expect(canalDeOrigen("https://codigomaestria.com/agenda?utm_source=facebook")).toBe("otro");
    expect(canalDeOrigen(null, null)).toBeNull();
    expect(canalDeOrigen("", "")).toBeNull();
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
