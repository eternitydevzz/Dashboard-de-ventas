// Ola 2 · carril V2 (Cristian, 14 nov 2026: «enfócate en mejorar la velocidad como sea, es lo más importante»).
// KPIs → Leads pesa menos con los mismos números, abrir KPIs lee menos veces la base y la bienvenida no espera a las
// precargas del menú.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compactarLeads, descompactarLeads, MARCA, type LeadDeLaBase, type LeadVista } from "@/lib/leads-vista";
import { cifras, compararFuentes } from "@/lib/leads-cifras";

const leer = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), "utf8");

// Cuenta cada db().from(tabla); cualquier cadena (.select().eq()…) devuelve 0 filas
const tablas: string[] = [];
const cadena: object = new Proxy(() => {}, {
  get: (_t, p) => (p === "then" ? (ok: (r: unknown) => void) => ok({ data: [], error: null }) : () => cadena),
});
vi.mock("@/lib/datos", async (original) => ({
  ...(await original<typeof import("@/lib/datos")>()),
  db: () => ({ from: (t: string) => (tablas.push(t), cadena) }),
  equipo: async () => [],
  conBajas: async (a: unknown[]) => a,
  idsDePrueba: async () => new Set<string>(),
}));
vi.mock("@/lib/biblioteca-datos", () => ({ recalcularOfertas: async () => 0 }));
const SESION = { perfil: { id: "u1", rol: "ceo" }, proyecto: { id: "p1", nombre: "Proyecto A", zona_horaria: "Europe/Madrid" } };
vi.mock("@/lib/permisos", () => ({
  exigirPagina: async () => ({ ...SESION, tiene: new Set(["kpis", "funnel"]) }),
  exigirSeccion: async () => SESION,
  soloLoSuyo: () => false,
}));
vi.mock("@/lib/auth", () => ({ esJefe: () => true, exigir: async () => SESION }));

// ---------- 1. Peso de los props de KPIs → Leads ----------
const BIBLIOTECA = [
  ["¿En qué situación estás hoy?", ["Trabajo por cuenta ajena", "Tengo un negocio", "Estudio"]],
  ["¿Qué experiencia tienes con IA?", ["Ninguna", "La uso a diario"]],
  ["¿Qué quieres lograr en los próximos 90 días?", ["Llegar a 5.000 $/mes", "Cerrar su primer cliente en USA"]],
  ["¿Cuánto tiempo por semana le puedes dedicar?", ["Menos de 5 h", "Más de 10 h"]],
  ["Si encuentras el programa correcto, ¿estás en condiciones de invertir?", ["Sí, ahora", "No por ahora"]],
  ["¿Cuándo quieres empezar?", ["Ya mismo", "Este mes"]],
] as const;
const ESTADOS = ["nuevo", "no_contesta", "agendado", "seguimiento"];
const OFERTAS = ["vip", "grupal", null];
// Leads inventados (sin datos de nadie): repiten estados, ofertas, etiquetas y respuestas, como los de verdad
const LEADS: LeadDeLaBase[] = Array.from({ length: 300 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  nombre: `Lead ${i}`,
  apellido: i % 2 ? "Prueba" : null,
  email: null,
  telefono: null,
  pais: i % 3 ? "ES" : "MX",
  etiquetas: i % 4 ? ["leads whatsapp", "webinar1"] : ["agenda llamada"],
  respuestas: i % 5 ? BIBLIOTECA.map(([pregunta, rs], k) => ({ pregunta, respuesta: rs[(i + k) % rs.length] })) : [],
  pipeline_id: i % 2 ? "p1" : "p2",
  etapa_id: i % 2 ? "e1" : "e2",
  caller_id: i % 3 ? "c1" : null,
  closer_id: i % 7 ? null : "k1",
  estado_caller: ESTADOS[i % ESTADOS.length],
  creado_en: new Date(Date.UTC(2026, 9, 1 + (i % 40), i % 24)).toISOString(),
  fuente: i % 2 ? "recursos" : null,
  estrellas_caller: i % 6 ? null : (i % 5) + 1,
  oferta: OFERTAS[i % OFERTAS.length],
}));
const DATOS = {
  leads: LEADS,
  tarjetas: LEADS.filter((_, i) => i % 4 === 0).map((l) => ({ lead_id: l.id, pipeline_id: "p1", etapa_id: "e1" })),
  pipelines: [{ id: "p1", nombre: "Leads WhatsApp" }, { id: "p2", nombre: "1. Biblioteca Recursos" }],
  etapas: [{ id: "e1", nombre: "Grupo 2", pipeline_id: "p1", color: "#0891b2" }, { id: "e2", nombre: "Nuevos", pipeline_id: "p2", color: "#64748b" }],
  gente: [{ id: "c1", nombre: "Caller A", rol: "caller" }, { id: "k1", nombre: "Closer A", rol: "closer" }],
  marcas: new Map(LEADS.filter((_, i) => i % 3 === 0).map((l) => [l.id, MARCA.contactado | MARCA.agendado])),
};
// Lo que tiene que ver el navegador de cada lead, sacado directamente de la base
const esperado = (l: LeadDeLaBase): LeadVista => ({
  id: l.id,
  nombre: `${l.nombre} ${l.apellido ?? ""}`.trim(),
  telefono: l.telefono,
  email: l.email,
  pais: l.pais,
  alta: Date.parse(l.creado_en),
  pipelineId: l.pipeline_id,
  etapaId: l.etapa_id,
  tarjetas: DATOS.tarjetas.filter((t) => t.lead_id === l.id).map((t) => ({ pipelineId: t.pipeline_id, etapaId: t.etapa_id })),
  callerId: l.caller_id,
  closerId: l.closer_id,
  estado: l.estado_caller,
  estrellas: l.estrellas_caller,
  oferta: l.oferta,
  fuente: l.fuente,
  etiquetas: l.etiquetas ?? [],
  respuestas: l.respuestas ?? [],
  marcas: DATOS.marcas.get(l.id) ?? 0,
});

