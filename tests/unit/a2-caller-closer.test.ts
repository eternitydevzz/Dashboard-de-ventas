// A2 (Cristian, 17 nov 2026): quien es caller y también closer (Facu) usa Agendas y el pipeline «Closers» como un
// closer y, además, ve las citas que agendó como caller. Las que agendó con OTRO closer: solo mirar (D1, Jose).
// Un caller que NO es closer sigue exactamente igual.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A2c: base simulada. Cada consulta guarda sus pasos (select, eq, in, or…) para ver qué filtro llega a la base;
// las escrituras (update, insert, delete) se apuntan aparte. Lo de una fila sale de `una`; las listas, de `lista`.
type Paso = [string, unknown[]];
let consultas: { tabla: string; pasos: Paso[] }[];
let escrituras: [string, string, unknown][];
let una: Record<string, unknown>;
let lista: Record<string, unknown[]>;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => undefined }));
vi.mock("@/lib/agenda-libre", () => ({ closerLibreA: async () => ({ libre: true }) }));
vi.mock("@/lib/permisos-datos", () => ({ cargarDatosPermisos: async () => ({}) }));
vi.mock("@/lib/permisos", async (original) => ({ ...(await original<typeof import("@/lib/permisos")>()), exigirSeccion: async () => undefined }));
vi.mock("@/lib/datos", async (original) => {
  const tabla = (nombre: string) => {
    const q = { tabla: nombre, pasos: [] as Paso[] };
    consultas.push(q);
    let escribe = false;
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "in", "or", "is", "not", "order", "range", "limit"]) c[m] = (...a: unknown[]) => (q.pasos.push([m, a]), c);
    for (const m of ["update", "insert", "delete"]) c[m] = (v?: unknown) => ((escribe = true), escrituras.push([m, nombre, v]), c);
    c.maybeSingle = async () => ({ data: una[nombre] ?? null, error: null });
    c.single = c.maybeSingle;
    c.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: escribe ? [{ id: "x" }] : (lista[nombre] ?? []), error: null }).then(ok, ko);
    return c;
  };
  // Como el de verdad: si la escritura falla, corta
  const escribir = async (p: PromiseLike<{ error: { message: string } | null }>, t: string) => {
    const r = await p;
    if (r.error) throw new Error(`No se pudo guardar en «${t}»: ${r.error.message}`);
    return r;
  };
  return {
    ...(await original<typeof import("@/lib/datos")>()),
    db: () => ({ from: tabla }),
    escribir,
    registrarActividad: async () => undefined,
    todas: async (pedir: (a: number, b: number) => PromiseLike<{ data: unknown[] | null }>) => (await pedir(0, 999)).data ?? [],
    conBajas: async (g: unknown[]) => g,
  };
});
beforeEach(() => {
  consultas = [];
  escrituras = [];
  una = {};
  lista = {};
});

const { getSesion } = await import("@/lib/sesion");
const como = (perfil: object) => vi.mocked(getSesion).mockResolvedValue({ perfil, proyecto: { id: "p1", nombre: "Demo", zona_horaria: "America/New_York", calendario: null, reparto_auto: false } } as never);
const { nivelDefecto, calcularNivel } = await import("@/lib/pipelines");
const { closersVisibles } = await import("@/lib/agendas-datos");
const { cargarCitasVentas } = await import("@/lib/tablero-closers");
const { cambiarEstadoCita, reagendarCita } = await import("@/app/(panel)/closer/acciones");
const { cargarFicha } = await import("@/app/(panel)/equipo/ficha-acciones");

const leer = (ruta: string) => readFileSync(new URL(`../../src/${ruta}`, import.meta.url), "utf8");
const persona = (id: string, rol: "ceo" | "director" | "caller" | "closer", tambien_closer = false) => ({ id, nombre: id, rol, tambien_closer, admin_activo: false, activo: true }) as never;
const facu = persona("facu", "caller", true);
const pepe = persona("pepe", "caller");
const gente = [facu, pepe, persona("ana", "closer"), persona("luis", "closer"), persona("jefe", "ceo")];
const closers = { id: "cl", tipo: "closers" as const };

