// Ola única, carril A (Cristian, 14 nov): cualquier botón de resultado de la cola es una llamada (también WhatsApp),
// cada lead cuenta como máximo 1 llamada al día y «contactado» = «llamada». Mismo número en Mis leads, Mi Funnel,
// KPIs y ranking. Y Reportes «hoy» solo cuenta lo del proyecto abierto.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calcularKpis, calcularRanking } from "@/lib/kpis";
import { calcularFunnel, type Base } from "@/lib/metricas";
import { llamadasHoyCola } from "@/lib/kpis-cola";
import { rangoDe } from "@/lib/formato";
import type { Perfil } from "@/lib/tipos";

const NY = "America/New_York";
const noviembre = rangoDe("rango", NY, "2026-11-01", "2026-11-30");
const caller: Perfil = { id: "caller-1", nombre: "caller-1", email: "c1@t", rol: "caller", telefono: null, whatsapp: null, admin_activo: false, onboarding_completo: true, activo: true };
// Lo que guarda cada botón (leads/acciones.ts): «Link de agenda» y «Wsp enviado» → llamada (+ whatsapp), «Agendado» → cita, el resto → cambio_etapa
const act = (lead: string, tipo: string, resultado: string | null, cuando: string) => ({ lead_id: lead, perfil_id: "caller-1", tipo, resultado, creado_en: cuando });

function base(actividades: Base["actividades"]): Base {
  return { gente: [caller], leads: [], citas: [], ventas: [], pagos: [], actividades };
}

// Las 4 pantallas con la misma base: KPIs → Por persona, Ranking, Mi Funnel y «Mis leads» (hoy)
function cifras(acts: Base["actividades"]) {
  const k = calcularKpis(base(acts), noviembre, NY).callers[0];
  const r = calcularRanking(base(acts), noviembre, NY, { perfil: caller, jefe: false, mercados: { "caller-1": "latam" }, pedido: null, proyecto: {} }).callers[0];
  const f = calcularFunnel(base(acts), noviembre, caller, NY);
  return { kpis: k.llamadas, contactados: k.contactados, ranking: r.llamadas, funnel: f.llamadasCaller };
}

describe("llamadas: 1 por lead y día, cualquier botón", () => {
  it("2 botones distintos en el mismo lead el mismo día = 1 llamada y 1 contactado", () => {
    const acts = [act("Lead A", "cambio_etapa", "no_responde", "2026-11-10T15:00:00Z"), act("Lead A", "cambio_etapa", "seguimiento", "2026-11-10T18:00:00Z")];
    expect(cifras(acts)).toEqual({ kpis: 1, contactados: 1, ranking: 1, funnel: 1 });
    expect(llamadasHoyCola(acts)).toBe(1);
  });

  it("otro lead suma otra: 2", () => {
    const acts = [act("Lead A", "cambio_etapa", "no_responde", "2026-11-10T15:00:00Z"), act("Lead A", "cambio_etapa", "seguimiento", "2026-11-10T18:00:00Z"), act("Lead B", "cambio_etapa", "no_interesa", "2026-11-10T16:00:00Z")];
    expect(cifras(acts)).toEqual({ kpis: 2, contactados: 2, ranking: 2, funnel: 2 });
    expect(llamadasHoyCola(acts)).toBe(2);
  });

  it("el mismo lead al día siguiente es otra llamada (día en la zona del proyecto)", () => {
    // 10 nov 23:00 y 11 nov 01:00 en Nueva York = 2 días distintos; 11 nov 03:00Z sigue siendo 10 nov allí
    const acts = [act("Lead A", "cambio_etapa", "no_responde", "2026-11-11T03:00:00Z"), act("Lead A", "cambio_etapa", "no_responde", "2026-11-11T04:00:00Z"), act("Lead A", "cambio_etapa", "seguimiento", "2026-11-11T06:00:00Z")];
    expect(cifras(acts)).toMatchObject({ kpis: 2, ranking: 2, funnel: 2, contactados: 1 }); // contactados = personas distintas
  });

  it("WhatsApp cuenta: «Wsp enviado» (llamada + whatsapp) = 1; «Link de agenda», «Agendado» y «Confirma Agenda» también", () => {
    const acts = [
      act("Lead A", "llamada", "wsp_enviado", "2026-11-10T15:00:00Z"),
      act("Lead A", "whatsapp", "wsp_enviado", "2026-11-10T15:00:01Z"),
      act("Lead B", "llamada", "link_enviado", "2026-11-10T15:00:00Z"),
      act("Lead C", "cita", "agendada", "2026-11-10T15:00:00Z"),
      act("Lead D", "cambio_etapa", "confirma_agenda", "2026-11-10T15:00:00Z"),
      act("Lead E", "cambio_etapa", "nuevo", "2026-11-10T15:00:00Z"), // volver a «Leads» no es un botón de resultado
      act("Lead F", "cambio_etapa", null, "2026-11-10T15:00:00Z"), // mover en el CRM tampoco
    ];
    expect(cifras(acts)).toEqual({ kpis: 4, contactados: 4, ranking: 4, funnel: 4 });
    expect(llamadasHoyCola(acts)).toBe(4);
  });
});

describe("Reportes «hoy»: solo el proyecto abierto", () => {
  it("cada lectura de actividades, citas y ventas filtra por proyecto_id", () => {
    const s = readFileSync("src/app/(panel)/reportes/page.tsx", "utf8");
    const lecturas = s.split("\n").filter((l) => /db\(\)\.from\("(actividades|citas|ventas)"\)/.test(l));
    expect(lecturas).toHaveLength(4);
    for (const l of lecturas) expect(l).toContain('.eq("proyecto_id", proyecto.id)');
  });
});
