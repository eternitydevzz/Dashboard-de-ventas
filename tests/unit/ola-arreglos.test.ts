// Ola única · carril D (Fase 8, Cristian 14 nov: «arregla todo»): errores de la base sin enseñar, enlaces a /closer,
// moneda por mercado del vendedor, nombres accesibles, lecturas que miran su error y la migración de cambiar_forma_pago.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { contenidoMercado } from "@/lib/mercado";
import { crearUnaVez, simboloVenta } from "@/components/acciones-lead";
import { precargaConDatos } from "@/components/bienvenida";

const leer = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), "utf8");
const panel = (r: string) => leer(`src/app/(panel)/${r}`);

// Los del carril D (crm/acciones.ts es del carril B)
const ACCIONES = ["admin", "clientes", "equipo", "guiones", "onboarding-closers", "perfil", "closer/analisis"].map((c) => `src/app/(panel)/${c}/acciones.ts`);

describe("errores de la base: mensaje genérico", () => {
  it.each(ACCIONES)("%s no enseña error.message al usuario", (r) => {
    // Un «.message» que cierra el ErrorUsuario (también tras «? … :»); el de un `new Error(…)` va al registro y vale
    const malas = leer(r).split("\n").filter((l) => /new ErrorUsuario\((?:(?!new Error\().)*\.message\);/.test(l));
    expect(malas).toEqual([]);
  });

  it("resumen.ts mira el error de tarjetas_extra, pipelines y etapas", () => {
    const s = panel("leads/resumen.ts");
    expect(s).toMatch(/error: eExtra/);
    expect(s).toMatch(/error: ePipes/);
    expect(s).toMatch(/error: eEtapas/);
  });
});

describe("enlaces a /closer", () => {
  it("van a /closer/llamadas (Métricas está oculta)", () => {
    expect(leer("src/lib/permisos.ts")).not.toContain('"/closer"');
    expect(panel("leads/[id]/page.tsx")).not.toContain('"/closer"');
  });
});

describe("moneda por mercado del vendedor (Cristian, 14 nov)", () => {
  it("España en €, Latam en la del proyecto", () => {
    expect(contenidoMercado("es").moneda({ moneda: "USD" })).toBe("EUR");
    expect(contenidoMercado("latam").moneda({ moneda: "USD" })).toBe("USD");
    expect(contenidoMercado(null).moneda({ moneda: "USD" })).toBe("USD");
  });

  it("la lista de Ventas usa el mercado de cada vendedor, no el de quien mira", () => {
    const s = panel("ventas/page.tsx");
    expect(s).toContain("mercadosDelProyecto(proyecto.id)");
    expect(s).toMatch(/\$v\(v\.vendedor_id\)\(v\.facturacion\)/);
  });

  it("la ventana de venta usa la moneda del vendedor elegido; si es «Yo», la mía", () => {
    expect(simboloVenta("USD", { id: "closer-1", nombre: "Closer A", moneda: "EUR" })).toBe("€");
    expect(simboloVenta("EUR", { id: "closer-2", nombre: "Closer B", moneda: "USD" })).toBe("$");
    expect(simboloVenta("EUR", undefined)).toBe("€");
    expect(simboloVenta("USD", { id: "caller-1", nombre: "Caller A" })).toBe("$");
  });
});

describe("accesibilidad", () => {
  it("las casillas de «Personas sueltas» tienen nombre accesible", () => {
    const linea = panel("admin/popups.tsx").split("\n").find((l) => l.includes("alterna(d.personas, p.id)"));
    expect(linea).toMatch(/aria-label=\{/);
  });

  it("el botón de borrar venta tiene aria-label", () => {
    expect(panel("ventas/fila-acciones.tsx")).toContain('aria-label="Borrar venta"');
  });
});

describe("bienvenida: una sección cuenta como cargada solo si su _rsc trae datos", () => {
  const e = (x: Partial<PerformanceResourceTiming>) => ({ name: "https://app.test/kpis?_rsc=abc", responseStatus: 200, decodedBodySize: 50_000, ...x }) as PerformanceResourceTiming;
  it("con datos, sí", () => expect(precargaConDatos(e({}))).toBe(true));
  it("el árbol de rutas (respuesta pequeña), no", () => expect(precargaConDatos(e({ decodedBodySize: 600 }))).toBe(false));
  it("una redirección o un fallo, no", () => {
    expect(precargaConDatos(e({ responseStatus: 307 }))).toBe(false);
    expect(precargaConDatos(e({ responseStatus: 500 }))).toBe(false);
  });
  it("sin _rsc, no", () => expect(precargaConDatos(e({ name: "https://app.test/kpis" }))).toBe(false));
});

describe("migración: quitar solo la versión vieja de cambiar_forma_pago", () => {
  it("borra la de 5 parámetros y no la de 6", () => {
    const sql = leer("supabase/migrations/20261118091000_quitar_forma_pago_vieja.sql");
    expect(sql).toContain("drop function if exists public.cambiar_forma_pago(uuid, uuid, text, integer, jsonb);");
    expect(sql).not.toMatch(/uuid\[\]\)/);
  });
});

describe("botones de resultado de la cola: aviso al momento y un solo guardado", () => {
  // ejecutar como useAccion: lanza la acción y avisa al terminar
  const montar = () => {
    const avisos: string[] = [];
    let terminar = () => {};
    const accion = vi.fn(() => new Promise<void>((r) => (terminar = r)));
    const ejecutar = (fn: () => Promise<unknown>, mensaje?: string) => void fn().then(() => mensaje && avisos.push(mensaje));
    const unaVez = crearUnaVez(new Set(), ejecutar, (t) => avisos.push(t));
    return { avisos, accion, unaVez, terminar: () => terminar() };
  };

  it("un doble clic durante el guardado lanza 1 sola acción", async () => {
    const m = montar();
    m.unaVez("resultado", m.accion, "✓ Llamada registrada", true);
    m.unaVez("resultado", m.accion, "✓ Llamada registrada", true);
    expect(m.accion).toHaveBeenCalledTimes(1);
    m.terminar();
    await vi.waitFor(() => expect(m.avisos).toContain("✓ Llamada registrada"));
    m.unaVez("resultado", m.accion, "✓ Llamada registrada", true); // ya terminó: el siguiente clic sí vale
    expect(m.accion).toHaveBeenCalledTimes(2);
  });

  it("«Guardando…» sale antes de que la acción termine", async () => {
    const m = montar();
    m.unaVez("resultado", m.accion, "✓ Llamada registrada", true);
    expect(m.avisos).toEqual(["Guardando…"]);
    m.terminar();
    await vi.waitFor(() => expect(m.avisos).toEqual(["Guardando…", "✓ Llamada registrada"]));
  });

  it("en la cola el mensaje final es «✓ Llamada registrada»", () => {
    expect(leer("src/components/acciones-lead.tsx")).toContain('variante === "cola" ? "✓ Llamada registrada"');
  });
});
