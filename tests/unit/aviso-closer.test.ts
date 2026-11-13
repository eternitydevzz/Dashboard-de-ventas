// Fase 3: aviso al closer de una agenda nueva o cambiada (popup en avisos_persona + email). Datos inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({ avisos: [] as Record<string, unknown>[], fallaAviso: false, sinCita: false }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "single", "maybeSingle"]) q[m] = () => q;
      let fila: Record<string, unknown> | null = null;
      q.insert = (f: Record<string, unknown>) => ((fila = f), q);
      const responder = () => {
        if (tabla === "avisos_persona") {
          if (base.fallaAviso) return { data: null, error: { message: "relation does not exist" } };
          base.avisos.push(fila!);
          return { data: null, error: null };
        }
        if (tabla === "citas") return base.sinCita ? { data: null, error: { message: "no está" } } : { data: { fecha: "2026-11-21T16:00:00.000Z", leads: { nombre: "Lucía", apellido: "Prado" } }, error: null };
        if (tabla === "perfiles") return { data: { nombre: "Marta", email: "marta@ejemplo.test", rol: "closer", zona_horaria: "America/Bogota" }, error: null };
        return { data: { zona_horaria: "Europe/Madrid" }, error: null };
      };
      q.then = (r: (v: unknown) => unknown) => Promise.resolve(responder()).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/email", () => ({ enviarEmail: vi.fn(async () => ({ enviado: true, motivo: "" })), urlApp: () => "https://app.ejemplo.test" }));
const { enviarEmail } = await import("@/lib/email");
const { avisarCloserAgenda } = await import("@/lib/aviso-closer");

beforeEach(() => {
  base.avisos = [];
  base.fallaAviso = false;
  base.sinCita = false;
  vi.mocked(enviarEmail).mockClear();
});

describe("avisarCloserAgenda", () => {
  it("guarda el aviso con la hora en la zona del closer y le manda el email", async () => {
    await avisarCloserAgenda({ proyectoId: "p1", closerId: "closer-marta", citaId: "c1", motivo: "nueva" });
    expect(base.avisos).toHaveLength(1);
    // 16:00 UTC = 11:00 en Bogotá (la zona del closer, no la del proyecto)
    expect(base.avisos[0]).toMatchObject({ proyecto_id: "p1", perfil_id: "closer-marta", tipo: "agenda", titulo: "Nueva agenda: Lucía Prado", enlace: "/closer/llamadas" });
    expect(String(base.avisos[0].texto)).toContain("11:00");
    expect(enviarEmail).toHaveBeenCalledTimes(1);
    const email = vi.mocked(enviarEmail).mock.calls[0][0];
    expect(email.para).toEqual(["marta@ejemplo.test"]);
    expect(email.asunto).toBe("Nueva agenda: Lucía Prado");
    expect(email.html).toContain("https://app.ejemplo.test/closer/llamadas");
  });

  it("cambio: otro título", async () => {
    await avisarCloserAgenda({ proyectoId: "p1", closerId: "closer-marta", citaId: "c1", motivo: "cambio" });
    expect(base.avisos[0].titulo).toBe("Agenda cambiada: Lucía Prado");
  });

  it("si falla el aviso, se manda igual el email y no lanza", async () => {
    base.fallaAviso = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(avisarCloserAgenda({ proyectoId: "p1", closerId: "closer-marta", citaId: "c1", motivo: "nueva" })).resolves.toBeUndefined();
    expect(enviarEmail).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("si no puede leer la cita, no lanza (no rompe guardar la cita)", async () => {
    base.sinCita = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(avisarCloserAgenda({ proyectoId: "p1", closerId: "closer-marta", citaId: "c1", motivo: "nueva" })).resolves.toBeUndefined();
    expect(enviarEmail).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
