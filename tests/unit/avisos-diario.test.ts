// Plan GHL F2: el email diario del CEO solo sale a las 8:00 de Madrid y una vez por fecha.
import { beforeEach, describe, expect, it, vi } from "vitest";

let filas: string[]; // «proyecto|fecha» ya guardadas
const enviar = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: (f: { proyecto_id: string; fecha: string }) => ({
        select: () => {
          const k = `${f.proyecto_id}|${f.fecha}`;
          const nueva = !filas.includes(k);
          if (nueva) filas.push(k);
          return Promise.resolve({ data: nueva ? [f] : [], error: null });
        },
      }),
      delete: () => ({ eq: (_c: string, p: string) => ({ eq: (_d: string, fecha: string) => ((filas = filas.filter((k) => k !== `${p}|${fecha}`)), Promise.resolve({ error: null })) }) }),
    }),
  }),
}));
vi.mock("@/lib/email", () => ({ enviarEmail: (...a: unknown[]) => enviar(...a) }));
vi.mock("@/lib/avisos-ceo", () => ({
  ZONA_CEO: "Europe/Madrid",
  avisosCeo: async () => [{ tipo: "envio_rojo", cuantos: 2, texto: "2 envío(s) en rojo que no llegaron a GHL" }],
  reporteDia: async () => ({ dia: "2026-11-07", leads: 5, agendas: 3 }),
}));
const { enviarDiario } = await import("@/lib/avisos-diario");

beforeEach(() => {
  filas = [];
  enviar.mockReset().mockResolvedValue({ enviado: true, motivo: "" });
});

const P = "p1";
const OCHO_INVIERNO = new Date("2026-11-09T07:00:00Z"); // 8:00 en Madrid (UTC+1)
const OCHO_VERANO = new Date("2026-07-09T06:00:00Z"); // 8:00 en Madrid (UTC+2)

describe("enviarDiario", () => {
  it("manda a info@eternity.llc a las 8 de Madrid, en invierno y en verano, con el reporte y los avisos", async () => {
    for (const ahora of [OCHO_INVIERNO, OCHO_VERANO]) {
      filas = [];
      expect((await enviarDiario(P, ahora)).estado).toBe("enviado");
    }
    expect(enviar).toHaveBeenCalledTimes(2);
    const o = enviar.mock.calls[0][0];
    expect(o.para).toEqual(["info@eternity.llc"]);
    expect(o.texto).toContain("5 lead(s)");
    expect(o.texto).toContain("3 agenda(s)");
    expect(o.texto).toContain("2 envío(s) en rojo");
  });

  it("a las 7 o a las 9 de Madrid no manda nada ni guarda la fecha", async () => {
    for (const ahora of [new Date("2026-11-09T06:00:00Z"), new Date("2026-11-09T08:00:00Z"), new Date("2026-07-09T07:00:00Z")]) {
      expect((await enviarDiario(P, ahora)).estado).toBe("fuera_de_hora");
    }
    expect(enviar).not.toHaveBeenCalled();
    expect(filas).toEqual([]);
  });

  it("no manda 2 veces el mismo día (las dos llamadas de 06:00 y 07:00 UTC)", async () => {
    expect((await enviarDiario(P, OCHO_INVIERNO)).estado).toBe("enviado");
    expect((await enviarDiario(P, new Date("2026-11-09T07:30:00Z"))).estado).toBe("ya_enviado");
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("si el email falla, suelta la fecha para que la siguiente llamada lo reintente", async () => {
    enviar.mockResolvedValueOnce({ enviado: false, motivo: "Resend respondió 500" });
    const r = await enviarDiario(P, OCHO_INVIERNO);
    expect(r).toEqual({ estado: "fallo", motivo: "Resend respondió 500" });
    expect(filas).toEqual([]);
    expect((await enviarDiario(P, OCHO_INVIERNO)).estado).toBe("enviado");
  });
});
