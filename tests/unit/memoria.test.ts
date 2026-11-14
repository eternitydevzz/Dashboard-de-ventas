import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enMemoria, olvidarTodo, UN_MINUTO } from "@/lib/memoria";

// La memoria del servidor (25 oct). Cristian, 14 nov (Fase 9): «al instante» (D41) se quitó; KPIs → Leads usa esta.
describe("enMemoria", () => {
  beforeEach(() => {
    vi.stubEnv("VITEST", ""); // en los tests la memoria va apagada: aquí se enciende
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T10:00:00Z"));
    olvidarTodo();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("dentro del minuto no vuelve a la base y cada uno recibe su copia", async () => {
    const cargar = vi.fn(async () => ({ n: 1 }));
    const a = await enMemoria("k", UN_MINUTO, cargar);
    vi.setSystemTime(Date.now() + 30_000);
    const b = await enMemoria("k", UN_MINUTO, cargar);
    expect(cargar).toHaveBeenCalledTimes(1);
    expect(b).toEqual({ n: 1 });
    expect(b).not.toBe(a);
  });

  it("pasado el minuto espera a la base", async () => {
    let n = 0;
    const cargar = vi.fn(async () => ({ n: ++n }));
    await enMemoria("k", UN_MINUTO, cargar);
    vi.setSystemTime(Date.now() + 2 * UN_MINUTO);
    expect(await enMemoria("k", UN_MINUTO, cargar)).toEqual({ n: 2 });
  });

  it("si falla no se guarda: la siguiente lo vuelve a intentar", async () => {
    let n = 0;
    const cargar = vi.fn(async () => {
      if (++n === 1) throw new Error("base caída");
      return { n };
    });
    await expect(enMemoria("k", UN_MINUTO, cargar)).rejects.toThrow();
    expect(await enMemoria("k", UN_MINUTO, cargar)).toEqual({ n: 2 });
  });

  it("tras olvidarTodo vuelve a la base", async () => {
    let n = 0;
    const cargar = vi.fn(async () => ({ n: ++n }));
    await enMemoria("k", UN_MINUTO, cargar);
    olvidarTodo();
    expect(await enMemoria("k", UN_MINUTO, cargar)).toEqual({ n: 2 });
  });
});
