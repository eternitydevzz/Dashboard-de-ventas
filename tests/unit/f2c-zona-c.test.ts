// Fase 2 zona c (Cristian, 16 nov 2026): formularios de venta y Ranking de closers
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { calcularKpis, calcularRanking } from "@/lib/kpis";
import { crearUnaVez } from "@/components/acciones-lead";
import type { Base } from "@/lib/metricas";
import { rangoDe } from "@/lib/formato";
import type { Perfil } from "@/lib/tipos";

const leer = (ruta: string) => readFileSync(new URL(`../../src/${ruta}`, import.meta.url), "utf8");
const trozo = (texto: string, desde: string, hasta: string) => texto.slice(texto.indexOf(desde), texto.indexOf(hasta, texto.indexOf(desde)));

describe("S4-8 · Registrar venta: el Método no se pierde al cambiar a cuotas", () => {
  it("el bloque «Método» está una sola vez y fuera del condicional de cuotas", () => {
    const form = trozo(leer("components/acciones-lead.tsx"), "export function FormVenta", "Fecha de la venta");
    expect(form.match(/name="metodo"/g)).toHaveLength(1);
    // Solo «Número de cuotas» depende de la forma de pago: el Método no se vuelve a montar
    expect(form).toMatch(/\{tipo === "cuotas" && \(\s*<label[^]*?num_cuotas[^]*?<\/label>\s*\)\}/);
  });
});

describe("S2-10 · «Nuevo cliente»: un doble clic crea una sola venta", () => {
  it("usa crearUnaVez como «Nueva venta»", () => {
    const nuevo = trozo(leer("app/(panel)/clientes/cliente.tsx"), "export function NuevoCliente", "\n}\n");
    expect(nuevo).toMatch(/crearUnaVez\(/);
    expect(nuevo).toMatch(/unaVez\(/);
  });

  it("crearUnaVez: dos envíos seguidos lanzan una sola acción", () => {
    const fn = vi.fn(() => new Promise(() => {})); // sigue guardando
    const unaVez = crearUnaVez(new Set(), (f) => void f(), () => {});
    unaVez("cliente", fn, "");
    unaVez("cliente", fn, "");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("A5-03 · Ranking de closers: cerradas y facturación cuentan las mismas ventas", () => {
  const NY = "America/New_York";
  const todo = rangoDe("todo", NY);
  const persona = (id: string, rol: Perfil["rol"]): Perfil =>
    ({ id, nombre: id, email: `${id}@t`, rol, telefono: null, whatsapp: null, admin_activo: false, onboarding_completo: true, activo: true }) as Perfil;
  const thiago = persona("thiago", "closer");
  const ana = persona("ana", "closer");
  // Caso real (10 nov): la cita cerrada es de Thiago, pero la venta de 1.997 $ está a nombre de Facu (caller)
  const base = (): Base => ({
    gente: [thiago, ana, persona("facu", "caller")],
    leads: [],
    actividades: [],
    citas: [
      { id: "c1", lead_id: "l1", closer_id: "thiago", agendada_por: "facu", creado_en: "2026-11-09T15:00:00Z", fecha: "2026-11-10T18:00:00Z", estado: "cerrada" },
      { id: "c2", lead_id: "l2", closer_id: "ana", agendada_por: null, creado_en: "2026-11-09T15:00:00Z", fecha: "2026-11-10T19:00:00Z", estado: "cerrada" },
    ],
    ventas: [
      { id: "v1", lead_id: "l1", vendedor_id: "facu", fecha: "2026-11-10T19:00:00Z", facturacion: 1997, cash_collected: 1997 },
      { id: "v2", lead_id: "l2", vendedor_id: "ana", fecha: "2026-11-10T20:00:00Z", facturacion: 1000, cash_collected: 1000 },
    ] as Base["ventas"],
    pagos: [],
  });
  const ranking = () =>
    calcularRanking(base(), todo, NY, { perfil: thiago, jefe: true, mercados: {}, pedido: null, proyecto: {} }).closers!;

  it("Thiago: 0 cerradas, 0 $ y 0 % (la venta es de Facu)", () => {
    const t = ranking().find((c) => c.perfil.id === "thiago")!;
    expect([t.cerradas, t.facturacion, t.cierreSobreAsistencia]).toEqual([0, 0, 0]);
  });

  it("Ana: 1 cerrada, 1.000 $ y 100 % (venta a su nombre)", () => {
    const a = ranking().find((c) => c.perfil.id === "ana")!;
    expect([a.cerradas, a.facturacion, a.cierreSobreAsistencia]).toEqual([1, 1000, 100]);
  });

  it("KPIs → Por persona no cambia: sigue contando la cita cerrada", () => {
    expect(calcularKpis(base(), todo, NY).closers.find((c) => c.perfil.id === "thiago")!.cerradas).toBe(1);
  });
});
