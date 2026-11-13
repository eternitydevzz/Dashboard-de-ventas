import { describe, expect, it } from "vitest";
import { contenidoMercado, mercadoValido } from "@/lib/mercado";

// Cristian (13 nov 2026): equipo de España con sus links, recursos, guion y manuales; lo que no tenga, lo de Latam
const L1 = { nombre: "PIF", url: "https://buy.stripe.com/latam" };
const E1 = { nombre: "PIF €", url: "https://buy.stripe.com/es" };
const proyecto = { moneda: "USD" as const, link_agenda: "https://agenda/latam", link_reserva: "https://reserva/latam" };
const proyectoEs = { ...proyecto, link_agenda_es: "https://agenda/es", link_reserva_es: "https://reserva/es" };
const producto = { links_pago: [L1], link_pago: null };
const productoEs = { ...producto, links_pago_es: [E1] };
const recursos = [{ id: "a", mercado: "latam" }, { id: "b" }, { id: "c", mercado: "es" }];
const soloLatam = [{ id: "a", mercado: "latam" }, { id: "b" }];
const guiones = [{ mercado: "latam", contenido: "L" }, { mercado: "es", contenido: "E" }];

describe("contenidoMercado", () => {
  it("España con contenido propio ve lo suyo", () => {
    const c = contenidoMercado("es");
    expect(c.mercado).toBe("es");
    expect(c.linkAgenda(proyectoEs)).toBe("https://agenda/es");
    expect(c.linkReserva(proyectoEs)).toBe("https://reserva/es");
    expect(c.linksPago(productoEs)).toEqual([E1]);
    expect(c.filas(recursos).map((r) => r.id)).toEqual(["c"]);
    expect(c.guion(guiones)?.contenido).toBe("E");
    expect(c.moneda(proyecto)).toBe("EUR");
  });

  it("España sin contenido propio cae en lo de Latam (y paga en €)", () => {
    const c = contenidoMercado("es");
    expect(c.linkAgenda(proyecto)).toBe("https://agenda/latam");
    expect(c.linkReserva({ ...proyecto, link_reserva_es: "" })).toBe("https://reserva/latam");
    expect(c.linksPago({ ...producto, links_pago_es: [] })).toEqual([L1]);
    expect(c.filas(soloLatam).map((r) => r.id)).toEqual(["a", "b"]);
    expect(c.guion([guiones[0]])?.contenido).toBe("L");
    expect(c.moneda(proyecto)).toBe("EUR");
  });

  it("Latam ve lo de siempre aunque España tenga lo suyo", () => {
    const c = contenidoMercado("latam");
    expect(c.linkAgenda(proyectoEs)).toBe("https://agenda/latam");
    expect(c.linkReserva(proyectoEs)).toBe("https://reserva/latam");
    expect(c.linksPago(productoEs)).toEqual([L1]);
    expect(c.filas(recursos).map((r) => r.id)).toEqual(["a", "b"]);
    expect(c.guion(guiones)?.contenido).toBe("L");
    expect(c.moneda(proyecto)).toBe("USD");
  });

  it("sin elegir (null) es como Latam", () => {
    const c = contenidoMercado(null);
    expect(c.mercado).toBe("latam");
    expect(c.linkAgenda(proyectoEs)).toBe("https://agenda/latam");
    expect(c.linksPago(productoEs)).toEqual([L1]);
    expect(c.filas(recursos).map((r) => r.id)).toEqual(["a", "b"]);
    expect(c.guion(guiones)?.contenido).toBe("L");
    expect(c.moneda(proyecto)).toBe("USD");
  });

  it("quien edita mirando España ve solo lo de España (para no copiar lo de Latam al guardar)", () => {
    const c = contenidoMercado("es", { crudo: true });
    expect(c.linkAgenda(proyecto)).toBeNull();
    expect(c.linkReserva(proyecto)).toBeNull();
    expect(c.linksPago(producto)).toEqual([]);
    expect(c.filas(soloLatam)).toEqual([]);
  });

  it("sin guion guardado, null; y los links no válidos de España no cuentan", () => {
    expect(contenidoMercado("es").guion([])).toBeNull();
    expect(contenidoMercado("es").linksPago({ ...producto, links_pago_es: [{ nombre: "x", url: "http://no" }] })).toEqual([L1]);
  });
});

describe("mercadoValido", () => {
  it("solo latam o es", () => {
    expect(mercadoValido("es")).toBe("es");
    expect(mercadoValido("latam")).toBe("latam");
    expect(mercadoValido("ES")).toBeNull();
    expect(mercadoValido(null)).toBeNull();
  });
});