describe("A2 · nivel del pipeline «Closers»", () => {
  it("por defecto: caller y closer, «Ver»; caller solo, «Sin acceso» (como hoy)", () => {
    expect(nivelDefecto("closers", "caller", true)).toBe("ver");
    expect(nivelDefecto("closers", "caller")).toBe("sin_acceso");
    expect(nivelDefecto("closers", "closer")).toBe("ver");
  });
  it("con filas por rol: a quien es closer le vale la fila de «closer», no la de «caller»", () => {
    const filas = [{ pipeline_id: "cl", rol: "caller", perfil_id: null, nivel: "sin_acceso" as const }];
    expect(calcularNivel(facu, closers, filas)).toBe("ver");
    expect(calcularNivel(pepe, closers, filas)).toBe("sin_acceso");
    expect(calcularNivel(facu, closers, [...filas, { pipeline_id: "cl", rol: "closer", perfil_id: null, nivel: "sin_acceso" as const }])).toBe("sin_acceso");
  });
  it("la fila de la persona sigue mandando", () => {
    expect(calcularNivel(facu, closers, [{ pipeline_id: "cl", rol: null, perfil_id: "facu", nivel: "sin_acceso" }])).toBe("sin_acceso");
  });
});

describe("A2 · qué closers ve cada uno en Agendas", () => {
  it("caller y closer: como un closer, solo él", () => {
    expect(closersVisibles(facu, gente, null).ids).toEqual(["facu"]);
  });
  it("caller solo: igual que hoy (todos los closers; la carga filtra lo que agendó)", () => {
    const r = closersVisibles(pepe, gente, null);
    expect(r.ids).toEqual(["facu", "ana", "luis"]);
    expect(r.closers.map((c) => c.id)).toEqual(["facu", "ana", "luis"]);
  });
});

describe("A2 · lo que exigía rol «closer» ahora acepta a quien es closer", () => {
  it.each(["app/(panel)/closer/acciones.ts", "app/(panel)/closer/llamadas/acciones-fathom.ts", "app/(panel)/closer/llamadas/exportar/route.ts", "app/(panel)/closer/reporte/route.ts"])("%s", (ruta) => {
    const f = leer(ruta);
    expect(f).not.toMatch(/rol !== "closer"\)/);
    expect(f).toMatch(/esCloser\(/);
  });
  it("Agendas: ya no pone a todo caller en «solo mirar»", () => {
    const f = leer("app/(panel)/closer/llamadas/page.tsx");
    expect(f).not.toContain(`mirar = perfil.rol === "caller";`);
    expect(f).toContain(`const doble = perfil.rol === "caller" && esCloser(perfil);`);
    expect(f).toContain(`const mirar = perfil.rol === "caller" && !esCloser(perfil);`);
  });
  it("las citas que agendó con otro closer: solo mirar (D1)", () => {
    expect(leer("app/(panel)/closer/llamadas/page.tsx")).toMatch(/soloMirarIds=/);
    expect(leer("app/(panel)/closer/llamadas/tablero-closers.tsx")).toMatch(/soloMirarIds\?: string\[\]/);
    expect(leer("lib/tablero-closers.ts")).toMatch(/modo: "y" \| "o" = "y"/);
  });
});

// A-2b (aprobado por Jose): el CRM y los KPIs de quien es caller y closer, también con las citas que agendó
describe("A2b · CRM y KPIs de quien es caller y closer", () => {
  it("CRM: el tablero pasa soloMirarIds al TableroClosers y la página los calcula (modo «o»)", () => {
    const t = leer("app/(panel)/crm/tablero.tsx");
    expect(t).toMatch(/soloMirarIds\?: string\[\]/);
    expect(t).toContain("soloMirarIds={tableroClosers.soloMirarIds}");
    const p = leer("app/(panel)/crm/page.tsx");
    expect(p).toMatch(/soloMirarIds:/);
    expect(p).toContain(`personaDoble ? "o" : "y"`);
    expect(p).not.toMatch(/\(jefe \|\| !personaDoble\)/); // Facu también carga las que agendó
  });
  it("KPIs: ya no trata a todo caller igual y usa el modo «o» con quien es caller y closer", () => {
    const k = leer("app/(panel)/kpis/page.tsx");
    expect(k).not.toContain(`const mirar = perfil.rol === "caller";`);
    expect(k).toContain(`const doble = perfil.rol === "caller" && esCloser(perfil);`);
    expect(k).toContain(`doble ? "o" : "y"`);
  });
});

