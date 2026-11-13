import { afterAll, describe, expect, it, vi } from "vitest";
import { calcularKpis } from "@/lib/kpis";
import type { Base } from "@/lib/metricas";
import { rangoDe } from "@/lib/formato";
import type { Perfil } from "@/lib/tipos";

const NY = "America/New_York";
const persona = (id: string, rol: Perfil["rol"]): Perfil => ({ id, nombre: id, email: `${id}@t`, rol, telefono: null, whatsapp: null, admin_activo: false, onboarding_completo: true, activo: true });
const octubre = rangoDe("rango", NY, "2026-10-01", "2026-10-31");

// «Hoy» fijo: 15 oct 2026 (las citas de antes ya pasaron; la del 25, no). Se fija al cargar el archivo y no en
// beforeAll: los KPIs se calculan dentro de cada describe, que corre antes que beforeAll (desde el 26 oct, con la
// fecha real, la cita del 25 ya contaba como pasada).
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-10-15T16:00:00Z"));
afterAll(() => vi.useRealTimers());

const llamada = (perfil: string, lead: string, resultado: string, dia: string) => ({ lead_id: lead, perfil_id: perfil, tipo: "llamada", resultado, creado_en: `2026-${dia}T15:00:00Z` });
const cita = (id: string, lead: string, closer: string, por: string, creado: string, fecha: string, estado: string) => ({ id, lead_id: lead, closer_id: closer, agendada_por: por, creado_en: `2026-${creado}T16:00:00Z`, fecha: `2026-${fecha}T18:00:00Z`, estado });

function base(): Base {
  return {
    gente: [persona("carla", "caller"), persona("cris", "caller"), persona("ana", "closer"), persona("beto", "closer")],
    leads: [],
    actividades: [
      llamada("carla", "l1", "no_contesta", "10-03"),
      llamada("carla", "l1", "contestado", "10-03"),
      llamada("carla", "l2", "no_contesta", "10-03"),
      llamada("carla", "l5", "no_contesta", "10-02"),
      llamada("carla", "l5", "contestado", "09-20"), // septiembre: fuera
      { lead_id: "l3", perfil_id: "carla", tipo: "whatsapp", resultado: null, creado_en: "2026-10-03T18:00:00Z" },
      llamada("cris", "l1", "no_contesta", "10-03"), // l1 lo tocan los dos callers
    ],
    citas: [
      cita("c1", "l1", "ana", "carla", "10-04", "10-06", "reagendada"),
      cita("c1b", "l1", "ana", "ana", "10-05", "10-08", "cerrada"), // la reagendó la closer
      cita("c2", "l4", "beto", "carla", "10-04", "10-07", "no_show"), // agendó sin apuntar llamada
      cita("c3", "l2", "ana", "carla", "10-09", "10-25", "pendiente"), // aún no ha pasado
      cita("c6", "l3", "ana", "carla", "10-06", "10-07", "cancelada"),
      cita("c4", "l6", "beto", "cris", "10-05", "10-09", "perdida"),
    ],
    ventas: [
      { id: "v1", lead_id: "l1", vendedor_id: "ana", facturacion: 1997, cash_collected: 500, fecha: "2026-10-08T15:00:00Z", producto_id: null },
      { id: "v2", lead_id: "l2", vendedor_id: "carla", facturacion: 47, cash_collected: 47, fecha: "2026-10-03T15:00:00Z", producto_id: null }, // low ticket de carla
      { id: "v5", lead_id: "l4", vendedor_id: "carla", facturacion: 47, cash_collected: 47, fecha: "2026-10-08T15:00:00Z", producto_id: null }, // low ticket después de agendar: no es «cierre»
      { id: "v3", lead_id: "l6", vendedor_id: "beto", facturacion: 4997, cash_collected: 4997, fecha: "2026-10-09T15:00:00Z", producto_id: null, devuelto: 997, devuelto_en: "2026-10-12T15:00:00Z" },
      { id: "v4", lead_id: "l9", vendedor_id: "ana", facturacion: 1000, cash_collected: 0, fecha: "2026-09-10T15:00:00Z", producto_id: null }, // de septiembre
    ],
    pagos: [
      { importe: 300, fecha: "2026-10-20T15:00:00Z", venta_id: "v1" },
      { importe: 400, fecha: "2026-10-02T15:00:00Z", venta_id: "v4" }, // cuota de octubre de una venta de septiembre
    ],
  };
}

