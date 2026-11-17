// Fase D (Jose, 17 nov): la pestaña «WhatsApp» de Administración. Para cada aviso (cita agendada y venta cerrada),
// un interruptor y a quién se manda (closer, caller que la agendó, grupo de los CEO), en la tabla whatsapp_config;
// y el id del grupo de WhatsApp de los CEO en proyectos.whatsapp_grupo.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

let respuesta: { data: unknown; error: { message: string } | null };
let escrituras: { tabla: string; op: string; args: unknown[]; filtros: unknown[][] }[];
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
      q.upsert = (...args: unknown[]) => (escrituras.push({ tabla, op: "upsert", args, filtros: [] }), Promise.resolve({ data: null, error: null }));
      q.update = (...args: unknown[]) => {
        const e = { tabla, op: "update", args, filtros: [] as unknown[][] };
        escrituras.push(e);
        const u: Record<string, unknown> = {};
        u.eq = (...f: unknown[]) => (e.filtros.push(f), u);
        u.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok);
        return u;
      };
      return q;
    },
  }),
  escribir: async (p: PromiseLike<unknown>) => p,
}));

const { EVENTOS_WHATSAPP, configWhatsappPorDefecto, validarConfigWhatsapp, grupoValido, leerConfigsWhatsapp } = await import("@/lib/whatsapp-config");
const { guardarConfigWhatsapp, guardarGrupoWhatsapp } = await import("@/app/(panel)/admin/acciones-whatsapp");
const { ErrorUsuario } = await import("@/lib/resultado");

beforeEach(() => {
  respuesta = { data: [], error: null };
  escrituras = [];
  perfilSesion = { id: "u1", rol: "ceo", admin_activo: false };
});

describe("configWhatsappPorDefecto", () => {
  it("los 2 eventos, en orden", () => {
    expect(EVENTOS_WHATSAPP).toEqual(["cita", "venta"]);
  });
  it("por defecto: encendido y a los tres", () => {
    expect(configWhatsappPorDefecto("venta")).toEqual({ evento: "venta", activo: true, a_closer: true, a_caller: true, a_grupo: true });
  });
});

describe("validarConfigWhatsapp", () => {
  it("acepta la de por defecto", () => {
    expect(validarConfigWhatsapp(configWhatsappPorDefecto("cita"), "cita")).toEqual(configWhatsappPorDefecto("cita"));
  });
  it("rechaza a_closer: «si» (no es booleano)", () => {
    expect(() => validarConfigWhatsapp({ ...configWhatsappPorDefecto("cita"), a_closer: "si" }, "cita")).toThrow(ErrorUsuario);
  });
  it("rechaza lo que no es un objeto y un evento desconocido", () => {
    expect(() => validarConfigWhatsapp(null, "cita")).toThrow(ErrorUsuario);
    expect(() => validarConfigWhatsapp(configWhatsappPorDefecto("cita"), "xx" as never)).toThrow(ErrorUsuario);
  });
  it("el evento sale del argumento, no de la entrada", () => {
    expect(validarConfigWhatsapp({ ...configWhatsappPorDefecto("cita"), evento: "venta" }, "cita").evento).toBe("cita");
  });
});

describe("grupoValido", () => {
  it("vacío = sin grupo (null)", () => {
    expect(grupoValido("")).toBeNull();
    expect(grupoValido("   ")).toBeNull();
  });
  it("recorta los espacios", () => {
    expect(grupoValido(" 120363012345678901@g.us ")).toBe("120363012345678901@g.us");
  });
  it("rechaza un número suelto (@c.us) y lo que no es texto", () => {
    expect(() => grupoValido("12345@c.us")).toThrow(ErrorUsuario);
    expect(() => grupoValido("12345@c.us")).toThrow("El id del grupo tiene que terminar en @g.us");
    expect(() => grupoValido(12345)).toThrow(ErrorUsuario);
  });
});

