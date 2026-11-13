// C10 (plan Callers, 7 nov): grabar la llamada desde el guion y la sección «Grabaciones».
import { describe, expect, it } from "vitest";
import { AVISO_FIN_SEG, duracionTexto, extDeTipo, quedanAviso, tipoGrabacion, transcripcionValida } from "@/lib/grabaciones";
import { rutaDeSubidaValida } from "@/lib/subidas";
import { politicaCsp } from "@/lib/csp";
import { DEFECTO } from "@/lib/permisos-constantes";

describe("C10 · audio", () => {
  it("el formato que graba cada navegador → su extensión (Chrome webm, Safari mp4)", () => {
    expect(extDeTipo("audio/webm;codecs=opus")).toBe("webm");
    expect(extDeTipo("audio/mp4")).toBe("mp4");
    expect(extDeTipo("audio/ogg; codecs=opus")).toBe("ogg");
    expect(extDeTipo("video/x-raro")).toBeNull();
  });
  it("tipo que se guarda según la extensión del archivo", () => {
    expect(tipoGrabacion("p/x.webm")).toBe("audio/webm");
    expect(tipoGrabacion("p/x.mp4")).toBe("audio/mp4");
  });
  it("duración en mm:ss (y h:mm:ss si pasa de una hora)", () => {
    expect(duracionTexto(0)).toBe("00:00");
    expect(duracionTexto(492)).toBe("08:12");
    expect(duracionTexto(3725)).toBe("1:02:05");
  });
  it("transcripción: texto recortado, no vacía y como mucho 200.000 caracteres", () => {
    expect(transcripcionValida("  Caller: hola  ")).toBe("Caller: hola");
    expect(() => transcripcionValida("  ")).toThrow(/vacía/);
    expect(() => transcripcionValida("x".repeat(200_001))).toThrow(/larga/);
  });
  it("solo rutas de grabación creadas por la app para este proyecto", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(rutaDeSubidaValida("grabaciones", `p1/${id}.webm`, "p1")).toBe(true);
    expect(rutaDeSubidaValida("grabaciones", `p1/${id}.mp4`, "p1")).toBe(true);
    expect(rutaDeSubidaValida("grabaciones", `p1/${id}.exe`, "p1")).toBe(false);
    expect(rutaDeSubidaValida("grabaciones", `p2/${id}.webm`, "p1")).toBe(false);
  });
});

describe("C10 · seguridad y permisos", () => {
  it("la app deja reproducir audio propio, de blob: y de Supabase", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    expect(politicaCsp("n", false)).toContain("media-src 'self' blob: https://abc.supabase.co");
  });
  it("la sección la tienen por defecto callers, closers y directores (cada uno ve las suyas; los jefes, todas)", () => {
    for (const rol of ["director", "closer", "caller"] as const) expect(DEFECTO[rol].has("grabaciones")).toBe(true);
  });
});

describe("Aviso de fin de grabación (13 nov)", () => {
  it("cuenta atrás de 30 s, redondea hacia arriba y no baja de 0", () => {
    const fin = 1_000_000 + AVISO_FIN_SEG * 1000;
    expect(AVISO_FIN_SEG).toBe(30);
    expect(quedanAviso(fin, 1_000_000)).toBe(30);
    expect(quedanAviso(fin, fin - 1500)).toBe(2);
    expect(quedanAviso(fin, fin)).toBe(0);
    expect(quedanAviso(fin, fin + 5000)).toBe(0);
  });
});
