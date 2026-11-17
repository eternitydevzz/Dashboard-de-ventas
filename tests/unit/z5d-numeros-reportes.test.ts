// Fases 5 y 6 · zona D (17 nov): números y reportes. Hallazgos de AUDITORIA.md: A2-01, A5-05, S3-1, S3-2, A3b-04,
// S2-15, A4-05, X5 (S2-12, S2-13, S2-14) y A2-05.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fechaReal, leerPeriodo, rangoNav } from "@/lib/periodos";
import { calcularFunnel, type Base } from "@/lib/metricas";
import { rangoDe } from "@/lib/formato";
import type { Perfil } from "@/lib/tipos";

const leer = (ruta: string) => readFileSync(ruta, "utf8");
const NY = "America/New_York";

describe("A2-01 · fechas imposibles en la dirección", () => {
  it("fechaReal solo acepta días que existen", () => {
    expect(fechaReal("2026-02-28")).toBe(true);
    expect(fechaReal("2028-02-29")).toBe(true);
    for (const f of ["2026-13-01", "2026-00-10", "2026-02-31", "2026-02-29", "2026-04-31", "2026-1-01", "hola", undefined]) expect(fechaReal(f)).toBe(false);
  });
  it("leerPeriodo descarta las imposibles y rangoNav no revienta", () => {
    const p = leerPeriodo({ p: "rango", desde: "2026-13-01", hasta: "2026-02-31" });
    expect(p.desde).toBeUndefined();
    expect(p.hasta).toBeUndefined();
    expect(leerPeriodo({ p: "rango", desde: "2026-02-01", hasta: "2026-02-28" }).hasta).toBe("2026-02-28");
    expect(() => rangoNav("rango", 0, NY, "2026-13-01", "2026-13-05")).not.toThrow();
  });
  it("KPIs y Mi Funnel limpian desde/hasta antes de rangoDe", () => {
    expect(leer("src/app/(panel)/mi-funnel/page.tsx")).not.toMatch(/sp\.desde as string/);
    expect(leer("src/app/(panel)/kpis/page.tsx")).not.toMatch(/sp\.desde as string/);
  });
});

describe("A5-05 · Funnel por persona sin tasas imposibles", () => {
  const thiago: Perfil = { id: "thiago", nombre: "Thiago", email: "t@t", rol: "caller", telefono: null, whatsapp: null, admin_activo: false, onboarding_completo: true, activo: true };
  const octubre = rangoDe("rango", NY, "2026-10-01", "2026-10-31");
  // 1 lead suyo entra en octubre (sin cita); agenda 11 leads que entraron antes; uno de ellos 3 veces
  const viejos = Array.from({ length: 11 }, (_, i) => ({ id: `v${i}`, creado_en: "2026-09-10T15:00:00Z", caller_id: "thiago", closer_id: null }));
  const base: Base = {
    gente: [thiago],
    leads: [{ id: "nuevo", creado_en: "2026-10-02T15:00:00Z", caller_id: "thiago", closer_id: null }, ...viejos],
    citas: [
      ...viejos.map((l, i) => ({ id: `c${i}`, lead_id: l.id, closer_id: null, agendada_por: "thiago", fecha: "2026-10-20T15:00:00Z", estado: "pendiente", creado_en: "2026-10-05T15:00:00Z" })),
      { id: "x1", lead_id: "v0", closer_id: null, agendada_por: "thiago", fecha: "2026-10-21T15:00:00Z", estado: "pendiente", creado_en: "2026-10-06T15:00:00Z" },
      { id: "x2", lead_id: "v0", closer_id: null, agendada_por: "thiago", fecha: "2026-10-22T15:00:00Z", estado: "pendiente", creado_en: "2026-10-07T15:00:00Z" },
    ],
    ventas: [],
    actividades: [],
    pagos: [],
  };
  it("Lead → Agendado nunca pasa del 100 % y los agendados son leads distintos", () => {
    const m = calcularFunnel(base, octubre, thiago, NY);
    expect(m.tasas.leadAgendado).toBeLessThanOrEqual(100);
    expect(m.tasas.leadAgendado).toBe(0); // el único lead que entró en octubre no agendó
    expect(m.agendados).toBe(11); // 13 citas, 11 leads
  });
});