describe("leerConfigsWhatsapp", () => {
  it("sin filas: las 2 por defecto", async () => {
    expect(await leerConfigsWhatsapp("p1")).toEqual({ cita: configWhatsappPorDefecto("cita"), venta: configWhatsappPorDefecto("venta") });
  });
  it("con una fila guardada, esa manda y la otra va por defecto", async () => {
    respuesta = { data: [{ evento: "venta", activo: false, a_closer: true, a_caller: false, a_grupo: true }], error: null };
    const r = await leerConfigsWhatsapp("p1");
    expect(r.venta).toEqual({ evento: "venta", activo: false, a_closer: true, a_caller: false, a_grupo: true });
    expect(r.cita).toEqual(configWhatsappPorDefecto("cita"));
  });
  it("si la lectura falla, lanza", async () => {
    respuesta = { data: null, error: { message: "la base no responde" } };
    await expect(leerConfigsWhatsapp("p1")).rejects.toThrow(/la base no responde/);
  });
});

describe("guardarConfigWhatsapp", () => {
  it("un caller: error de permiso y no escribe", async () => {
    perfilSesion = { id: "u2", rol: "caller", admin_activo: false };
    expect(await guardarConfigWhatsapp("cita", configWhatsappPorDefecto("cita"))).toMatchObject({ error: "No tienes permiso para esto." });
    expect(escrituras).toHaveLength(0);
  });
  it("el CEO: guarda por proyecto y evento", async () => {
    expect(await guardarConfigWhatsapp("venta", { ...configWhatsappPorDefecto("venta"), a_grupo: false })).toBeUndefined();
    expect(escrituras).toHaveLength(1);
    const [fila, opciones] = escrituras[0].args as [Record<string, unknown>, Record<string, unknown>];
    expect(escrituras[0].tabla).toBe("whatsapp_config");
    expect(fila).toMatchObject({ proyecto_id: "p1", evento: "venta", activo: true, a_closer: true, a_caller: true, a_grupo: false });
    expect(typeof fila.actualizado_en).toBe("string");
    expect(opciones).toEqual({ onConflict: "proyecto_id,evento" });
  });
  it("datos mal: error y no escribe", async () => {
    expect(await guardarConfigWhatsapp("cita", { ...configWhatsappPorDefecto("cita"), a_caller: 1 })).toMatchObject({ error: expect.any(String) });
    expect(escrituras).toHaveLength(0);
  });
});

describe("guardarGrupoWhatsapp", () => {
  it("valor malo: error y no escribe", async () => {
    expect(await guardarGrupoWhatsapp("12345@c.us")).toMatchObject({ error: "El id del grupo tiene que terminar en @g.us" });
    expect(escrituras).toHaveLength(0);
  });
  it("un caller: error de permiso y no escribe", async () => {
    perfilSesion = { id: "u2", rol: "caller", admin_activo: false };
    expect(await guardarGrupoWhatsapp("120363012345678901@g.us")).toMatchObject({ error: "No tienes permiso para esto." });
    expect(escrituras).toHaveLength(0);
  });
  it("el CEO: guarda el grupo en su proyecto (vacío = null)", async () => {
    expect(await guardarGrupoWhatsapp(" 120363012345678901@g.us ")).toBeUndefined();
    expect(await guardarGrupoWhatsapp("")).toBeUndefined();
    expect(escrituras.map((e) => [e.tabla, e.op, e.args[0], e.filtros])).toEqual([
      ["proyectos", "update", { whatsapp_grupo: "120363012345678901@g.us" }, [["id", "p1"]]],
      ["proyectos", "update", { whatsapp_grupo: null }, [["id", "p1"]]],
    ]);
  });
});

describe("Administración: la pestaña nueva", () => {
  const pagina = readFileSync(new URL("../../src/app/(panel)/admin/page.tsx", import.meta.url), "utf8");
  it("tiene «WhatsApp» y sigue teniendo «Reporte» y «Reportes»", () => {
    expect(pagina).toContain('t: "WhatsApp"');
    expect(pagina).toContain('t: "Reporte"');
    expect(pagina).toContain('t: "Reportes"');
  });
});
