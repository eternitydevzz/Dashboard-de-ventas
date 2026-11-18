// Fase B (pendiente del 17 nov): el popup del lead no lee sus formularios si quien mira no puede ver ese lead.
// Primero se mira el permiso y luego se cargan los envíos: este test lo fija. La base se simula.
import { beforeEach, describe, expect, it, vi } from "vitest";

let lead: { data: unknown; error: { message: string } | null };
const consulta = (tabla: string) => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "maybeSingle"]) q[m] = () => q;
  q.then = (r: (v: unknown) => unknown) => Promise.resolve(tabla === "leads" ? lead : { data: [], error: null }).then(r);
  return q;
};
const cargarEnviosLead = vi.fn(async () => []);
vi.mock("@/lib/datos", () => ({ db: () => ({ from: consulta }), equipo: async () => [] }));
vi.mock("@/lib/auth", () => ({
  getSesion: async () => ({ perfil: { id: "u1", rol: "caller" }, proyecto: { id: "p1", zona_horaria: "Europe/Madrid" } }),
  esJefe: () => false,
}));
vi.mock("@/lib/formularios-lead", () => ({ cargarEnviosLead }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => {} }));

const { resumenLead } = await import("@/app/(panel)/leads/resumen");

const fila = (caller_id: string | null) => ({
  id: "l1",
  nombre: "Lead",
  apellido: null,
  pipeline_id: null,
  etapa_id: null,
  creado_en: "2026-11-15T10:00:00Z",
  caller_id,
  closer_id: null,
  estado_caller: "nuevo",
  etiquetas: [],
});

beforeEach(() => {
  cargarEnviosLead.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("resumenLead: sin permiso no lee los formularios", () => {
  it("lead de otro caller → «No puedes ver este lead» y no carga sus envíos", async () => {
    lead = { data: fila("otro"), error: null };
    expect(await resumenLead("l1")).toEqual({ error: "No puedes ver este lead." });
    expect(cargarEnviosLead).not.toHaveBeenCalled();
  });

  it("lead que no existe en su proyecto → no carga envíos", async () => {
    lead = { data: null, error: null };
    expect(await resumenLead("l1")).toEqual({ error: "No puedes ver este lead." });
    expect(cargarEnviosLead).not.toHaveBeenCalled();
  });

  it("si la lectura del lead falla → no carga envíos", async () => {
    lead = { data: null, error: { message: "la base no responde" } };
    expect(await resumenLead("l1")).toMatchObject({ error: expect.stringMatching(/Algo ha fallado/) });
    expect(cargarEnviosLead).not.toHaveBeenCalled();
  });

  it("control: su propio lead → sí carga los envíos de ese lead en su proyecto", async () => {
    lead = { data: fila("u1"), error: null };
    const r = await resumenLead("l1");
    expect(r).toMatchObject({ id: "l1", formularios: [] });
    expect(cargarEnviosLead).toHaveBeenCalledTimes(1);
    expect(cargarEnviosLead).toHaveBeenCalledWith("p1", "l1");
  });
});