describe("S3-1 + S3-2 · «llamada» en Objetivos y bienvenida = cualquier botón; Objetivos pagina", () => {
  const obj = leer("src/lib/objetivos.ts");
  const bienvenida = leer("src/lib/mensajes-entrada-datos.ts");
  it("Objetivos lee las mismas actividades que KPIs (ACTS_CUENTAN)", () => {
    expect(obj).not.toContain('.in("tipo", ["llamada", "whatsapp"])');
    expect(obj.match(/\.or\(ACTS_CUENTAN\)/g)?.length).toBe(2);
    expect(leer("src/lib/metricas.ts")).toMatch(/export const ACTS_CUENTAN/);
  });
  it("Objetivos usa el porTrozos de datos.ts, que pagina", () => {
    expect(obj).not.toMatch(/async function porTrozos/);
    expect(obj).toMatch(/import \{[^}]*porTrozos[^}]*\} from "@\/lib\/datos"/);
  });
  it("la bienvenida cuenta las llamadas como KPIs (cualquier botón, 1 por lead)", () => {
    expect(bienvenida).not.toContain('.eq("tipo", "llamada")');
    expect(bienvenida).toContain("ACTS_CUENTAN");
    expect(bienvenida).toContain("leadsLlamados");
  });
});

describe("Reporte de fin de día", () => {
  const pagina = leer("src/app/(panel)/reportes/page.tsx");
  const form = leer("src/app/(panel)/reportes/formulario.tsx");
  it("A3b-04: agendas, WhatsApp y seguimientos cuentan 1 por lead, como las llamadas", () => {
    expect(pagina).not.toMatch(/a\.filter\(\(x\) => x\.tipo === "whatsapp"\)\.length/);
    expect(pagina).not.toMatch(/llamar_luego"\)\.length/);
    expect(pagina).not.toMatch(/agendas: agendas \?\? 0/);
    expect(pagina.match(/porLead\(/g)?.length).toBeGreaterThanOrEqual(3);
  });
  it("S2-15: el día por defecto es el del proyecto, no el del aparato", () => {
    expect(form).not.toContain("new Date().toLocaleDateString");
    expect(pagina).toMatch(/hoy=\{hoyEnZona\(proyecto\.zona_horaria\)\}/);
  });
  it("A4-05: un campo mal en un paso escondido lleva a ese paso y dice por qué", () => {
    expect(form).toContain("onInvalidCapture");
    expect(form).toContain("data-paso");
  });
});

describe("X5 · listas que se cortaban sin avisar", () => {
  it("S2-12 Grabaciones: por periodo, todas las filas y el error se lanza", () => {
    const g = leer("src/app/(panel)/grabaciones/page.tsx");
    expect(g).not.toContain(".limit(500)");
    expect(g).toContain("leerPeriodo");
    expect(g).toContain("todas<");
  });
  it("S2-13 Guiones: la persona va en la consulta y se avisa del corte", () => {
    expect(leer("src/lib/guiones-datos.ts")).toMatch(/eq\("perfil_id", persona\)/);
    expect(leer("src/app/(panel)/guiones/page.tsx")).toMatch(/ultimasMarcas\(proyecto\.id, persona\)/);
    expect(leer("src/app/(panel)/guiones/page.tsx")).toContain("marcas.cortada");
  });
  it("S2-14 Reportes: por periodo, todas las filas y el error se lanza", () => {
    const r = leer("src/app/(panel)/reportes/page.tsx");
    expect(r).not.toContain(".limit(200)");
    expect(r).toContain("leerPeriodo");
    expect(r).toContain("BarraPeriodo");
  });
});

describe("A2-05 · campana de avisos", () => {
  const c = leer("src/components/campana-avisos.tsx");
  it("fondo casi opaco y se cierra con Escape o clic fuera", () => {
    expect(c).toContain("ventana");
    expect(c).toContain('"Escape"');
    expect(c).toContain("pointerdown");
  });
});
