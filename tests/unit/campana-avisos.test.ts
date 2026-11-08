// Plan GHL F1b: la ventana con el reporte del día sale solo al CEO y una vez al día por persona (cookie).
import { beforeEach, describe, expect, it, vi } from "vitest";

const puestas: unknown[][] = [];
let cookie: string | undefined;
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookie ? { value: cookie } : undefined), set: (...a: unknown[]) => puestas.push(a) }) }));
const reporteDia = vi.fn(async () => ({ dia: "2026-11-07", leads: 5, agendas: 2 }));
vi.mock("@/lib/avisos-ceo", () => ({ reporteDia }));
const { getSesion } = await import("@/lib/sesion");
const { reporteAlEntrar } = await import("@/app/(panel)/avisos-acciones");

const como = (rol: string) => vi.mocked(getSesion).mockResolvedValue({ perfil: { id: "u1", rol }, proyecto: { id: "p1" } } as never);

beforeEach(() => {
  puestas.length = 0;
  cookie = undefined;
  reporteDia.mockClear();
});

describe("F1b · reporte al entrar", () => {
  it("un director, un closer o un caller no reciben nada, ni se consulta la base", async () => {
    for (const rol of ["director", "closer", "caller"]) {
      como(rol);
      expect(await reporteAlEntrar()).toEqual({ error: "No tienes permiso para esto." });
    }
    expect(reporteDia).not.toHaveBeenCalled();
  });
  it("el CEO lo recibe la primera vez y se apunta el día en su cookie", async () => {
    como("ceo");
    expect(await reporteAlEntrar()).toEqual({ dia: "2026-11-07", leads: 5, agendas: 2 });
    expect(puestas[0].slice(0, 2)).toEqual(["eternity_reporte_u1", "2026-11-07"]);
  });
  it("el mismo día no sale otra vez; otro día, sí", async () => {
    como("ceo");
    cookie = "2026-11-07";
    expect(await reporteAlEntrar()).toBeNull();
    expect(puestas).toHaveLength(0);
    cookie = "2026-11-06";
    expect(await reporteAlEntrar()).toMatchObject({ leads: 5 });
  });
});
