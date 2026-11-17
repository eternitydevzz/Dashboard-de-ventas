// Fase C (reporte diario): la pantalla «Reporte» de Administración. Cada mercado (España = «es», USA = «latam»)
// tiene su hora, sus emails, sus WhatsApp, sus partes y su interruptor, en la tabla reporte_config.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

let respuesta: { data: unknown; error: { message: string } | null };
let escrituras: { tabla: string; op: string; args: unknown[] }[];
let perfilSesion: { id: string; rol: string; admin_activo: boolean };

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, refresh: () => undefined }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => undefined }));
vi.mock("@/lib/sesion", () => ({ COOKIE_PROYECTO: "proyecto", getSesion: async () => ({ perfil: perfilSesion, proyecto: { id: "p1" }, proyectos: [] }) }));
vi.mock("@/lib/datos", () => ({
  db: () => ({
    from: (tabla: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order"]) q[m] = () => q;
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve(respuesta).then(ok);
      q.upsert = (...args: unknown[]) => (escrituras.push({ tabla, op: "upsert", args }), Promise.resolve({ data: null, error: null }));
      return q;
    },
  }),
  escribir: async (p: PromiseLike<unknown>) => p,
}));

const { configPorDefecto, validarConfig, leerConfigsReporte, ZONA_REPORTE } = await import("@/lib/reporte-config");
const { guardarConfigReporte } = await import("@/app/(panel)/admin/acciones-reporte");
const { ErrorUsuario } = await import("@/lib/resultado");

const base = () => configPorDefecto("es");

beforeEach(() => {
  respuesta = { data: [], error: null };
  escrituras = [];
  perfilSesion = { id: "u1", rol: "ceo", admin_activo: false };
});

describe("configPorDefecto y ZONA_REPORTE", () => {
  it("las zonas de cada mercado", () => {
    expect(ZONA_REPORTE).toEqual({ es: "Europe/Madrid", latam: "America/New_York" });
  });
  it("por defecto: encendido, 21:00, info@eternity.llc, sin WhatsApp y las 5 partes", () => {
    expect(configPorDefecto("latam")).toEqual({
      mercado: "latam",
      activo: true,
      hora: "21:00",
      emails: ["info@eternity.llc"],
      whatsapps: [],
      partes: ["por_persona", "totales_dia", "totales_mes", "va_mal", "objetivos"],
    });
  });
});

describe("validarConfig", () => {
  it("acepta la de por defecto", () => {
    expect(validarConfig(base(), "es")).toEqual(base());
  });
  it("rechaza horas que no son cuartos de hora o no existen", () => {
    expect(() => validarConfig({ ...base(), hora: "21:10" }, "es")).toThrow(ErrorUsuario);
    expect(() => validarConfig({ ...base(), hora: "25:00" }, "es")).toThrow(ErrorUsuario);
    expect(validarConfig({ ...base(), hora: "07:45" }, "es").hora).toBe("07:45");
  });
  it("rechaza un email sin arroba", () => {
    expect(() => validarConfig({ ...base(), emails: ["sin-arroba"] }, "es")).toThrow(ErrorUsuario);
  });
  it("rechaza 11 emails y acepta 10", () => {
    const n = (k: number) => Array.from({ length: k }, (_, i) => `p${i}@eternity.llc`);
    expect(() => validarConfig({ ...base(), emails: n(11) }, "es")).toThrow(ErrorUsuario);
    expect(validarConfig({ ...base(), emails: n(10) }, "es").emails).toHaveLength(10);
  });
  it("rechaza ningún email y emails repetidos", () => {
    expect(() => validarConfig({ ...base(), emails: [] }, "es")).toThrow(ErrorUsuario);
    expect(() => validarConfig({ ...base(), emails: ["a@b.com", "A@b.com"] }, "es")).toThrow(ErrorUsuario);
  });
  it("WhatsApp: rechaza «+12» y acepta «+34600111222»", () => {
    expect(() => validarConfig({ ...base(), whatsapps: ["+12"] }, "es")).toThrow(ErrorUsuario);
    expect(validarConfig({ ...base(), whatsapps: ["+34600111222"] }, "es").whatsapps).toEqual(["+34600111222"]);
  });
  it("rechaza la parte «ventas» y una lista sin partes", () => {
    expect(() => validarConfig({ ...base(), partes: ["ventas"] }, "es")).toThrow(ErrorUsuario);
    expect(() => validarConfig({ ...base(), partes: [] }, "es")).toThrow(ErrorUsuario);
  });
  it("el mercado sale del argumento, no de la entrada", () => {
    expect(validarConfig({ ...base(), mercado: "latam" }, "es").mercado).toBe("es");
  });
});

describe("leerConfigsReporte", () => {
  it("sin filas: las 2 por defecto", async () => {
    expect(await leerConfigsReporte("p1")).toEqual({ es: configPorDefecto("es"), latam: configPorDefecto("latam") });
  });
  it("con una fila guardada, esa manda y la otra va por defecto", async () => {
    respuesta = { data: [{ mercado: "latam", activo: false, hora: "20:30", emails: ["x@y.com"], whatsapps: [], partes: ["va_mal"] }], error: null };
    const r = await leerConfigsReporte("p1");
    expect(r.latam).toEqual({ mercado: "latam", activo: false, hora: "20:30", emails: ["x@y.com"], whatsapps: [], partes: ["va_mal"] });
    expect(r.es).toEqual(configPorDefecto("es"));
  });
  it("si la lectura falla, lanza", async () => {
    respuesta = { data: null, error: { message: "la base no responde" } };
    await expect(leerConfigsReporte("p1")).rejects.toThrow(/la base no responde/);
  });
});

describe("guardarConfigReporte", () => {
  it("un caller: error de permiso y no escribe", async () => {
    perfilSesion = { id: "u2", rol: "caller", admin_activo: false };
    expect(await guardarConfigReporte("es", base())).toMatchObject({ error: "No tienes permiso para esto." });
    expect(escrituras).toHaveLength(0);
  });
  it("un director sin Administración: error de permiso y no escribe", async () => {
    perfilSesion = { id: "u3", rol: "director", admin_activo: false };
    expect(await guardarConfigReporte("es", base())).toMatchObject({ error: "No tienes permiso para esto." });
    expect(escrituras).toHaveLength(0);
  });
  it("el CEO: guarda por proyecto y mercado", async () => {
    expect(await guardarConfigReporte("latam", { ...configPorDefecto("latam"), hora: "22:15" })).toBeUndefined();
    expect(escrituras).toHaveLength(1);
    const [fila, opciones] = escrituras[0].args as [Record<string, unknown>, Record<string, unknown>];
    expect(escrituras[0].tabla).toBe("reporte_config");
    expect(fila).toMatchObject({ proyecto_id: "p1", mercado: "latam", hora: "22:15", activo: true });
    expect(opciones).toEqual({ onConflict: "proyecto_id,mercado" });
  });
  it("datos mal: error y no escribe", async () => {
    expect(await guardarConfigReporte("es", { ...base(), hora: "21:10" })).toMatchObject({ error: expect.any(String) });
    expect(await guardarConfigReporte("xx" as never, base())).toMatchObject({ error: expect.any(String) });
    expect(escrituras).toHaveLength(0);
  });
});

describe("Administración: la pestaña nueva", () => {
  const pagina = readFileSync(new URL("../../src/app/(panel)/admin/page.tsx", import.meta.url), "utf8");
  it("tiene «Reporte» y sigue teniendo «Reportes»", () => {
    expect(pagina).toContain('t: "Reporte"');
    expect(pagina).toContain('t: "Reportes"');
  });
});
