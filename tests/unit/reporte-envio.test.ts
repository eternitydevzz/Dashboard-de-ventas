// Fase C: el reporte de España sale a su hora de Madrid y el de USA a su hora de Nueva York, una vez por día de su zona.
// Base, email y números simulados: no se toca ninguna base ni se manda ningún email de verdad.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const P = "11111111-1111-1111-1111-111111111111";
const SECRETO = "secreto-del-proyecto";
const PROYECTO = { id: P, nombre: "Test", moneda: "EUR", zona_horaria: "Europe/Madrid", webhook_secreto: SECRETO, color: "#000" };

let config: Record<string, unknown>[]; // filas de reporte_config
let configError: { message: string } | null;
let envios: string[]; // «proyecto|mercado|fecha» ya reservadas
let reservas: Record<string, unknown>[]; // lo que se intentó reservar
const enviar = vi.fn();
const datos = vi.fn();
// Fase D: WhatsApp simulado (no se llama a ningún WAHA); chatIdDe es el de verdad
let waConfigurado: boolean;
const enviarWa = vi.fn();
let waFilas: Record<string, unknown>[]; // lo que se apuntó en whatsapp_envios
let waOpciones: unknown[];
let waError: { message: string } | null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      if (tabla === "reporte_config") return { select: () => ({ eq: async () => ({ data: config, error: configError }) }) };
      if (tabla === "proyectos")
        return { select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: id === P ? PROYECTO : null, error: null }) }) }) };
      if (tabla === "reporte_envios")
        return {
          upsert: (f: { proyecto_id: string; mercado: string; fecha: string }, o: unknown) => ({
            select: async () => {
              reservas.push({ ...f, opciones: o });
              const k = `${f.proyecto_id}|${f.mercado}|${f.fecha}`;
              const nueva = !envios.includes(k);
              if (nueva) envios = [...envios, k];
              return { data: nueva ? [f] : [], error: null };
            },
          }),
          delete: () => ({
            eq: (_a: string, p: string) => ({
              eq: (_b: string, m: string) => ({
                eq: async (_c: string, fecha: string) => {
                  envios = envios.filter((k) => k !== `${p}|${m}|${fecha}`);
                  return { error: null };
                },
              }),
            }),
          }),
        };
      if (tabla === "whatsapp_envios")
        return {
          upsert: async (f: Record<string, unknown>[], o: unknown) => {
            waOpciones.push(o);
            if (!waError) waFilas = [...waFilas, ...f];
            return { error: waError };
          },
        };
      throw new Error(`tabla no simulada: ${tabla}`);
    },
  }),
}));
vi.mock("@/lib/email", () => ({ enviarEmail: (...a: unknown[]) => enviar(...a), urlApp: () => "http://x" }));
vi.mock("@/lib/reporte-diario-datos", () => ({ datosReporte: (...a: unknown[]) => datos(...a) }));
vi.mock("@/lib/limite", () => ({ dentroDelLimite: async () => true }));
vi.mock("@/lib/whatsapp", async () => {
  const real = await vi.importActual<typeof import("@/lib/whatsapp")>("@/lib/whatsapp");
  return { chatIdDe: real.chatIdDe, whatsappConfigurado: () => waConfigurado, enviarWhatsapp: (...a: unknown[]) => enviarWa(...a) };
});

const { enviarReporte } = await import("@/lib/reporte-envio");
const { POST } = await import("@/app/api/avisos/reporte/[proyectoId]/route");

const vacio = { llamadas: 0, agendas: 0, ventas: 0, cash: 0 };
const fila = (mercado: string, o: Record<string, unknown> = {}) => ({
  mercado,
  activo: true,
  hora: "21:00",
  emails: ["ceo@x.com", "jefe@x.com"],
  whatsapps: ["+34600000000"],
  partes: ["totales_dia"],
  ...o,
});

beforeEach(() => {
  config = [fila("es"), fila("latam", { emails: ["usa@x.com"] })];
  configError = null;
  envios = [];
  reservas = [];
  enviar.mockReset().mockResolvedValue({ enviado: true, motivo: "" });
  waConfigurado = false;
  waFilas = [];
  waOpciones = [];
  waError = null;
  enviarWa.mockReset().mockImplementation(async (destinos: string[]) => ({ enviados: destinos, fallos: [] }));
  datos.mockReset().mockImplementation(async (_p: unknown, mercado: string) => ({
    mercado,
    fecha: "2026-11-17",
    personas: [],
    dia: vacio,
    mes: vacio,
    vaMal: [],
    objetivos: [],
  }));
});

const MADRID_2059 = new Date("2026-11-17T19:59:00Z"); // 20:59 en Madrid (UTC+1 en noviembre)
const MADRID_2100 = new Date("2026-11-17T20:00:00Z"); // 21:00 en Madrid

