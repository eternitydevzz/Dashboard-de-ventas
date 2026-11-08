// B4 (plan GHL): generador de enlaces con UTM. El enlace trae utm_source y utm_campaign sin repetir parámetros.
import { describe, expect, it } from "vitest";
import { enlaceUtm } from "@/lib/enlace-utm";

describe("enlaceUtm", () => {
  it("añade utm_source y utm_campaign", () => {
    expect(enlaceUtm("https://codigomaestria.com/agenda", "yt", "nov")).toBe("https://codigomaestria.com/agenda?utm_source=yt&utm_campaign=nov");
  });
  it("no repite parámetros: sustituye los que ya traía la landing y respeta los demás", () => {
    const u = new URL(enlaceUtm("codigomaestria.com/agenda?utm_source=ig&utm_campaign=viejo&x=1", "email", "nueva promo")!);
    expect(u.searchParams.getAll("utm_source")).toEqual(["email"]);
    expect(u.searchParams.getAll("utm_campaign")).toEqual(["nueva promo"]);
    expect(u.searchParams.get("x")).toBe("1");
  });
  it("sin campaña no pone utm_campaign; una landing rota da null", () => {
    expect(enlaceUtm("https://codigomaestria.com/agenda", "yt", "  ")).toBe("https://codigomaestria.com/agenda?utm_source=yt");
    expect(enlaceUtm("no es una url", "yt", "x")).toBeNull();
  });
});
