// N12 (13 nov): ficha_lead del MCP enseña los mismos textos que la ficha en pantalla. La base se simula.
import { describe, expect, it, vi } from "vitest";

const filas: Record<string, unknown[]> = {
  actividades: [
    { tipo: "cambio_etapa", resultado: "llamar_luego", nota: "→ Llamar luego", creado_en: "2026-11-10T22:35:00Z", perfil_id: "u1" },
    { tipo: "nota", resultado: null, nota: "automática", creado_en: "2026-11-10T22:00:00Z", perfil_id: null },
    { tipo: "llamada", resultado: "codigo_raro", nota: null, creado_en: "2026-11-10T21:00:00Z", perfil_id: "se_fue" },
  ],
};
const consulta = (tabla: string) => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) q[m] = () => q;
  q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: filas[tabla] ?? [], error: null }).then(r);
  return q;
};
vi.mock("@/lib/datos", () => ({ db: () => ({ from: consulta }), equipo: async () => [{ id: "u1", nombre: "Tomas" }], todas: async () => [] }));
vi.mock("@/lib/auth", () => ({ getSesion: async () => ({ proyecto: { id: "p1", nombre: "Proyecto", zona_horaria: "America/New_York" } }), esJefe: () => true }));
vi.mock("@/app/(panel)/leads/resumen", () => ({ resumenLead: async () => ({ id: "l1", nombre: "Lead", pais: "ES" }) }));

const { herramientaFichaLead } = await import("@/lib/mcp/lectura");

describe("ficha_lead: textos como la ficha en pantalla", () => {
  it("país con su nombre; historial con «Sistema», tipo sin guion bajo y el resultado con su nombre", async () => {
    const r = await herramientaFichaLead({ leadId: "l1" });
    expect(r.pais).toBe("España");
    expect(r.historial.map((h) => [h.quien, h.tipo, h.resultado])).toEqual([
      ["Tomas", "cambio etapa", "Llamar luego"],
      ["Sistema", "nota", null],
      ["—", "llamada", "codigo_raro"], // quien ya no está, «—»; un resultado sin nombre, tal cual (como la pantalla)
    ]);
  });
});
