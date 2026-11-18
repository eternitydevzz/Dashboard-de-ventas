// 18 nov 2026 (Jose): al mover una grabación ±10 s salía «El audio se cortó» («FFmpegDemuxer: demuxer seek failed»).
// Causa: el .webm de MediaRecorder (Chrome) no trae índice (Cues) ni duración, y sin índice el navegador no sabe
// saltar. Probado en local con la grabación real: sin índice falla siempre (también con el archivo entero o con solo la
// duración); reempaquetado con índice, salta y suena. Por eso la grabadora le pone índice antes de subirla.
// tests/apoyo/sin-indice.webm: 6 s de pitido opus hecho con ffmpeg «-live 1» (sin Cues, sin duración, segmento de
// tamaño desconocido), como los de Chrome. Sin voces reales.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import { hacerBuscable } from "@/lib/webm-buscable";

const CUES = Buffer.from("1C53BB6B", "hex");
const original = () => new Blob([readFileSync("tests/apoyo/sin-indice.webm")], { type: "audio/webm" });
const bytes = async (b: Blob) => Buffer.from(await b.arrayBuffer());

// Duración guardada en la cabecera (Info → Duration, id 0x4489), en milisegundos (TimecodeScale por defecto)
function duracionCabecera(b: Buffer): number | null {
  const i = b.indexOf(Buffer.from("4489", "hex"));
  if (i < 0) return null;
  const tam = b[i + 2] & 0x7f;
  return tam === 8 ? b.readDoubleBE(i + 3) : tam === 4 ? b.readFloatBE(i + 3) : null;
}

describe("hacerBuscable (grabaciones .webm con índice)", () => {
  it("el audio de prueba de verdad viene sin índice ni duración (como el de Chrome)", async () => {
    const b = await bytes(original());
    expect(b.indexOf(CUES)).toBe(-1);
    expect(duracionCabecera(b) ?? 0).toBe(0);
  });

  it("le pone índice (Cues) y duración, sin cambiar el tipo", async () => {
    const r = await hacerBuscable(original());
    const b = await bytes(r);
    expect(r.type).toBe("audio/webm");
    expect(b.indexOf(CUES)).toBeGreaterThan(-1);
    expect(duracionCabecera(b)).toBeGreaterThan(5500);
    expect(duracionCabecera(b)).toBeLessThan(6500);
  });

  it("no pierde audio: dura lo mismo que el original", async () => {
    const r = await hacerBuscable(original());
    const dur = await new Input({ source: new BlobSource(r), formats: ALL_FORMATS }).computeDuration();
    expect(dur).toBeGreaterThan(5.9);
    expect(dur).toBeLessThan(6.1);
  });

  it("si no es webm (Safari graba mp4), la deja tal cual", async () => {
    const mp4 = new Blob([new Uint8Array([0, 0, 0, 0])], { type: "audio/mp4" });
    expect(await hacerBuscable(mp4)).toBe(mp4);
  });

  it("si el webm está roto, devuelve el original: la grabación nunca se pierde", async () => {
    const roto = new Blob([new Uint8Array(500).fill(7)], { type: "audio/webm" });
    expect(await hacerBuscable(roto)).toBe(roto);
  });
});
