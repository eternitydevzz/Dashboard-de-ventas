// Fase 1b · zona b: el Deshacer de un estado de cita no pisa un cambio posterior de otra persona. Con `siEstado`,
// cambiarEstadoCita solo escribe si la cita sigue en el estado que dejó ese clic (como deshacerResultado, Fase 1).
// La base se simula: cada consulta apunta sus operaciones; datos inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Consulta = { tabla: string; ops: [string, unknown[]][] };
const h = vi.hoisted(() => ({ consultas: [] as { tabla: string; ops: [string, unknown[]][] }[], filas: 1 }));
vi.mock("@/lib/datos", () => ({
  db: () => ({
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      h.consultas.push(c);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "update", "maybeSingle", "single"]) q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: unknown) => unknown) => {
        const esUpdate = c.ops.some(([o]) => o === "update");
        const data = esUpdate ? Array.from({ length: h.filas }, () => ({ id: "c1" })) : { id: "c1", lead_id: "l1", closer_id: "p1", estado: "confirmada", nota: null };
        return Promise.resolve({ data, error: null }).then(r);
      };
      return q;
    },
  }),
  escribir: async (p: PromiseLike<unknown>) => p,
  registrarActividad: vi.fn(async () => undefined),
  todas: vi.fn(),
}));
vi.mock("@/lib/permisos", () => ({ exigirSeccion: async () => undefined }));
vi.mock("@/lib/auth", () => ({ getSesion: async () => ({ perfil: { id: "p1", rol: "closer" }, proyecto: { id: "pr1" } }), esJefe: () => false, exigir: vi.fn() }));
vi.mock("@/lib/refrescar", () => ({ refrescarPantalla: () => undefined }));
vi.mock("@/lib/ghl", () => ({ borrarCitaGhl: vi.fn(), cambiarUsuarioCitaGhl: vi.fn() }));
vi.mock("@/lib/cifrado", () => ({ descifrar: vi.fn() }));
vi.mock("@/lib/agenda-libre", () => ({ closerLibreA: vi.fn() }));
vi.mock("@/lib/aviso-closer", () => ({ avisarCloserAgenda: vi.fn() }));
vi.mock("@/lib/leads", () => ({ datosAgendaGhl: vi.fn(), juntarConCitaAbierta: vi.fn(), telefonoClave: vi.fn() }));

const { cambiarEstadoCita } = await import("@/app/(panel)/closer/acciones");
const updateDeCitas = () => h.consultas.find((c) => c.tabla === "citas" && c.ops.some(([o]) => o === "update"))!;

beforeEach(() => {
  h.consultas = [];
  h.filas = 1;
});

describe("cambiarEstadoCita con siEstado (Deshacer)", () => {
  it("solo escribe si la cita sigue en el estado que dejó el clic", async () => {
    expect(await cambiarEstadoCita("c1", "pendiente", "", undefined, "confirmada")).toBeUndefined();
    expect(updateDeCitas().ops).toContainEqual(["eq", ["estado", "confirmada"]]);
  });
  it("si otra persona la cambió después, no escribe nada más y da el error", async () => {
    h.filas = 0;
    expect(await cambiarEstadoCita("c1", "pendiente", "", undefined, "confirmada")).toEqual({ error: "Esta cita cambió después: ya no se puede deshacer." });
    expect(h.consultas.filter((c) => c.tabla === "leads")).toHaveLength(0);
  });
  it("sin siEstado, como siempre: no filtra por estado y el error es el de antes", async () => {
    await cambiarEstadoCita("c1", "pendiente", "");
    expect(updateDeCitas().ops.some(([o, a]) => o === "eq" && a[0] === "estado")).toBe(false);
    h.consultas = [];
    h.filas = 0;
    expect(await cambiarEstadoCita("c1", "pendiente", "")).toEqual({ error: "Esta cita acaba de cambiar. Recarga la página y vuelve a intentarlo." });
  });
});