describe("KPIs de callers (H2)", () => {
  const k = calcularKpis(base(), octubre, NY);
  const carla = k.callers.find((c) => c.perfil.id === "carla")!;
  const cris = k.callers.find((c) => c.perfil.id === "cris")!;

  it("contactados (llamada o WhatsApp), contestan y agendar = llamada contestada; se cuentan personas", () => {
    expect(carla.llamadas).toBe(4); // la de septiembre no cuenta
    expect(carla.contactados).toBe(5); // l1, l2, l5 (llamadas), l3 (WhatsApp), l4 (agendó sin llamada)
    expect(carla.contestan).toBe(4); // l1 (contestado) + agendados l1, l2, l3, l4; l5 no contestó
    expect(carla.agendados).toBe(4); // l1 (aunque se reagendó), l4, l2, l3
    expect(carla.agendaSobreContactado).toBe(80);
    expect(carla.agendaSobreContesta).toBe(100);
  });

  it("cierre: compras desde su agenda hechas por otro; su low ticket va aparte", () => {
    expect(carla.cerrados).toBe(1); // l1 (venta de ana); l2 y l4 los compró carla (low ticket)
    expect(carla.cierreSobreContactado).toBe(20);
    expect(carla.cierreSobreAgendado).toBe(25);
    expect(carla.lowTicketVentas).toBe(2);
    expect(carla.lowTicketFacturacion).toBe(94);
  });

  it("asistencia: citas ya pasadas sin canceladas; cuenta la cita reagendada por el closer", () => {
    expect(carla.citasPasadas).toBe(2); // l1 (c1b) y l4; l2 es futura y l3 cancelada
    expect(carla.asistidos).toBe(1); // l1
    expect(carla.asistencia).toBe(50);
    expect(carla.cierreSobreAsistencia).toBe(100);
  });

  it("cada caller por separado y un total sin repetir personas", () => {
    expect(cris.contactados).toBe(2); // l1 (no contestó) y l6 (agendó)
    expect(cris.contestan).toBe(1);
    expect(cris.agendaSobreContactado).toBe(50);
    expect(cris.cerrados).toBe(1); // l6, venta de beto
    expect(cris.asistencia).toBe(100); // «perdida» = asistió
    expect(k.totalCallers.contactados).toBe(6); // l1 cuenta una vez aunque lo tocaran los dos
    expect(k.totalCallers.agendados).toBe(5);
    expect(k.totalCallers.cerrados).toBe(2);
  });

  // N8 (13 nov): desde el 7 nov los botones apuntan «cambio_etapa» y no «llamada»; salía «contestan 66 > contactados 6»
  it("los botones del caller cuentan como contactado: contestan nunca supera a contactados", () => {
    const b = base();
    const boton = (lead: string, resultado: string) => ({ lead_id: lead, perfil_id: "luis", tipo: "cambio_etapa", resultado, creado_en: "2026-10-03T15:00:00Z" });
    b.gente.push(persona("luis", "caller"));
    b.actividades.push(boton("m1", "seguimiento"), boton("m2", "llamar_luego"), boton("m3", "no_responde"), boton("m4", "nuevo"));
    const luis = calcularKpis(b, octubre, NY).callers.find((c) => c.perfil.id === "luis")!;
    expect(luis.contestan).toBe(2); // m1 y m2
    expect(luis.contactados).toBe(3); // + m3 (le llamó y no respondió); «Leads» (m4) no es una llamada
  });
});

describe("KPIs de closers (H2)", () => {
  const k = calcularKpis(base(), octubre, NY);
  const ana = k.closers.find((c) => c.perfil.id === "ana")!;
  const beto = k.closers.find((c) => c.perfil.id === "beto")!;

  it("% cierre sobre agenda y sobre asistencia (sin reagendadas ni canceladas)", () => {
    expect(ana.citas).toBe(2); // c1b y c3
    expect(ana.cierreSobreAgenda).toBe(50);
    expect(ana.cierreSobreAsistencia).toBe(100);
    expect(beto.citas).toBe(2);
    expect(beto.cierreSobreAgenda).toBe(0);
  });

  it("no show con las mismas citas (para el Ranking, 11 oct)", () => {
    expect(beto.noShow).toBe(1); // c2
    expect(ana.noShow).toBe(0);
  });

  it("facturación, cash del periodo (como Finanzas) y % cobrado de lo vendido (como Ventas)", () => {
    expect(ana.facturacion).toBe(1997);
    expect(ana.cash).toBe(500 + 300 + 400); // incluye la cuota de octubre de la venta de septiembre
    expect(ana.cobradoDeLoVendido).toBe(800); // solo ventas de octubre
    expect(ana.pctCobrado).toBe(40.1); // 800 / 1997
    expect(beto.cash).toBe(4000); // 4997 − 997 devueltos en octubre
    expect(beto.pctCobrado).toBe(80); // 4000 / 4997 = 80,05
  });

  it("su parte del total de los closers, y la fila total", () => {
    expect(ana.parteFacturacion).toBe(28.6); // 1997 / 6994
    expect(ana.parteCash).toBe(23.1); // 1200 / 5200
    expect(beto.parteFacturacion).toBe(71.4);
    expect(beto.parteCash).toBe(76.9);
    expect(k.totalClosers.facturacion).toBe(6994);
    expect(k.totalClosers.cierreSobreAgenda).toBe(25);
    expect(k.totalClosers.parteFacturacion).toBe(100);
  });

  it("sin nada sobre lo que calcular, el % queda vacío («—») y no 0 %", () => {
    const b = base();
    b.gente.push(persona("nuevo", "caller"));
    const nuevo = calcularKpis(b, octubre, NY).callers.find((c) => c.perfil.id === "nuevo")!;
    expect(nuevo.agendaSobreContactado).toBeNull();
    expect(nuevo.asistencia).toBeNull();
    expect(beto.cierreSobreAsistencia).toBe(0); // sí tuvo asistidas: aquí el 0 % es real
  });

  it("quien está de baja solo sale si hizo algo en el periodo", () => {
    const b = base();
    b.gente.push({ ...persona("viejo", "closer"), baja: true } as Perfil);
    expect(calcularKpis(b, octubre, NY).closers.map((c) => c.perfil.id)).not.toContain("viejo");
  });
});
