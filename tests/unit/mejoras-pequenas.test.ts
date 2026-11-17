// Cristian, 15 nov: «las 3 pequeñas» de la revisión final.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marcarViejo, olvidarTodo, renovadoPorDetras, UN_MINUTO } from "@/lib/memoria";

const leer = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), "utf8");

describe("1 · Onboarding de closers: fecha en la zona del proyecto (sin el error #418)", () => {
  it("«Hecho el…» lleva la zona", () => {
    const s = leer("src/app/(panel)/onboarding-closers/cliente.tsx");
    const fechas = s.split("\n").filter((l) => /toLocaleDateString\(/.test(l));
    expect(fechas.length).toBeGreaterThan(0);
    expect(fechas.filter((l) => !/timeZone: zona/.test(l))).toEqual([]);
    expect(leer("src/app/(panel)/onboarding-closers/page.tsx")).toMatch(/<ChecklistCliente[^\n]*zona=\{proyecto\.zona_horaria\} \/>/);
  });
});

describe("3 · Llamadas desde la cola: KPIs → Leads se renueva en la siguiente visita sin hacer esperar", () => {
  const despues: (() => Promise<unknown>)[] = [];
  const lanzar = (f: () => Promise<unknown>) => void despues.push(f);
  beforeEach(() => {
    vi.stubEnv("VITEST", "");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T10:00:00Z"));
    olvidarTodo();
    despues.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("marcarViejo: la siguiente visita responde al momento con lo guardado y renueva por detrás", async () => {
    let n = 0;
    const cargar = vi.fn(async () => ({ n: ++n }));
    await renovadoPorDetras("leads-kpis:p1", UN_MINUTO, 5 * UN_MINUTO, cargar, lanzar);
    vi.setSystemTime(Date.now() + 10_000); // dentro del minuto: sin marcar, no se renovaría
    marcarViejo("leads-kpis:");
    expect(await renovadoPorDetras("leads-kpis:p1", UN_MINUTO, 5 * UN_MINUTO, cargar, lanzar)).toEqual({ n: 1 });
    expect(despues).toHaveLength(1);
    await despues.shift()!();
    expect(await renovadoPorDetras("leads-kpis:p1", UN_MINUTO, 5 * UN_MINUTO, cargar, lanzar)).toEqual({ n: 2 });
  });
  it("las acciones de la cola y la ficha lo llaman al guardar", () => {
    expect(leer("src/app/(panel)/leads/acciones.ts")).toMatch(/marcarViejo\("leads-kpis:"\)/);
  });
});
