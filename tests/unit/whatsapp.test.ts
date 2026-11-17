import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatIdDe, enviarWhatsapp, whatsappConfigurado } from "@/lib/whatsapp";

// Fase D: cliente de WhatsApp (WAHA) para avisos al equipo. Nunca se llama a un WAHA de verdad:
// fetch está simulado en cada test y la clave es de mentira.
const URL_WAHA = "https://waha-prueba.example.com";
const CLAVE = "clave-de-prueba-123";

function ponerConfig() {
  vi.stubEnv("WAHA_URL", URL_WAHA);
  vi.stubEnv("WAHA_API_KEY", CLAVE);
  vi.stubEnv("WAHA_SESION", "");
}

beforeEach(() => {
  vi.stubEnv("WAHA_URL", "");
  vi.stubEnv("WAHA_API_KEY", "");
  vi.stubEnv("WAHA_SESION", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("chatIdDe", () => {
  it("convierte un teléfono con +, espacios y guiones en <cifras>@c.us", () => {
    expect(chatIdDe("+34 600-111-222")).toBe("34600111222@c.us");
    expect(chatIdDe("(34) 600.111.222")).toBe("34600111222@c.us");
  });
  it("devuelve null si hay menos de 8 o más de 15 cifras", () => {
    expect(chatIdDe("123")).toBeNull();
    expect(chatIdDe("1234567890123456")).toBeNull();
  });
  it("deja tal cual un id de grupo o de chat ya formado", () => {
    expect(chatIdDe("120363012345678901@g.us")).toBe("120363012345678901@g.us");
    expect(chatIdDe("34600111222@c.us")).toBe("34600111222@c.us");
    expect(chatIdDe("34600111222-1500000000@g.us")).toBe("34600111222-1500000000@g.us");
  });
  it("rechaza ids con letras antes de la @ y valores vacíos", () => {
    expect(chatIdDe("abc@g.us")).toBeNull();
    expect(chatIdDe("@c.us")).toBeNull();
    expect(chatIdDe(null)).toBeNull();
    expect(chatIdDe(undefined)).toBeNull();
    expect(chatIdDe("")).toBeNull();
    expect(chatIdDe("hola")).toBeNull();
  });
});

describe("whatsappConfigurado", () => {
  it("false sin variables y true con WAHA_URL y WAHA_API_KEY", () => {
    expect(whatsappConfigurado()).toBe(false);
    vi.stubEnv("WAHA_URL", URL_WAHA);
    expect(whatsappConfigurado()).toBe(false);
    vi.stubEnv("WAHA_API_KEY", CLAVE);
    expect(whatsappConfigurado()).toBe(true);
  });
});

describe("enviarWhatsapp", () => {
  it("sin WAHA_URL no llama a fetch y todo va a fallos con «sin configurar»", async () => {
    vi.stubEnv("WAHA_API_KEY", CLAVE);
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const r = await enviarWhatsapp(["34600111222@c.us", "120363012345678901@g.us"], "Hola equipo");
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(r.enviados).toEqual([]);
    expect(r.fallos).toHaveLength(2);
    for (const f of r.fallos) expect(f.motivo).toBe("WhatsApp sin configurar (WAHA_URL / WAHA_API_KEY)");
  });

  it("sin WAHA_API_KEY tampoco llama a fetch", async () => {
    vi.stubEnv("WAHA_URL", URL_WAHA);
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const r = await enviarWhatsapp(["34600111222@c.us"], "Hola");
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(r.fallos[0].motivo).toContain("sin configurar");
  });

  it("con texto vacío no llama a fetch y todo va a fallos", async () => {
    ponerConfig();
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const r = await enviarWhatsapp(["34600111222@c.us"], "   ");
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(r.enviados).toEqual([]);
    expect(r.fallos).toHaveLength(1);
  });

  it("quita repetidos y hace un POST por destino con la clave y el cuerpo de WAHA", async () => {
    ponerConfig();
    const fetchFalso = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchFalso);
    const r = await enviarWhatsapp(["34600111222@c.us", "120363012345678901@g.us", "34600111222@c.us"], "Cita nueva");
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    const chats: string[] = [];
    for (const [url, init] of fetchFalso.mock.calls as unknown as [string, RequestInit][]) {
      expect(url).toBe(`${URL_WAHA}/api/sendText`);
      expect(init.method).toBe("POST");
      const cab = init.headers as Record<string, string>;
      expect(cab["X-Api-Key"]).toBe(CLAVE);
      expect(cab["Content-Type"]).toBe("application/json");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      const cuerpo = JSON.parse(String(init.body)) as { session: string; chatId: string; text: string };
      expect(cuerpo.session).toBe("default");
      expect(cuerpo.text).toBe("Cita nueva");
      chats.push(cuerpo.chatId);
    }
    expect(chats.sort()).toEqual(["120363012345678901@g.us", "34600111222@c.us"]);
    expect(r.enviados.sort()).toEqual(["120363012345678901@g.us", "34600111222@c.us"]);
    expect(r.fallos).toEqual([]);
  });

  it("usa WAHA_SESION si está y quita la barra final de WAHA_URL", async () => {
    vi.stubEnv("WAHA_URL", `${URL_WAHA}/`);
    vi.stubEnv("WAHA_API_KEY", CLAVE);
    vi.stubEnv("WAHA_SESION", "equipo");
    const fetchFalso = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchFalso);
    await enviarWhatsapp(["34600111222@c.us"], "Hola");
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${URL_WAHA}/api/sendText`);
    expect(JSON.parse(String(init.body)).session).toBe("equipo");
  });

  it("si WAHA responde 500 a uno, ese va a fallos y el otro a enviados", async () => {
    ponerConfig();
    const fetchFalso = vi.fn(async (_url: string, init: RequestInit) => {
      const { chatId } = JSON.parse(String(init.body)) as { chatId: string };
      return chatId === "34600111222@c.us" ? new Response("error", { status: 500 }) : new Response("{}", { status: 201 });
    });
    vi.stubGlobal("fetch", fetchFalso);
    const r = await enviarWhatsapp(["34600111222@c.us", "120363012345678901@g.us"], "Venta cerrada");
    expect(r.enviados).toEqual(["120363012345678901@g.us"]);
    expect(r.fallos).toHaveLength(1);
    expect(r.fallos[0].destino).toBe("34600111222@c.us");
    expect(r.fallos[0].motivo).toContain("500");
    expect(r.fallos[0].motivo).not.toContain(CLAVE);
  });

  it("si fetch lanza (tiempo agotado o red), va a fallos sin lanzar y sin la clave", async () => {
    ponerConfig();
    const fetchFalso = vi.fn(async () => {
      throw new DOMException(`The operation was aborted due to timeout (${CLAVE})`, "TimeoutError");
    });
    vi.stubGlobal("fetch", fetchFalso);
    const r = await enviarWhatsapp(["34600111222@c.us"], "Hola");
    expect(r.enviados).toEqual([]);
    expect(r.fallos).toHaveLength(1);
    expect(r.fallos[0].destino).toBe("34600111222@c.us");
    expect(r.fallos[0].motivo.length).toBeGreaterThan(0);
    expect(r.fallos[0].motivo).not.toContain(CLAVE);
  });

  it("un error de red cualquiera tampoco lanza", async () => {
    ponerConfig();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    await expect(enviarWhatsapp(["34600111222@c.us"], "Hola")).resolves.toEqual({
      enviados: [],
      fallos: [{ destino: "34600111222@c.us", motivo: expect.any(String) }],
    });
  });
});
