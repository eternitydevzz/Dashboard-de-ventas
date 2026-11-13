import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alInstante, olvidarTodo, UN_MINUTO } from "@/lib/memoria";

// D41: «al instante» (stale-while-revalidate) solo para KPIs → Leads. Relojes falsos y datos inventados.
const esperar = () => new Promise((r) => setImmediate(r));

describe("alInstante", () => {
  beforeEach(() => {
    vi.stubEnv("VITEST", ""); // en los tests la memoria va apagada: aquí se enciende
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
    olvidarTodo();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("dentro del minuto no vuelve a la base y cada uno recibe su copia", async () => {
    const cargar = vi.fn(async () => ({ n: 1 }));
    const a = await alInstante("k", UN_MINUTO, cargar);
    vi.setSystemTime(Date.now() + 30_000);
    const b = await alInstante("k", UN_MINUTO, cargar);
    expect(cargar).toHaveBeenCalledTimes(1);
    expect(b).toEqual({ n: 1 });
    expect(b).not.toBe(a);
  });

  it("caducado: devuelve lo viejo al momento y recarga por detrás una sola vez", async () => {
    let n = 0;
    let soltar = () => {};
    const cargar = vi.fn(() => (++n === 1 ? Promise.resolve({ n }) : new Promise<{ n: number }>((r) => (soltar = () => r({ n })))));
    await alInstante("k", UN_MINUTO, cargar);
    vi.setSystemTime(Date.now() + 2 * UN_MINUTO);
    expect(await alInstante("k", UN_MINUTO, cargar)).toEqual({ n: 1 });
    expect(await alInstante("k", UN_MINUTO, cargar)).toEqual({ n: 1 }); // sin dos recargas a la vez
    expect(cargar).toHaveBeenCalledTimes(2);
    soltar();
    await esperar();
    expect(await alInstante("k", UN_MINUTO, cargar)).toEqual({ n: 2 });
    expect(cargar).toHaveBeenCalledTimes(2);
  });

  it("más viejo que el límite: espera a la base", async () => {
    let n = 0;
    const cargar = vi.fn(async () => ({ n: ++n }));
    await alInstante("k", UN_MINUTO, cargar, 10 * UN_MINUTO);
    vi.setSystemTime(Date.now() + 11 * UN_MINUTO);
    expect(await alInstante("k", UN_MINUTO, cargar, 10 * UN_MINUTO)).toEqual({ n: 2 });
  });

  it("si la recarga falla, se sigue sirviendo lo viejo y la siguiente lo vuelve a intentar", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let n = 0;
    const cargar = vi.fn(async () => {
      if (++n === 2) throw new Error("base caída");
      return { n };
    });
    await alInstante("k", UN_MINUTO, cargar);
    vi.setSystemTime(Date.now() + 2 * UN_MINUTO);
    expect(await alInstante("k", UN_MINUTO, cargar)).toEqual({ n: 1 });
    await esperar();
    expect(await alInstante("k", UN_MINUTO, cargar)).toEqual({ n: 1 });
    await esperar();
    expect(await alInstante("k", UN_MINUTO, cargar)).toEqual({ n: 3 });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("tras olvidarTodo no se sirve nada viejo, ni lo que se estaba cargando antes", async () => {
    let n = 0;
    let soltar = () => {};
    const cargar = vi.fn(() => (++n === 2 ? new Promise<{ n: number }>((r) => (soltar = () => r({ n: 2 }))) : Promise.resolve({ n })));
    await alInstante("k", UN_MINUTO, cargar);
    vi.setSystemTime(Date.now() + 2 * UN_MINUTO);
    await alInstante("k", UN_MINUTO, cargar); // lanza la recarga 2 (queda colgada)
    olvidarTodo();
    expect(await alInstante("k", UN_MINUTO, cargar)).toEqual({ n: 3 }); // espera a la base
    soltar();
    await esperar();
    expect(await alInstante("k", UN_MINUTO, cargar)).toEqual({ n: 3 }); // la 2 no pisa a la 3
  });
});
