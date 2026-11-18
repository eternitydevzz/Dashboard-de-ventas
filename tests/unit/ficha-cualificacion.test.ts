// C6 (plan Callers, 7 nov; 7c.2): ficha de cualificación en el guion. 8 campos + «Nota», texto libre, ninguno
// obligatorio. Se guarda siempre; el servidor solo escribe si algo cambió (idempotente).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPOS_ANTIGUOS, CAMPOS_FICHA, conAntiguosDe, fichaAlLeer, limpiarFicha, mismaFicha } from "@/lib/ficha-cualificacion";

type Resp = { data: unknown; error: { message: string } | null };
let respuesta: Record<string, Resp>;
let escrituras: { tabla: string; op: string; args: unknown[] }[];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      let op = "select";
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "maybeSingle", "single"]) q[m] = () => q;
      for (const m of ["upsert", "update", "insert"]) q[m] = (...args: unknown[]) => ((op = m), escrituras.push({ tabla, op: m, args }), q);
      q.then = (r: (v: Resp) => unknown) => Promise.resolve(respuesta[`${tabla}:${op}`] ?? { data: null, error: null }).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => undefined }));
const { getSesion } = await import("@/lib/sesion");
const { guardarFichaDe } = await import("@/lib/ficha-cualificacion-datos");

beforeEach(() => {
  escrituras = [];
  vi.mocked(getSesion).mockResolvedValue({ perfil: { id: "u1", rol: "caller" }, proyecto: { id: "p1" } } as never);
  respuesta = { "leads:select": { data: { id: "l1", caller_id: "u1", closer_id: null }, error: null } };
});

describe("C6 · campos de la ficha", () => {
  // Fase E (Jose, 18 nov): los 11 del formulario van en el orden de la plantilla del WhatsApp de la cita
  it("el formulario: los 11 de la plantilla de Jose, en su orden", () => {
    expect(CAMPOS_FICHA.map((c) => c.k)).toEqual(["contexto", "experiencia", "motivacion", "importe", "respuesta", "edad", "situacion", "decision", "lugar", "conclusion", "tiempo"]);
    expect(CAMPOS_FICHA.map((c) => c.t)).toEqual(["Contexto del lead", "Experiencia", "Motivación", "Importe informado", "Respuesta", "Edad", "Situación actual", "Decisión", "Lugar", "Conclusión", "Tiempo disponible"]);
  });
  it("los 4 antiguos (fuera del formulario, nunca se borran)", () => {
    expect(CAMPOS_ANTIGUOS.map((c) => [c.k, c.t])).toEqual([["dolor", "Dolor"], ["objecion", "Objeción principal"], ["resultado", "Resultado"], ["nota", "Nota"]]);
    expect(limpiarFicha({ dolor: " x ", conclusion: " y " })).toEqual({ dolor: "x", conclusion: "y" });
  });
  it("limpia: solo campos conocidos, texto recortado, vacíos fuera y como mucho 2.000 caracteres", () => {
    expect(limpiarFicha({ lugar: "  Madrid ", edad: 34, hack: "x", dolor: "", nota: "a".repeat(2500) })).toEqual({ lugar: "Madrid", edad: "34", nota: "a".repeat(2000) });
    expect(limpiarFicha(null)).toEqual({});
    expect(limpiarFicha("texto")).toEqual({});
  });
  it("compara sin importar el orden ni los vacíos", () => {
    expect(mismaFicha({ lugar: "Madrid", edad: "34" }, { edad: "34", lugar: "Madrid", dolor: "" })).toBe(true);
    expect(mismaFicha({ lugar: "Madrid" }, { lugar: "Sevilla" })).toBe(false);
  });
});