describe("enviarReporte", () => {
  it("España a las 20:59 de Madrid: fuera de hora, ni manda ni reserva", async () => {
    expect(await enviarReporte(P, "es", MADRID_2059)).toEqual({ estado: "fuera_de_hora" });
    expect(enviar).not.toHaveBeenCalled();
    expect(reservas).toEqual([]);
  });

  it("España a las 21:00 de Madrid: manda a los emails de la config con el reporte de su mercado y reserva la fecha", async () => {
    expect(await enviarReporte(P, "es", MADRID_2100)).toEqual({ estado: "enviado" });
    expect(datos).toHaveBeenCalledWith(PROYECTO, "es", MADRID_2100);
    expect(enviar).toHaveBeenCalledTimes(1);
    const o = enviar.mock.calls[0][0];
    expect(o.para).toEqual(["ceo@x.com", "jefe@x.com"]);
    expect(o.asunto).toBe("Eternity · Reporte España del 17/11/2026");
    expect(o.texto).toContain("Reporte España");
    expect(o.html).toContain("Reporte España");
    expect(reservas).toEqual([{ proyecto_id: P, mercado: "es", fecha: "2026-11-17", opciones: { onConflict: "proyecto_id,mercado,fecha", ignoreDuplicates: true } }]);
  });

  it("segunda llamada del mismo día (21:15): ya enviado, la reserva no inserta y no se manda otro", async () => {
    expect((await enviarReporte(P, "es", MADRID_2100)).estado).toBe("enviado");
    expect(await enviarReporte(P, "es", new Date("2026-11-17T20:15:00Z"))).toEqual({ estado: "ya_enviado" });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("después de su hora (23:45 de Madrid) aún manda si hoy no salió", async () => {
    expect((await enviarReporte(P, "es", new Date("2026-11-17T22:45:00Z"))).estado).toBe("enviado");
  });

  it("apagado: no manda ni reserva, aunque sea su hora", async () => {
    config = [fila("es", { activo: false })];
    expect(await enviarReporte(P, "es", MADRID_2100)).toEqual({ estado: "apagado" });
    expect(enviar).not.toHaveBeenCalled();
    expect(reservas).toEqual([]);
  });

  it("USA a las 02:00Z del 18 (21:00 del 17 en Nueva York) reserva la fecha 2026-11-17 y manda a sus emails", async () => {
    const ahora = new Date("2026-11-18T02:00:00Z");
    expect(await enviarReporte(P, "latam", ahora)).toEqual({ estado: "enviado" });
    expect(reservas.map((r) => [r.mercado, r.fecha])).toEqual([["latam", "2026-11-17"]]);
    expect(enviar.mock.calls[0][0].para).toEqual(["usa@x.com"]);
    expect(datos).toHaveBeenCalledWith(PROYECTO, "latam", ahora);
  });

  it("USA a las 20:00Z (15:00 en Nueva York): fuera de hora", async () => {
    expect(await enviarReporte(P, "latam", MADRID_2100)).toEqual({ estado: "fuera_de_hora" });
  });

  it("sin fila de config usa la de por defecto (encendido, 21:00, info@eternity.llc)", async () => {
    config = [];
    expect((await enviarReporte(P, "es", MADRID_2100)).estado).toBe("enviado");
    expect(enviar.mock.calls[0][0].para).toEqual(["info@eternity.llc"]);
  });

  it("si el email falla: fallo con el motivo, suelta la reserva y el siguiente intento (21:15) reintenta", async () => {
    enviar.mockResolvedValueOnce({ enviado: false, motivo: "Resend respondió 500" });
    expect(await enviarReporte(P, "es", MADRID_2100)).toEqual({ estado: "fallo", motivo: "Resend respondió 500" });
    expect(envios).toEqual([]);
    expect((await enviarReporte(P, "es", new Date("2026-11-17T20:15:00Z"))).estado).toBe("enviado");
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it("si cargar los números lanza: fallo y suelta la reserva", async () => {
    datos.mockRejectedValueOnce(new Error("base caída"));
    expect(await enviarReporte(P, "es", MADRID_2100)).toEqual({ estado: "fallo", motivo: "base caída" });
    expect(envios).toEqual([]);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("si no se puede leer la config: fallo (no lanza)", async () => {
    configError = { message: "sin conexión" };
    const r = await enviarReporte(P, "es", MADRID_2100);
    expect(r.estado).toBe("fallo");
    expect(r.estado === "fallo" && r.motivo).toContain("sin conexión");
    expect(reservas).toEqual([]);
  });
});

describe("enviarReporte por WhatsApp (Fase D)", () => {
  const ORIGEN = "es:2026-11-17";
  const OPCIONES_WA = { onConflict: "evento,origen_id,destino", ignoreDuplicates: true };

  beforeEach(() => {
    config = [fila("es", { whatsapps: ["+34600111222", "x"] })];
  });

  it("configurado, a las 21:00 de Madrid: manda el texto a los números válidos y apunta cada destino", async () => {
    waConfigurado = true;
    expect(await enviarReporte(P, "es", MADRID_2100)).toEqual({ estado: "enviado" });
    expect(enviarWa).toHaveBeenCalledTimes(1);
    const [destinos, texto] = enviarWa.mock.calls[0];
    expect(destinos).toEqual(["34600111222@c.us"]);
    expect(texto).toBe(enviar.mock.calls[0][0].texto);
    expect(texto).toContain("Reporte España");
    expect(waFilas).toEqual(
      expect.arrayContaining([
        { proyecto_id: P, evento: "reporte", origen_id: ORIGEN, destino: "34600111222@c.us", estado: "enviado", error: null },
        { proyecto_id: P, evento: "reporte", origen_id: ORIGEN, destino: "x", estado: "fallo", error: "Número no válido" },
      ]),
    );
    expect(waFilas).toHaveLength(2);
    expect(waOpciones.every((o) => JSON.stringify(o) === JSON.stringify(OPCIONES_WA))).toBe(true);
  });

  it("sin WhatsApp configurado: ni se llama a enviarWhatsapp ni se apunta nada", async () => {
    expect(await enviarReporte(P, "es", MADRID_2100)).toEqual({ estado: "enviado" });
    expect(enviarWa).not.toHaveBeenCalled();
    expect(waFilas).toEqual([]);
    expect(waOpciones).toEqual([]);
  });

  it("si WhatsApp falla: el reporte sigue «enviado», la reserva se queda y el fallo se apunta con su motivo", async () => {
    waConfigurado = true;
    enviarWa.mockResolvedValueOnce({ enviados: [], fallos: [{ destino: "34600111222@c.us", motivo: "WAHA respondió 500" }] });
    expect(await enviarReporte(P, "es", MADRID_2100)).toEqual({ estado: "enviado" });
    expect(envios).toEqual([`${P}|es|2026-11-17`]);
    expect(waFilas).toContainEqual({ proyecto_id: P, evento: "reporte", origen_id: ORIGEN, destino: "34600111222@c.us", estado: "fallo", error: "WAHA respondió 500" });
  });

  it("si enviarWhatsapp lanzara o no se pudiera apuntar: el reporte sigue «enviado» y no lanza", async () => {
    waConfigurado = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    waError = { message: "sin conexión" };
    expect(await enviarReporte(P, "es", MADRID_2100)).toEqual({ estado: "enviado" });
    expect(error).toHaveBeenCalled();
    envios = [];
    waError = null;
    enviarWa.mockRejectedValueOnce(new Error("explota"));
    expect(await enviarReporte(P, "es", MADRID_2100)).toEqual({ estado: "enviado" });
    expect(envios).toEqual([`${P}|es|2026-11-17`]);
    error.mockRestore();
  });

  it("si el email falla: no se manda WhatsApp ni se apunta nada", async () => {
    waConfigurado = true;
    enviar.mockResolvedValueOnce({ enviado: false, motivo: "Resend respondió 500" });
    expect(await enviarReporte(P, "es", MADRID_2100)).toEqual({ estado: "fallo", motivo: "Resend respondió 500" });
    expect(enviarWa).not.toHaveBeenCalled();
    expect(waFilas).toEqual([]);
  });
});

describe("POST /api/avisos/reporte/[proyectoId]", () => {
  const llamar = (cabeceras: Record<string, string> = {}, id = P) =>
    POST(new NextRequest(`http://x/api/avisos/reporte/${id}`, { method: "POST", headers: cabeceras }), { params: Promise.resolve({ proyectoId: id }) });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MADRID_2100);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sin la cabecera x-eternity-secreto: 401 y no manda nada", async () => {
    const r = await llamar();
    expect(r.status).toBe(401);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("con una clave equivocada: 401", async () => {
    expect((await llamar({ "x-eternity-secreto": "otra" })).status).toBe(401);
  });

  it("con un id que no es de proyecto: 404", async () => {
    expect((await llamar({ "x-eternity-secreto": SECRETO }, "x")).status).toBe(404);
  });

  it("con la clave, a las 21:00 de Madrid: manda España, USA aún no", async () => {
    const r = await llamar({ "x-eternity-secreto": SECRETO });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, es: "enviado", latam: "fuera_de_hora" });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("si España falla, USA se intenta igual y la respuesta es 500 con el motivo en el registro", async () => {
    config = [fila("es"), fila("latam", { hora: "15:00" })]; // 20:00Z = 21:00 en Madrid y 15:00 en Nueva York: tocan los dos
    datos.mockImplementation(async (_p: unknown, mercado: string) => {
      if (mercado === "es") throw new Error("base caída");
      return { mercado, fecha: "2026-11-17", personas: [], dia: vacio, mes: vacio, vaMal: [], objetivos: [] };
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await llamar({ "x-eternity-secreto": SECRETO });
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, es: "fallo", latam: "enviado" });
    expect(error).toHaveBeenCalledWith("[avisos-reporte]", P, "es", "base caída");
  });
});