// A2c: comportamiento (no texto). Datos de Facu como en la base: rol caller con «También closer»
const facuBD = { id: "facu", nombre: "Facu", email: "f@t", rol: "caller", tambien_closer: true, admin_activo: false, activo: true, telefono: null, whatsapp: null, onboarding_completo: true };
const jefeBD = { id: "jefe", nombre: "Jefe", email: "j@t", rol: "ceo", tambien_closer: false, admin_activo: true, activo: true };
const pasosDe = (tabla: string) => consultas.filter((q) => q.tabla === tabla).flatMap((q) => q.pasos);

describe("A2c · cargarCitasVentas monta el filtro que toca", () => {
  it("modo «o»: closer_id en la lista O agendada_por = la persona (sin «y»)", async () => {
    await cargarCitasVentas("p1", ["facu"], "facu", false, [], false, "o");
    const pasos = pasosDe("citas");
    expect(pasos).toContainEqual(["or", ["closer_id.in.(facu),agendada_por.eq.facu"]]);
    expect(pasos.some(([m, a]) => m === "eq" && a[0] === "agendada_por")).toBe(false);
    expect(pasos.some(([m, a]) => m === "in" && a[0] === "closer_id")).toBe(false);
  });
  it("modo «y» (por defecto): como antes, closer_id in Y agendada_por eq, sin «or»", async () => {
    await cargarCitasVentas("p1", ["ana", "facu"], "pepe", false, [], false);
    const pasos = pasosDe("citas");
    expect(pasos).toContainEqual(["in", ["closer_id", ["ana", "facu"]]]);
    expect(pasos).toContainEqual(["eq", ["agendada_por", "pepe"]]);
    expect(pasos.some(([m]) => m === "or")).toBe(false);
  });
});

describe("A2c · Facu solo cambia sus citas como closer (citaPermitida)", () => {
  const cita = (closer_id: string) => ({ id: "c1", proyecto_id: "p1", lead_id: "l1", closer_id, agendada_por: "facu", estado: "confirmada", nota: null, fecha: "2026-11-20T15:00:00Z" });
  it("cita que agendó con OTRO closer: «Esta cita no es tuya.» y no escribe nada", async () => {
    como(facuBD);
    una = { citas: cita("ana") };
    expect(await cambiarEstadoCita("c1", "no_show", "")).toEqual({ error: "Esta cita no es tuya." });
    expect(await reagendarCita("c1", "2026-11-21T10:00")).toEqual({ error: "Esta cita no es tuya." });
    expect(escrituras).toEqual([]);
  });
  it("cita suya (closer_id = Facu): pasa el control y la cambia", async () => {
    como(facuBD);
    una = { citas: cita("facu") };
    expect(await cambiarEstadoCita("c1", "no_show", "")).toBeUndefined();
    expect(escrituras).toContainEqual(["update", "citas", expect.objectContaining({ estado: "no_show" })]);
  });
});

describe("A2c · ficha de Facu (Equipo → permisos de pipelines): el nivel de su rol en «Closers»", () => {
  const preparar = (filas: unknown[]) => {
    como(jefeBD);
    una = { miembros_proyecto: { perfil_id: "facu", horario: null, calendario: null, reparto_pct: 0, ghl_user_id: null, ghl_calendar_id: null }, perfiles: facuBD };
    lista = { pipelines: [{ id: "cl", nombre: "Closers", tipo: "closers", solo_jefes: false }], cuentas_fathom: [], permisos_pipeline: filas };
  };
  it("sin filas: «Ver», como calcularNivel", async () => {
    preparar([]);
    const r = (await cargarFicha("facu")) as { pipelines: { delRol: string; efectivo: string }[] };
    expect(r.pipelines[0]).toMatchObject({ delRol: "ver", efectivo: "ver" });
  });
  it("con la fila del rol «caller» en «Sin acceso»: le vale la del rol «closer» (no hay) → «Ver»", async () => {
    preparar([{ pipeline_id: "cl", rol: "caller", perfil_id: null, nivel: "sin_acceso" }]);
    const r = (await cargarFicha("facu")) as { pipelines: { delRol: string; efectivo: string }[] };
    expect(r.pipelines[0]).toMatchObject({ delRol: "ver", efectivo: "ver" });
  });
  it("con la fila del rol «closer» en «Sin acceso»: «Sin acceso»", async () => {
    preparar([{ pipeline_id: "cl", rol: "closer", perfil_id: null, nivel: "sin_acceso" }]);
    const r = (await cargarFicha("facu")) as { pipelines: { delRol: string; efectivo: string }[] };
    expect(r.pipelines[0]).toMatchObject({ delRol: "sin_acceso", efectivo: "sin_acceso" });
  });
});