describe("KPIs → Leads: menos peso con los mismos números", () => {
  const c = compactarLeads(DATOS);
  const vista = descompactarLeads(JSON.parse(JSON.stringify(c))); // como llega al navegador

  it("cada lead llega igual que en la base y cifras() da lo mismo", () => {
    const deLaBase = LEADS.map(esperado);
    expect(vista.leads).toEqual(deLaBase);
    expect(cifras(vista.leads)).toEqual(cifras(deLaBase));
    expect(compararFuentes(vista.leads, vista.pipelines)).toEqual(compararFuentes(deLaBase, DATOS.pipelines));
  });

  it("estado, oferta, 🔗, etiquetas y respuestas van como números; lo repetido, una sola vez", () => {
    for (const l of c.leads) for (const i of [11, 12, 13, 14, 15, 16]) expect(typeof l[i], `campo ${i}`).toBe("number");
    expect(c.textos.filter((t) => t === "agendado")).toHaveLength(1);
    // 300 leads con 6 respuestas cada uno (o ninguna): las listas distintas, no una por lead
    expect(c.listas.length).toBeLessThan(40);
  });

  it("pesa menos: menos de 125 bytes por lead (medido: antes 168, ahora 112)", () => {
    expect(JSON.stringify(c).length / LEADS.length).toBeLessThan(125);
  });
});

