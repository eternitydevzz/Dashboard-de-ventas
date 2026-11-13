// Bienvenida con mensajes (Cristian, 11 nov 2026): qué mensajes ve cada caller y closer, y cuándo vuelve a salir la ventana.
import { beforeEach, describe, expect, it, vi } from "vitest";

const puestas: unknown[][] = [];
let cookie: string | undefined;
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookie ? { value: cookie } : undefined), set: (...a: unknown[]) => puestas.push(a) }) }));
const numerosCaller = vi.fn(async () => ({ llamadasHoy: 0, agendasHoy: 0, agendasSemana: 0, ventasDeSusAgendasHoy: 0 }));
const numerosCloser = vi.fn(async () => ({ agendasNuevasHoy: 0, agendasSemana: 0, ventasHoy: 1, ventasMes: 1 }));
vi.mock("@/lib/mensajes-entrada-datos", () => ({ numerosCaller, numerosCloser }));
const { getSesion } = await import("@/lib/sesion");
const { mensajesAlEntrar } = await import("@/app/(panel)/avisos-acciones");
const { mensajesCaller, mensajesCloser, tocaVentana, PRECARGA_ROL } = await import("@/lib/mensajes-entrada");

const caller = (o: Partial<{ llamadasHoy: number; agendasHoy: number; agendasSemana: number; ventasDeSusAgendasHoy: number }>) =>
  mensajesCaller({ llamadasHoy: 0, agendasHoy: 0, agendasSemana: 0, ventasDeSusAgendasHoy: 0, ...o });
const closer = (o: Partial<{ agendasNuevasHoy: number; agendasSemana: number; ventasHoy: number; ventasMes: number }>) =>
  mensajesCloser({ agendasNuevasHoy: 0, agendasSemana: 0, ventasHoy: 0, ventasMes: 0, ...o });

describe("mensajes del caller", () => {
  it("empieza el día: motivación y grabación", () => expect(caller({})).toEqual(["motivacion", "grabacion"]));
  it("con 49 llamadas sigue la motivación; con 50, ya no", () => {
    expect(caller({ llamadasHoy: 49 })).toContain("motivacion");
    expect(caller({ llamadasHoy: 50 })).toEqual(["grabacion"]);
  });
  it("100 y 150 llamadas: un hito, el más alto", () => {
    expect(caller({ llamadasHoy: 100 })).toEqual(["ll100", "grabacion"]);
    expect(caller({ llamadasHoy: 160 })).toEqual(["ll150", "grabacion"]);
  });
  it("agendas 1/3/5 de la semana, solo el día en que agenda una", () => {
    expect(caller({ agendasHoy: 1, agendasSemana: 1 })[0]).toBe("ag1");
    expect(caller({ agendasHoy: 1, agendasSemana: 4 })[0]).toBe("ag3");
    expect(caller({ agendasHoy: 2, agendasSemana: 7 })[0]).toBe("ag5");
    expect(caller({ agendasHoy: 0, agendasSemana: 7 })).toEqual(["motivacion", "grabacion"]);
  });
  it("venta de un lead que agendó: la primera", () => {
    expect(caller({ ventasDeSusAgendasHoy: 1, llamadasHoy: 120, agendasHoy: 1, agendasSemana: 3 })).toEqual(["venta_agenda", "ll100", "ag3", "grabacion"]);
  });
});

describe("mensajes del closer", () => {
  it("sin novedades: solo grabación (la motivación es de callers)", () => expect(closer({ agendasSemana: 20 })).toEqual(["grabacion"]));
  it("ventas 1/3/5 del mes, solo el día de una venta nueva", () => {
    expect(closer({ ventasHoy: 1, ventasMes: 1 })[0]).toBe("v1");
    expect(closer({ ventasHoy: 1, ventasMes: 4 })[0]).toBe("v3");
    expect(closer({ ventasHoy: 2, ventasMes: 9 })[0]).toBe("v5");
    expect(closer({ ventasHoy: 0, ventasMes: 9 })).toEqual(["grabacion"]);
  });
  it("agendas 3/10 de la semana, el día en que le entra una nueva", () => {
    expect(closer({ agendasNuevasHoy: 1, agendasSemana: 2 })).toEqual(["grabacion"]);
    expect(closer({ agendasNuevasHoy: 1, agendasSemana: 3 })[0]).toBe("cag3");
    expect(closer({ agendasNuevasHoy: 1, agendasSemana: 12 })[0]).toBe("cag10");
  });
});

describe("cuándo sale la ventana", () => {
  it("la primera vez del día, siempre", () => expect(tocaVentana(undefined, "2026-11-11", ["grabacion"])).toEqual({ toca: true, nuevaCookie: "2026-11-11|" }));
  it("el mismo día sin novedades, no", () => expect(tocaVentana("2026-11-11|", "2026-11-11", ["motivacion", "grabacion"]).toca).toBe(false));
  it("el mismo día con una felicitación nueva, sí, y la suma a las vistas", () => {
    expect(tocaVentana("2026-11-11|ag1", "2026-11-11", ["ll100", "ag1", "grabacion"])).toEqual({ toca: true, nuevaCookie: "2026-11-11|ag1,ll100" });
    expect(tocaVentana("2026-11-11|ag1,ll100", "2026-11-11", ["ll100", "grabacion"]).toca).toBe(false);
  });
  it("otro día, sí, aunque sean las mismas", () => expect(tocaVentana("2026-11-10|ag1", "2026-11-11", ["ag1"]).toca).toBe(true));
});

describe("precarga por rol", () => {
  it("máximo 3 secciones por rol", () => {
    for (const rutas of Object.values(PRECARGA_ROL)) expect(rutas.length).toBeLessThanOrEqual(3);
  });
});

describe("mensajesAlEntrar (acción)", () => {
  const como = (rol: string) => vi.mocked(getSesion).mockResolvedValue({ perfil: { id: "u1", rol, nombre: "Ana Test" }, proyecto: { id: "p1", zona_horaria: "Europe/Madrid" } } as never);
  beforeEach(() => {
    puestas.length = 0;
    cookie = undefined;
    numerosCaller.mockClear();
    numerosCloser.mockClear();
  });
  it("director y CEO no reciben nada, ni se consulta la base", async () => {
    for (const rol of ["director", "ceo"]) {
      como(rol);
      expect(await mensajesAlEntrar()).toEqual({ error: "No tienes permiso para esto." });
    }
    expect(numerosCaller).not.toHaveBeenCalled();
    expect(numerosCloser).not.toHaveBeenCalled();
  });
  it("un caller: sus mensajes y la cookie del día", async () => {
    como("caller");
    expect(await mensajesAlEntrar()).toMatchObject({ rol: "caller", mensajes: ["motivacion", "grabacion"], textos: [{ titulo: "Buenos días, Ana" }, {}] });
    expect(puestas[0][0]).toBe("eternity_mensajes_u1_p1");
  });
  it("un closer con una venta hoy; la segunda vez del día ya no sale", async () => {
    como("closer");
    const r = await mensajesAlEntrar();
    expect(r).toMatchObject({ rol: "closer", mensajes: ["v1", "grabacion"], textos: [{ titulo: "¡Nueva venta!" }, { titulo: "Graba tus llamadas" }] });
    cookie = String(puestas[0][1]);
    expect(await mensajesAlEntrar()).toBeNull();
  });
});
