// Fases 5-6, zona A (17 nov 2026): S4-1 (texto de fuera en la campana del CEO), S4-2 (token inventado escribe en la
// base), S3-4 (permisos de pipeline que se abren si falla la base) y S4-5 (onboarding en bucle si falla el perfil).
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Base falsa: cada tabla devuelve `filas[tabla]` (o `fallos[tabla]` como error)
let filas: Record<string, unknown>;
let fallos: Record<string, string>;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { updateUserById: async () => ({ error: null }) } },
    from: (tabla: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "or", "gte", "lt", "order", "limit", "update", "insert"]) q[m] = () => q;
      const res = () => (fallos[tabla] ? { data: null, error: { message: fallos[tabla] } } : { data: filas[tabla] ?? null, error: null });
      q.maybeSingle = q.single = async () => res();
      q.then = (r: (v: unknown) => unknown) => Promise.resolve(res()).then(r);
      return q;
    },
  }),
}));
const claves: string[] = [];
vi.mock("@/lib/limite", () => ({ dentroDelLimite: vi.fn(async (clave: string) => (claves.push(clave), true)) }));
const guardados: string[][] = [];
vi.mock("@/lib/errores-app", () => ({ guardarError: vi.fn(async (...a: string[]) => void guardados.push(a)) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4" }) }));
vi.mock("@/lib/entradas-datos", () => ({ enviosEnRojo: async () => [] }));

beforeEach(() => {
  filas = {};
  fallos = {};
  claves.length = 0;
  guardados.length = 0;
});

describe("S4-1 · errores del navegador", () => {
  it("además del límite por conexión hay uno global (muchas IPs no llenan el email del CEO)", async () => {
    const { anotarErrorNavegador } = await import("@/app/acciones-errores");
    await anotarErrorNavegador("/login", "Urgente: entra en http://sitio-falso");
    expect(claves).toContain("error-navegador:1.2.3.4");
    expect(claves).toContain("error-navegador:todos");
    expect(guardados).toHaveLength(1);
  });

  it("en los avisos del CEO, un error del navegador sale marcado «sin verificar»", async () => {
    filas = { errores_app: [{ sitio: "navegador", texto: "/login · Urgente", veces: 1, proyecto_id: null }, { sitio: "acciones", texto: "x", veces: 2, proyecto_id: "p1" }] };
    const { avisosCeo } = await import("@/lib/avisos-ceo");
    const textos = (await avisosCeo("p1")).map((a) => a.texto);
    expect(textos.find((t) => t.includes("Urgente"))).toMatch(/sin verificar/);
    expect(textos.find((t) => t.startsWith("acciones"))).not.toMatch(/sin verificar/);
  });
});

describe("S4-2 · webhook de entrada", () => {
  const llamar = async (token: string) => {
    const { POST } = await import("@/app/api/webhooks/entrada/[token]/route");
    const req = new NextRequest(`http://x/api/webhooks/entrada/${token}`, { method: "POST", body: "{}", headers: { "x-forwarded-for": "9.9.9.9" } });
    return POST(req, { params: Promise.resolve({ token }) } as never);
  };

  it("un token inventado no escribe una fila de límite con su token: solo cuenta el fallo por IP", async () => {
    const token = "a".repeat(48);
    const r = await llamar(token);
    expect(r.status).toBe(404);
    expect(claves).toEqual(["entrada-fallo:9.9.9.9"]);
  });

  it("una Entrada que existe sí lleva su límite por token", async () => {
    const token = "b".repeat(48);
    filas = { entradas: { id: "e1", proyecto_id: "p1", nombre: "Web", activa: true, reglas: [] } };
    await llamar(token);
    expect(claves[0]).toBe(`entrada:${token}`);
  });
});

describe("S3-4 · permisos de pipeline", () => {
  it("si la base falla, se lanza el error (antes devolvía [] y se aplicaba el nivel por defecto)", async () => {
    fallos = { permisos_pipeline: "caída" };
    const { filasPermisoPipeline } = await import("@/lib/pipelines");
    await expect(filasPermisoPipeline(["pl1"])).rejects.toThrow(/caída/);
  });
});

describe("S4-5 · onboarding", () => {
  it("si falla guardar el perfil, se lanza el error y no se manda a «/» (bucle sin mensaje)", async () => {
    vi.doMock("@/lib/auth", () => ({ getSesion: async () => ({ perfil: { id: "u1", rol: "director", onboarding_completo: false, nombre: "", email: "a@b.c" }, proyecto: { id: "p1", nombre: "P" } }) }));
    const redirect = vi.fn((url: string) => {
      throw new Error(`redirect ${url}`);
    });
    vi.doMock("next/navigation", () => ({ redirect }));
    vi.doMock("@/lib/memoria", () => ({ olvidarTodo: vi.fn() }));
    vi.doMock("@/components/editor-horario", () => ({ EditorHorario: () => null }));
    const { default: Pagina } = await import("@/app/onboarding/page");
    const el = (await Pagina({ searchParams: Promise.resolve({}) })) as { props: { children: { props: { accion: (fd: FormData) => Promise<void> } } } };
    const completar = el.props.children.props.accion;
    const fd = new FormData();
    for (const [k, v] of Object.entries({ nombre: "Ana", password: "12345678", password2: "12345678" })) fd.set(k, v);
    fallos = { perfiles: "sin conexión" };
    await expect(completar(fd)).rejects.toThrow(/sin conexión/);
    expect(redirect).not.toHaveBeenCalledWith("/");
  });
});
