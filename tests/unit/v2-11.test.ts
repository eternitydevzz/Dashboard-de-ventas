import { describe, expect, it } from "vitest";
import { enHorario, horarioValido } from "@/lib/horarios";
import { esLlamadaUtil, transcribirDeepgram, transcripcionGhl } from "@/lib/ghl-llamadas";
import { colaCaller } from "@/lib/cola";
import { puntosLead } from "@/lib/prioridad";

describe("Horarios", () => {
  const h = horarioValido({ dias: [1, 2, 3, 4, 5], desde: "09:00", hasta: "14:00" });
  it("valida días y horas", () => {
    expect(horarioValido({ dias: [], desde: "09:00", hasta: "14:00" })).toBeNull();
    expect(horarioValido({ dias: [1], desde: "9h", hasta: "14:00" })).toBeNull();
    // Bloque 1 de 1.0: el formato de V2-11 se lee y se pasa al nuevo (tramos por día)
    expect(horarioValido({ dias: [8, 1, 1], desde: "09:00", hasta: "10:00" })).toEqual({ semana: { 1: [{ desde: "09:00", hasta: "10:00" }] }, fechas: {} });
  });
  it("en la hora del proyecto: lunes 10:30 en Madrid sí; sábado no; 14:00 ya no", () => {
    expect(enHorario(h, new Date("2026-10-12T08:30:00Z"), "Europe/Madrid")).toBe(true); // lunes 10:30 Madrid
    expect(enHorario(h, new Date("2026-10-10T08:30:00Z"), "Europe/Madrid")).toBe(false); // sábado
    expect(enHorario(h, new Date("2026-10-12T12:00:00Z"), "Europe/Madrid")).toBe(false); // 14:00
    expect(enHorario(h, new Date("2026-10-12T08:30:00Z"), "America/New_York")).toBe(false); // 4:30 en NY
  });
  it("turno que pasa de medianoche cuenta para el día en que empieza", () => {
    const noche = horarioValido({ dias: [5], desde: "22:00", hasta: "02:00" }); // viernes
    expect(enHorario(noche, new Date("2026-10-09T21:00:00Z"), "Europe/Madrid")).toBe(true); // viernes 23:00 Madrid
    expect(enHorario(noche, new Date("2026-10-09T23:30:00Z"), "Europe/Madrid")).toBe(true); // sábado 01:30 Madrid (turno del viernes)
    expect(enHorario(noche, new Date("2026-10-10T00:30:00Z"), "Europe/Madrid")).toBe(false); // sábado 02:30 Madrid
    expect(enHorario(noche, new Date("2026-10-03T23:30:00Z"), "Europe/Madrid")).toBe(false); // domingo 01:30: el sábado no tiene turno
  });
});

describe("Priorización con IA", () => {
  const leads = [
    { id: "a", estado_caller: "nuevo", llamar_en: null, creado_en: "2026-10-01", respuestas: [{ pregunta: "Inversión", respuesta: "No" }] },
    { id: "b", estado_caller: "nuevo", llamar_en: null, creado_en: "2026-10-02", respuestas: [{ pregunta: "Inversión", respuesta: "Sí, ahora" }] },
  ] as never[];
  it("con Scoring IA ordena por su nota; sin él, por la puntuación simple", () => {
    const pesos = { Inversión: { "Sí, ahora": 10, No: -10 } };
    expect([...colaCaller(leads, "todos", pesos)].sort((x: { puntos: number }, y: { puntos: number }) => y.puntos - x.puntos).map((l: { id: string }) => l.id)).toEqual(["b", "a"]);
    expect(puntosLead([{ pregunta: "Otra", respuesta: "x" }], pesos)).toBe(50);
    expect(puntosLead([{ pregunta: "¿Puedes invertir?", respuesta: "Sí" }], null)).toBe(40);
  });
});

describe("Llamadas de GHL", () => {
  it("solo llamadas contestadas de 1 minuto o más", () => {
    const m = (x: object) => ({ id: "1", messageType: "TYPE_CALL", meta: { callStatus: "completed", callDuration: "75" }, ...x });
    expect(esLlamadaUtil(m({}))).toBe(true);
    expect(esLlamadaUtil(m({ meta: { callStatus: "no-answer", callDuration: "75" } }))).toBe(false);
    expect(esLlamadaUtil(m({ meta: { callStatus: "completed", callDuration: "59" } }))).toBe(false);
    expect(esLlamadaUtil(m({ messageType: "TYPE_SMS" }))).toBe(false);
  });
  it("transcripción de GHL: lista de frases (o dentro de un objeto); 404 = no hay", async () => {
    const f = (cuerpo: unknown, status = 200) => (async () => new Response(JSON.stringify(cuerpo), { status })) as unknown as typeof fetch;
    const frases = [{ mediaChannel: 1, sentenceIndex: 0, startTime: 65000, endTime: 70000, transcript: "Hola", confidence: 0.9 }];
    expect(await transcripcionGhl({ token: "t", locationId: "l", messageId: "m", fetchImpl: f(frases) })).toEqual([{ quien: "Canal 1", inicio: 65, texto: "Hola" }]);
    expect(await transcripcionGhl({ token: "t", locationId: "l", messageId: "m", fetchImpl: f({ transcription: frases }) })).toHaveLength(1);
    expect(await transcripcionGhl({ token: "t", locationId: "l", messageId: "m", fetchImpl: f({}, 404) })).toBeNull();
  });
  it("Deepgram: dirección, cabeceras y frases por persona", async () => {
    let pedido: { url: string; init?: RequestInit } | null = null;
    const f = (async (url: string, init?: RequestInit) => {
      pedido = { url, init };
      return Response.json({ results: { utterances: [{ start: 3.2, speaker: 0, transcript: "¿Qué tal?" }, { start: 5, speaker: 1, transcript: "Bien" }] } });
    }) as unknown as typeof fetch;
    const r = await transcribirDeepgram({ audio: new ArrayBuffer(2000), apiKey: "dg-key", fetchImpl: f });
    expect(r).toEqual([{ quien: "Persona 1", inicio: 3, texto: "¿Qué tal?" }, { quien: "Persona 2", inicio: 5, texto: "Bien" }]);
    const u = new URL(pedido!.url);
    expect(u.origin + u.pathname).toBe("https://api.deepgram.com/v1/listen");
    expect(u.searchParams.get("model")).toBe("nova-3");
    expect(u.searchParams.get("language")).toBe("es");
    expect(new Headers(pedido!.init!.headers).get("Authorization")).toBe("Token dg-key");
    expect(new Headers(pedido!.init!.headers).get("Content-Type")).toBe("audio/wav");
  });
});
