// S2-18 (Cristian, 17 nov): un solo nombre en toda la app. Cambiar el nombre en Equipo lo copia al perfil
// y a las demás filas de miembros_equipo de esa persona. Base simulada como en c9-arreglos.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string } | null };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let consultas: Consulta[];
let fila: Record<string, unknown> | null;
const tipo = (c: Consulta) => ["delete", "upsert", "update", "insert"].find((o) => c.ops.some(([x]) => x === o)) ?? "select";
const arg = (c: Consulta, op: string) => c.ops.find(([x]) => x === op)?.[1];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "neq", "update", "insert", "maybeSingle", "single"]) q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: Resp) => unknown, f?: (e: unknown) => unknown) =>
        Promise.resolve<Resp>(tabla === "miembros_equipo" && tipo(c) === "select" ? { data: fila, error: null } : { data: null, error: null }).then(r, f);
      return q;
    },
  }),
}));
vi.mock("@/lib/permisos", async () => ({ exigirSeccion: async () => (await import("@/lib/sesion")).getSesion() }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => undefined }));

const { getSesion } = await import("@/lib/sesion");
const { actualizarMiembroEquipo } = await import("@/app/(panel)/equipo/acciones");

const cambios = { area_id: null, puesto_id: null, lider: false, activo: true, comision: null };
const updates = (tabla: string) => consultas.filter((c) => c.tabla === tabla && tipo(c) === "update");

beforeEach(() => {
  consultas = [];
  vi.mocked(getSesion).mockResolvedValue({ perfil: { id: "ceo", rol: "ceo" }, proyecto: { id: "p1", nombre: "Eternity" } } as never);
});

describe("S2-18 · nombre único desde Equipo", () => {
  it("con cuenta: copia el nombre nuevo al perfil y a sus otras filas", async () => {
    fila = { perfil_id: "facu", comision: null, nombre: "Facu Cepeda" };
    expect(await actualizarMiembroEquipo("m1", { nombre: "  Facu bro ", ...cambios })).toBeUndefined(); // sin error
    const [perfil] = updates("perfiles");
    expect(perfil).toBeDefined();
    expect(arg(perfil, "update")).toEqual([{ nombre: "Facu bro" }]);
    expect(arg(perfil, "eq")).toEqual(["id", "facu"]);
    const otras = updates("miembros_equipo").find((c) => (arg(c, "eq") as unknown[])[0] === "perfil_id");
    expect(arg(otras!, "update")).toEqual([{ nombre: "Facu bro" }]);
    expect(arg(otras!, "eq")).toEqual(["perfil_id", "facu"]);
  });

  it("sin cuenta: solo cambia su fila", async () => {
    fila = { perfil_id: null, comision: null, nombre: "Ana" };
    await actualizarMiembroEquipo("m1", { nombre: "Ana López", ...cambios });
    expect(updates("perfiles")).toHaveLength(0);
    expect(updates("miembros_equipo")).toHaveLength(1);
  });

  it("si el nombre no cambia, no toca el perfil", async () => {
    fila = { perfil_id: "facu", comision: null, nombre: "Facu Cepeda" };
    await actualizarMiembroEquipo("m1", { nombre: "Facu Cepeda", ...cambios });
    expect(updates("perfiles")).toHaveLength(0);
    expect(updates("miembros_equipo")).toHaveLength(1);
  });
});
