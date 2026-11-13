import { describe, expect, it } from "vitest";
import { esJpeg, pasoPendiente, rutaFotoValida, zonaValida } from "@/app/(panel)/perfil/foto-zona";

// N3 y N2 (Cristian, 13 nov 2026). Datos inventados.
const ID = "11111111-2222-3333-4444-555555555555";
const ARCHIVO = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("pasoPendiente", () => {
  it("sin foto no pasa, sea del rol que sea", () => {
    expect(pasoPendiente({ rol: "ceo", foto: null })).toBe("/onboarding/foto");
    expect(pasoPendiente({ rol: "caller", foto: null, zona_horaria: null })).toBe("/onboarding/foto");
  });

  it("con foto, a callers y closers les falta la zona; a los jefes no", () => {
    expect(pasoPendiente({ rol: "caller", foto: "x", zona_horaria: null })).toBe("/onboarding/zona");
    expect(pasoPendiente({ rol: "closer", foto: "x", zona_horaria: null })).toBe("/onboarding/zona");
    expect(pasoPendiente({ rol: "director", foto: "x", zona_horaria: null })).toBeNull();
    expect(pasoPendiente({ rol: "closer", foto: "x", zona_horaria: "America/Bogota" })).toBeNull();
  });

  it("si la base aún no tiene las columnas (undefined), no deja a nadie fuera", () => {
    expect(pasoPendiente({ rol: "caller" })).toBeNull();
  });
});

describe("rutaFotoValida", () => {
  it("solo <persona>/<uuid>.jpg", () => {
    expect(rutaFotoValida(`${ID}/${ARCHIVO}.jpg`)).toBe(true);
    expect(rutaFotoValida(`${ID}/${ARCHIVO}.png`)).toBe(false);
    expect(rutaFotoValida(`../${ID}/${ARCHIVO}.jpg`)).toBe(false);
    expect(rutaFotoValida(`${ID}/../${ARCHIVO}.jpg`)).toBe(false);
  });
});

describe("esJpeg", () => {
  it("mira los primeros bytes, no el nombre", () => {
    expect(esJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(esJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false); // PNG
    expect(esJpeg(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBe(false); // <svg
    expect(esJpeg(new Uint8Array([]))).toBe(false);
  });
});

describe("zonaValida", () => {
  it("solo las 6 del equipo", () => {
    expect(zonaValida("America/Bogota")).toBe("America/Bogota");
    expect(zonaValida("Europe/Madrid")).toBe("Europe/Madrid");
    expect(zonaValida("Europe/London")).toBeNull();
    expect(zonaValida(null)).toBeNull();
  });
});