// ---------- 2. Lecturas a la base al abrir KPIs → Leads ----------
describe("abrir KPIs → Leads lee menos la base", () => {
  beforeEach(() => {
    tablas.length = 0;
  });

  it("los leads y los pipelines se leen una sola vez (antes, 2 y 2: 11 lecturas → 9)", async () => {
    const { default: KpisPage } = await import("@/app/(panel)/kpis/page");
    await KpisPage({ searchParams: Promise.resolve({}) } as never);
    const veces = (t: string) => tablas.filter((x) => x === t).length;
    expect(veces("leads")).toBe(1);
    expect(veces("pipelines")).toBe(1);
    expect(tablas.sort()).toEqual(["actividades", "citas", "etapas", "leads", "pagos", "pipelines", "productos", "tarjetas_extra", "ventas"]);
  });

  it("la base de «Por persona» usa los leads que ya lee KPIs → Leads (mismas filas, solo sus 4 campos)", async () => {
    const { cargarBase } = await import("@/lib/metricas");
    const leidos = vi.fn(async () => [{ id: "l1", creado_en: "2026-11-14T10:00:00Z", caller_id: null, closer_id: null }]);
    const base = await cargarBase({ id: "p1" } as never, false, leidos);
    expect(leidos).toHaveBeenCalledTimes(1);
    expect(base.leads).toEqual([{ id: "l1", creado_en: "2026-11-14T10:00:00Z", caller_id: null, closer_id: null }]);
    expect(tablas).not.toContain("leads");
  });
});

// ---------- 3. La bienvenida y la precarga del menú ----------
describe("la bienvenida no espera a la precarga", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("se quita a los 0,8 s si la pantalla ya tiene sus datos, aunque no haya llegado ninguna precarga", async () => {
    const { esperarPantalla } = await import("@/components/bienvenida");
    const salir = vi.fn();
    esperarPantalla(salir, () => false);
    vi.advanceTimersByTime(700);
    expect(salir).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(salir).toHaveBeenCalledTimes(1);
  });

  it("espera a los datos de la pantalla abierta, como mucho 4 s", async () => {
    const { esperarPantalla } = await import("@/components/bienvenida");
    let pendiente = true;
    const salir = vi.fn();
    esperarPantalla(salir, () => pendiente);
    vi.advanceTimersByTime(1500);
    expect(salir).not.toHaveBeenCalled();
    pendiente = false;
    vi.advanceTimersByTime(100);
    expect(salir).toHaveBeenCalledTimes(1);
    const salir2 = vi.fn();
    esperarPantalla(salir2, () => true);
    vi.advanceTimersByTime(4000);
    expect(salir2).toHaveBeenCalledTimes(1);
  });

  it("no mira las peticiones de las precargas; la pantalla de carga cuenta como datos por llegar", () => {
    expect(leer("src/components/bienvenida.tsx")).not.toMatch(/PerformanceObserver/);
    expect(leer("src/app/(panel)/loading.tsx")).toMatch(/data-datos-pendientes/);
  });

  it("las 3 precargas completas del menú empiezan cuando se quita la bienvenida (la pantalla ya está)", () => {
    const barra = leer("src/components/barra-lateral.tsx");
    expect(barra).toMatch(/addEventListener\(FIN_BIENVENIDA/);
    expect(barra).not.toMatch(/precarga\.includes\(href\) \|\|/); // antes: desde el primer pintado
  });
});

// ---------- 4. Lo común: el layout ----------
describe("layout: los avisos del CEO se leen a la vez que permisos y mercado", () => {
  it("avisosCeo empieza sin esperar al mercado", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth", () => ({ getSesion: async () => ({ perfil: { id: "u1", rol: "ceo", nombre: "A B", onboarding_completo: true, foto: "x", zona_horaria: "Europe/Madrid" }, proyectos: [], proyecto: { id: "p1" } }), esJefe: () => true, puedeAdmin: () => true }));
    vi.doMock("@/lib/permisos", () => ({ seccionesPermitidas: async () => new Set(), SECCIONES: [] }));
    vi.doMock("@/lib/mercado-datos", () => ({ leerMercado: () => new Promise(() => {}) })); // el mercado no llega nunca
    const avisosCeo = vi.fn(async () => []);
    vi.doMock("@/lib/avisos-ceo", () => ({ avisosCeo }));
    vi.doMock("@/app/(panel)/acciones-globales", () => ({ cambiarProyecto: vi.fn() }));
    vi.doMock("@/app/login/acciones", () => ({ cerrarSesion: vi.fn() }));
    const { default: PanelLayout } = await import("@/app/(panel)/layout");
    void PanelLayout({ children: null } as never);
    await vi.waitFor(() => expect(avisosCeo).toHaveBeenCalledWith("p1"));
  });
});
