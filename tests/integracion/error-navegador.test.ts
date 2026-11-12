// 12 nov 2026: los fallos del navegador se guardan (salen en los avisos del CEO), recortados y con tope por conexión.
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../apoyo/escenario";
import { anotarErrorNavegador } from "@/app/acciones-errores";

const ip = `test-${Math.random().toString(36).slice(2, 10)}`;
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": `${ip}, 10.0.0.1` }) }));
const ruta = `/TEST-AUTO-${ip}`;

afterAll(async () => {
  await db.from("errores_app").delete().eq("sitio", "navegador").like("texto", `${ruta}%`);
  await db.from("limite_intentos").delete().eq("clave", `error-navegador:${ip}`);
});

describe("Errores del navegador", () => {
  it("se guardan una vez con su contador, recortados, y como mucho 20 por conexión cada hora", async () => {
    for (let i = 0; i < 25; i++) await anotarErrorNavegador(ruta, `RangeError: Invalid time value ${"x".repeat(500)}`);
    const { data } = await db.from("errores_app").select("texto, veces, proyecto_id").eq("sitio", "navegador").like("texto", `${ruta}%`);
    expect(data).toHaveLength(1);
    expect(data![0].veces).toBe(20);
    expect(data![0].proyecto_id).toBeNull();
    expect(data![0].texto).toHaveLength(ruta.length + 3 + 300);
  });
});
