// Ola 6 · 6S (decisiones de Cristian, 13 nov): B1, solo el CEO cambia la contraseña o el email de OTRA persona;
// B2, crear cuentas con acceso desde Equipo exige también Administración. Base simulada, datos inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";

const cambiarUsuario = vi.fn(async () => ({ error: null }));
const crearUsuario = vi.fn(async () => ({ data: { user: { id: "nuevo" } }, error: null }));
// Cada consulta contesta según su tabla: la persona está en el proyecto y es un caller
const fila: Record<string, unknown> = { miembros_proyecto: { perfil_id: "x" }, perfiles: { id: "otra", rol: "caller" }, miembros_equipo: { id: "m1", nombre: "Ana", perfil_id: null } };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { updateUserById: cambiarUsuario, createUser: crearUsuario, deleteUser: async () => ({ error: null }) } },
    from: (tabla: string) => {
      let lectura = true;
      const q: Record<string, unknown> = {};
      // Escrituras, conteos y `neq` («¿otra persona con ese email?») contestan vacío
      for (const m of ["select", "eq", "neq", "update", "insert", "maybeSingle", "single"])
        q[m] = (...a: unknown[]) => {
          if (["update", "insert", "neq"].includes(m) || (m === "select" && (a[1] as { head?: boolean })?.head)) lectura = false;
          return q;
        };
      q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: lectura ? fila[tabla] ?? null : null, error: null, count: 0 }).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/permisos", async () => ({ exigirSeccion: async () => (await import("@/lib/sesion")).getSesion() }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => undefined }));

const { getSesion } = await import("@/lib/sesion");
const { cambiarPassword } = await import("@/app/(panel)/admin/acciones");
const { cambiarEmailPersona } = await import("@/app/(panel)/equipo/ficha-acciones");
const { crearMiembro, darAccesoMiembro } = await import("@/app/(panel)/equipo/acciones");

const ceo = { id: "ceo", rol: "ceo", admin_activo: false };
const dirAdmin = { id: "dir", rol: "director", admin_activo: true };
const dirSinAdmin = { id: "dir2", rol: "director", admin_activo: false };
const como = (perfil: object) => vi.mocked(getSesion).mockResolvedValue({ perfil, proyecto: { id: "p1", nombre: "Eternity" } } as never);

beforeEach(() => {
  cambiarUsuario.mockClear();
  crearUsuario.mockClear();
});

describe("B1 · contraseña y email de otra persona: solo el CEO", () => {
  it("un director con Administración no cambia la contraseña ni el email de otro", async () => {
    como(dirAdmin);
    expect(await cambiarPassword("otra", "Clave-nueva-1")).toEqual({ error: expect.stringMatching(/Solo el CEO/) });
    expect(await cambiarEmailPersona("otra", "nuevo@x.com")).toEqual({ error: expect.stringMatching(/Solo el CEO/) });
    expect(cambiarUsuario).not.toHaveBeenCalled();
  });
  it("lo suyo sí puede (aunque no sea CEO)", async () => {
    como(dirAdmin);
    fila.perfiles = { id: "dir", rol: "director" };
    expect(await cambiarPassword("dir", "Clave-nueva-1")).toBeUndefined();
    expect(await cambiarEmailPersona("dir", "yo@x.com")).toBeUndefined();
    expect(cambiarUsuario).toHaveBeenCalledTimes(2);
    fila.perfiles = { id: "otra", rol: "caller" };
  });
  it("el CEO cambia los de otra persona", async () => {
    como(ceo);
    expect(await cambiarPassword("otra", "Clave-nueva-1")).toBeUndefined();
    expect(await cambiarEmailPersona("otra", "nuevo@x.com")).toBeUndefined();
    expect(cambiarUsuario).toHaveBeenCalledTimes(2);
  });
});

describe("B2 · crear cuentas con acceso desde Equipo exige Administración", () => {
  const alta = (modo: "crear" | "organigrama") =>
    crearMiembro({ nombres: ["Ana"], area_id: null, puesto_id: null, comision: null, lider: false, acceso: modo === "crear" ? { modo, email: "ana@x.com", password: "12345678", rol: "caller", mercado: "latam", telefono: "+34 600 000 000" } : { modo } } as never);

  it("un director con Equipo pero sin Administración no crea cuentas ni da acceso; solo al organigrama sí", async () => {
    como(dirSinAdmin);
    expect(await alta("crear")).toEqual({ error: expect.stringMatching(/Administración/) });
    expect(await darAccesoMiembro("m1", "ana@x.com", "12345678", "caller", "latam", "+34 600 000 000")).toEqual({ error: expect.stringMatching(/Administración/) });
    expect(crearUsuario).not.toHaveBeenCalled();
    expect(await alta("organigrama")).toEqual({ creados: 1 });
  });
  it("con Administración (o el CEO), sí", async () => {
    for (const p of [dirAdmin, ceo]) {
      como(p);
      expect(await alta("crear")).toEqual({ creados: 1 });
      expect(await darAccesoMiembro("m1", "ana@x.com", "12345678", "caller", "latam", "+34 600 000 000")).toBeUndefined();
    }
    expect(crearUsuario).toHaveBeenCalledTimes(4);
  });
});
