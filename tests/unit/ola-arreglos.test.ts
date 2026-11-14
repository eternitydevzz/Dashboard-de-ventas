// Ola única · carril D (Fase 8, Cristian 14 nov: «arregla todo»): errores de la base sin enseñar, enlaces a /closer,
// moneda por mercado del vendedor, nombres accesibles, lecturas que miran su error y la migración de cambiar_forma_pago.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { contenidoMercado } from "@/lib/mercado";
import { crearUnaVez, simboloVenta } from "@/components/acciones-lead";
import { precargaConDatos } from "@/components/bienvenida";
import VentasPage from "@/app/(panel)/ventas/page";

// Ventas con la base simulada: `filas` = lo que devuelve cada `todas()` (ventas del periodo, ventas para el cash, pagos)
const filas: unknown[][] = [];
vi.mock("@/lib/datos", async (orig) => ({
  ...(await orig<typeof import("@/lib/datos")>()),
  todas: async () => filas.shift() ?? [],
  equipo: async () => [],
  idsDePrueba: async () => new Set<string>(),
}));
vi.mock("@/lib/permisos", async (orig) => ({
  ...(await orig<typeof import("@/lib/permisos")>()),
  exigirPagina: async () => ({ perfil: { id: "ceo-1", rol: "ceo", es_prueba: false }, proyecto: { id: "p1", nombre: "P", moneda: "USD", zona_horaria: "Europe/Madrid" } }),
}));
vi.mock("@/lib/mercado-datos", () => ({ mercadosDelProyecto: async () => ({ "closer-es": "es", "closer-latam": "latam" }), miMoneda: async () => "USD", miMercado: async () => null })); // Ola 2: Ventas también pide miMoneda (venta manual)
vi.mock("@/components/filtros", () => ({ Filtros: () => null }));
vi.mock("@/app/(panel)/ventas/fila-acciones", () => ({ FilaVentaAcciones: () => null }));

const leer = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), "utf8");
const panel = (r: string) => leer(`src/app/(panel)/${r}`);

// Los del carril D (crm/acciones.ts es del carril B)
const ACCIONES = ["admin", "clientes", "equipo", "guiones", "onboarding-closers", "perfil", "closer/analisis"].map((c) => `src/app/(panel)/${c}/acciones.ts`);

// Todo src (Cristian, 14 nov), también crm/acciones.ts (lo arregló el carril B)
const todoSrc = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? todoSrc(join(d, n)) : /\.tsx?$/.test(n) ? [join(d, n)] : []));
const RAIZ = new URL("../../", import.meta.url).pathname;

describe("errores de la base: mensaje genérico", () => {
  it("0 en todo src", () => {
    const malas = todoSrc(join(RAIZ, "src"))
      .flatMap((r) => readFileSync(r, "utf8").split("\n").filter((l) => /new ErrorUsuario\((?:(?!new Error\().)*\.message\);/.test(l)).map((l) => `${r.slice(RAIZ.length)}: ${l.trim()}`));
    expect(malas).toEqual([]);
  });

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

describe("Ventas: totales separados por moneda (Cristian, 14 nov: «Separar € y $»)", () => {
  // Textos del árbol que devuelve la página (sin pintar): `valor` de cada Kpi y el texto suelto
  const textos = (n: ReactNode, kpis: Record<string, string>, sueltos: string[]): void => {
    if (Array.isArray(n)) return n.forEach((x) => textos(x, kpis, sueltos));
    if (typeof n === "string") return void sueltos.push(n);
    if (!isValidElement(n)) return;
    const p = n.props as { titulo?: string; valor?: unknown; detalle?: unknown; children?: ReactNode };
    if (p.titulo && p.valor !== undefined) kpis[p.titulo] = `${p.valor}|${p.detalle ?? ""}`;
    textos(p.children, kpis, sueltos);
  };
  const ahora = new Date().toISOString();
  const venta = (id: string, vendedor: string, facturacion: number, cash: number) => ({ id, lead_id: `lead-${id}`, vendedor_id: vendedor, facturacion, cash_collected: cash, tipo_pago: "reserva", num_cuotas: null, metodo: "stripe", fecha: ahora, nota: null, devuelto: null, devuelto_en: null, baja_en: null, productos: { nombre: "Grupal" }, leads: { nombre: "Lead", apellido: id }, pagos: [] });
  const pintar = async (ventas: ReturnType<typeof venta>[]) => {
    filas.length = 0;
    filas.push(ventas, ventas.map(({ id, vendedor_id, fecha, cash_collected }) => ({ id, vendedor_id, fecha, cash_collected, devuelto: null, devuelto_en: null })), []);
    const kpis: Record<string, string> = {};
    const sueltos: string[] = [];
    textos((await VentasPage({ searchParams: Promise.resolve({}), params: Promise.resolve({}) } as never)) as ReactNode, kpis, sueltos);
    return { kpis, sueltos };
  };
  const solo = (t: string) => t.replace(/\s/g, " ");

  it("con ventas de los 2 mercados, cada total sale como «€ X · $ Y» sin convertir", async () => {
    const { kpis, sueltos } = await pintar([venta("a", "closer-es", 1997, 100), venta("b", "closer-latam", 4997, 4997)]);
    expect(solo(kpis["Facturación"])).toMatch(/1\.?997 €.* · .*\$\s?4,?997/);
    expect(solo(kpis["Cash collected"])).toMatch(/100 €.* · .*\$\s?4,?997/);
    expect(solo(kpis["Pendiente de cobro"])).toMatch(/^1\.?897 €\|/); // la de Latam está cobrada: solo €
    expect(sueltos.map(solo).find((t) => t.includes("·") && t.includes("€") && t.includes("$"))).toMatch(/1\.?997 €.* · .*\$\s?4,?997/); // Por producto
  });

  it("con ventas de una sola moneda, un único total como hoy", async () => {
    const { kpis } = await pintar([venta("a", "closer-latam", 1997, 100), venta("b", "closer-latam", 4997, 4997)]);
    expect(solo(kpis["Facturación"])).toMatch(/^\$\s?6,?994\|/);
    expect(kpis["Facturación"]).not.toContain("·");
    expect(kpis["Facturación"]).not.toContain("€");
  });
});
