// Cristian, 14 nov (noche): «memoria de 5 min» para KPIs → Leads. Hasta 1 min se usa lo guardado tal cual; de 1 a 5 min
// se usa lo guardado y se renueva por detrás (después de responder); pasados 5 min, se espera a la base.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { olvidarTodo, renovadoPorDetras, UN_MINUTO } from "@/lib/memoria";

const despues: (() => Promise<unknown>)[] = [];
const lanzar = (f: () => Promise<unknown>) => void despues.push(f);
const correrDespues = async () => { while (despues.length) await despues.shift()!(); };
const pedir = (cargar: () => Promise<{ n: number }>) => renovadoPorDetras("k", UN_MINUTO, 5 * UN_MINUTO, cargar, lanzar);

describe("renovadoPorDetras", () => {
  beforeEach(() => {
    vi.stubEnv("VITEST", "");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T10:00:00Z"));
    olvidarTodo();
    despues.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("dentro del minuto: lo guardado, sin renovar", async () => {
    let n = 0;
    const cargar = vi.fn(async () => ({ n: ++n }));
    await pedir(cargar);
    vi.setSystemTime(Date.now() + 30_000);
    expect(await pedir(cargar)).toEqual({ n: 1 });
    expect(despues).toHaveLength(0);
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it("de 1 a 5 min: responde al momento con lo guardado y renueva por detrás una sola vez", async () => {
    let n = 0;
    const cargar = vi.fn(async () => ({ n: ++n }));
    await pedir(cargar);
    vi.setSystemTime(Date.now() + 2 * UN_MINUTO);
    expect(await pedir(cargar)).toEqual({ n: 1 }); // no espera
    expect(await pedir(cargar)).toEqual({ n: 1 });
    expect(despues).toHaveLength(1); // una sola renovación aunque pidan 2
    await correrDespues();
    expect(await pedir(cargar)).toEqual({ n: 2 });
  });

  it("pasados 5 min: espera a la base", async () => {
    let n = 0;
    const cargar = vi.fn(async () => ({ n: ++n }));
    await pedir(cargar);
    vi.setSystemTime(Date.now() + 5 * UN_MINUTO + 1);
    expect(await pedir(cargar)).toEqual({ n: 2 });
  });

  it("si la renovación falla, sigue lo guardado y se puede volver a intentar", async () => {
    let n = 0;
    let fallar = false;
    const cargar = vi.fn(async () => { if (fallar) throw new Error("base caída"); return { n: ++n }; });
    await pedir(cargar);
    vi.setSystemTime(Date.now() + 2 * UN_MINUTO);
    fallar = true;
    await pedir(cargar);
    await correrDespues();
    expect(await pedir(cargar)).toEqual({ n: 1 });
    expect(despues).toHaveLength(1); // otro intento
  });

  it("olvidarTodo (un cambio propio) obliga a ir a la base", async () => {
    let n = 0;
    const cargar = vi.fn(async () => ({ n: ++n }));
    await pedir(cargar);
    olvidarTodo();
    expect(await pedir(cargar)).toEqual({ n: 2 });
  });

  it("cada uno recibe su copia", async () => {
    const cargar = async () => ({ n: 1 });
    const a = await pedir(cargar);
    const b = await pedir(cargar);
    expect(b).not.toBe(a);
  });
});