describe("C6 · guardar (idempotente)", () => {
  it("si no cambió nada, no escribe", async () => {
    respuesta["cualificaciones:select"] = { data: { campos: { lugar: "Madrid" } }, error: null };
    expect(await guardarFichaDe("l1", { lugar: " Madrid " })).toEqual({ cambiado: false });
    expect(escrituras).toHaveLength(0);
  });
  it("si cambió, guarda una sola fila por lead (upsert)", async () => {
    respuesta["cualificaciones:select"] = { data: { campos: { lugar: "Madrid" } }, error: null };
    expect(await guardarFichaDe("l1", { lugar: "Madrid", edad: "34" })).toEqual({ cambiado: true });
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0]).toMatchObject({ tabla: "cualificaciones", op: "upsert" });
    expect(escrituras[0].args[0]).toMatchObject({ lead_id: "l1", proyecto_id: "p1", campos: { lugar: "Madrid", edad: "34" }, actualizado_por: "u1" });
  });
  it("un lead que no es suyo: error y no escribe", async () => {
    respuesta["leads:select"] = { data: { id: "l1", caller_id: "otro", closer_id: null }, error: null };
    await expect(guardarFichaDe("l1", { lugar: "Madrid" })).rejects.toThrow(/asignado/);
    expect(escrituras).toHaveLength(0);
  });
  // Fase E: los antiguos se quedan como estaban en la base, mande lo que mande el navegador (versión vieja o sendBeacon)
  it("conserva los campos antiguos de la base y no deja que el navegador los cambie", async () => {
    respuesta["cualificaciones:select"] = { data: { campos: { dolor: "viejo", nota: "n" } }, error: null };
    expect(await guardarFichaDe("l1", { contexto: "A", dolor: "nuevo" })).toEqual({ cambiado: true });
    expect(escrituras[0].args[0]).toMatchObject({ campos: { contexto: "A", dolor: "viejo", nota: "n" } });
  });
  it("si el navegador solo cambia un antiguo, no escribe", async () => {
    respuesta["cualificaciones:select"] = { data: { campos: { contexto: "A", nota: "n" } }, error: null };
    expect(await guardarFichaDe("l1", { contexto: "A" })).toEqual({ cambiado: false });
    expect(await guardarFichaDe("l1", { contexto: "A", nota: "otra" })).toEqual({ cambiado: false });
    expect(escrituras).toHaveLength(0);
  });
  it("si la base falla al guardar, da error (no «guardado»)", async () => {
    respuesta["cualificaciones:upsert"] = { data: null, error: { message: "caída" } };
    await expect(guardarFichaDe("l1", { lugar: "Madrid" })).rejects.toThrow();
  });
});

describe("Fase E · conAntiguosDe (función pura)", () => {
  it("los 11 de la nueva + los 4 antiguos de la guardada", () => {
    expect(conAntiguosDe({ contexto: "A", dolor: "nuevo" }, { dolor: "viejo", nota: "n", lugar: "Madrid" })).toEqual({ contexto: "A", dolor: "viejo", nota: "n" });
  });
  it("un antiguo que no estaba guardado no entra", () => {
    expect(conAntiguosDe({ dolor: "x" }, {})).toEqual({});
    expect(conAntiguosDe({ dolor: "x" }, null)).toEqual({});
  });
});

// A9 (13 nov): si la lectura falla, lo escrito mientras tanto se pone encima de la base al leerla bien (no la pisa)
describe("C6 · ficha al leer tras un fallo", () => {
  const base = { lugar: "Madrid", dolor: "No llega a fin de mes" };
  it("sin nada escrito: la de la base, o la copia sin guardar del navegador (como antes)", () => {
    expect(fichaAlLeer(base, null, {})).toEqual(base);
    expect(fichaAlLeer(base, { lugar: "Sevilla" }, {})).toEqual({ lugar: "Sevilla" });
  });
  it("lo escrito sin leer se suma a la base sin borrar sus campos", () => {
    expect(fichaAlLeer(base, null, { edad: "34", dolor: "Deudas" })).toEqual({ lugar: "Madrid", dolor: "Deudas", edad: "34" });
  });
  it("los vacíos escritos sin leer no borran nada de la base", () => {
    expect(fichaAlLeer(base, null, { lugar: "  " })).toEqual(base);
  });
});
