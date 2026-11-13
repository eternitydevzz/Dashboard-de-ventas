// Fase 3 (Cristian, 13 nov): «Unir» deja la app y GHL iguales. Base en memoria con datos inventados; GHL simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const base = vi.hoisted(() => ({ tablas: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const filtros: ((f: Fila) => boolean)[] = [];
      let cambio: Fila | null = null;
      let nueva: Fila | Fila[] | null = null;
      let uno = false;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit", "range"]) q[m] = () => q;
      q.eq = (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q);
      q.in = (c: string, v: unknown[]) => (filtros.push((f) => v.includes(f[c])), q);
      q.update = (c: Fila) => ((cambio = c), q);
      q.insert = (c: Fila | Fila[]) => ((nueva = c), q);
      q.maybeSingle = q.single = () => ((uno = true), q);
      const responder = () => {
        const filas = (base.tablas[tabla] ??= []);
        if (nueva) {
          const nuevas = (Array.isArray(nueva) ? nueva : [nueva]).map((f, i) => ({ id: `${tabla}-${filas.length + i}`, ...f }));
          filas.push(...nuevas);
          return { data: uno ? nuevas[0] : nuevas, error: null };
        }
        const elegidas = filas.filter((f) => filtros.every((x) => x(f)));
        if (cambio) for (const f of elegidas) Object.assign(f, cambio);
        const copias = elegidas.map((f) => ({ ...f }));
        return { data: uno ? copias[0] ?? null : copias, error: null };
      };
      q.then = (r: (v: unknown) => unknown) => Promise.resolve(responder()).then(r);
      return q;
    },
  }),
}));
vi.mock("@/lib/cifrado", () => ({ descifrar: () => "token" }));
vi.mock("@/lib/errores-app", () => ({ guardarError: vi.fn(async () => undefined) }));
vi.mock("@/lib/ghl", async (original) => ({
  ...(await original<typeof import("@/lib/ghl")>()),
  borrarCitaGhl: vi.fn(async () => true),
  borrarContactoGhl: vi.fn(async () => true),
}));
const { borrarCitaGhl, borrarContactoGhl } = await import("@/lib/ghl");
const { guardarError } = await import("@/lib/errores-app");
const { igualarGhlTrasUnir, guardarLeads, contactosPrincipales } = await import("@/lib/leads");
import type { Proyecto } from "@/lib/tipos";

const proyecto = { id: "p1", reparto_auto: false } as unknown as Proyecto;
const union = { ghl_sobra: "c-sobra", ghl_citas_sobran: ["g-vieja"], citas_juntadas: 1, cita_en_sobra: false };
const historial = () => base.tablas.actividades.map((a) => String(a.nota));

beforeEach(() => {
  vi.mocked(borrarCitaGhl).mockReset().mockResolvedValue(true);
  vi.mocked(borrarContactoGhl).mockReset().mockResolvedValue(true);
  vi.mocked(guardarError).mockClear();
  base.tablas = {
    proyectos: [{ id: "p1", ghl_token: "cifrado" }],
    // Tras unir_leads: queda l1 (contacto c-queda) y c-sobra apunta a él
    leads: [{ id: "l1", proyecto_id: "p1", ghl_contact_id: "c-queda", email: "ana@x.test", telefono: "600111222", etiquetas: ["a"], respuestas: [], pipeline_id: "pipe-1" }],
    ghl_contactos_unidos: [{ proyecto_id: "p1", contact_id: "c-sobra", lead_id: "l1", leads: { ghl_contact_id: "c-queda" } }],
    actividades: [],
  };
});

describe("GHL tras «Unir»", () => {
  it("borra en GHL el evento que sobra y el contacto que sobra; queda en el historial", async () => {
    expect(await igualarGhlTrasUnir("p1", "l1", union, "jefe-1")).toEqual([]);
    expect(borrarCitaGhl).toHaveBeenCalledWith({ token: "token", citaId: "g-vieja" });
    expect(borrarContactoGhl).toHaveBeenCalledWith({ token: "token", contactId: "c-sobra" });
    expect(historial()[0]).toMatch(/agendas juntadas.*contacto c-sobra borrado en GHL/);
    expect(guardarError).not.toHaveBeenCalled();
  });

  it("si GHL falla, la unión sigue: se devuelve qué hacer a mano, va al historial y a los avisos del CEO", async () => {
    vi.mocked(borrarContactoGhl).mockRejectedValue(new Error("GHL respondió 500."));
    const fallos = await igualarGhlTrasUnir("p1", "l1", union);
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toMatch(/c-sobra.*a mano/);
    expect(historial()[0]).toContain("c-sobra");
    expect(guardarError).toHaveBeenCalledWith("unir leads: GHL", expect.stringContaining("c-sobra"), "p1");
    expect(base.tablas.leads).toHaveLength(1); // nada se deshace en la app
  });

  it("si la cita que se queda es del contacto que sobra, ese contacto no se borra (GHL no deja pasarla a otro)", async () => {
    const fallos = await igualarGhlTrasUnir("p1", "l1", { ...union, ghl_citas_sobran: [], cita_en_sobra: true });
    expect(borrarContactoGhl).not.toHaveBeenCalled();
    expect(fallos[0]).toMatch(/únelo a mano/);
  });

  it("sin nada en GHL no llama a GHL", async () => {
    expect(await igualarGhlTrasUnir("p1", "l1", { ghl_sobra: null, ghl_citas_sobran: [], citas_juntadas: 0, cita_en_sobra: false })).toEqual([]);
    expect(borrarCitaGhl).not.toHaveBeenCalled();
    expect(borrarContactoGhl).not.toHaveBeenCalled();
  });
});

describe("la lectura de GHL no vuelve a crear el lead unido", () => {
  it("contactosPrincipales traduce el contacto viejo al del lead que se quedó", async () => {
    expect([...(await contactosPrincipales("p1", ["c-sobra", "c-otro", null]))]).toEqual([["c-sobra", "c-queda"]]);
  });

  it("guardarLeads con el contacto viejo pone al día el lead que se quedó, sin crear otro ni cambiarle el contacto", async () => {
    const r = await guardarLeads(proyecto, [{ ghl_contact_id: "c-sobra", nombre: "Ana", apellido: "", email: null, telefono: null, etiquetas: ["b"], respuestas: [], creado_en: null }], { pipelineId: null, origen: "ghl", perfilId: null, repartir: false });
    expect(r).toMatchObject({ insertados: 0, actualizados: 1 });
    expect(base.tablas.leads).toHaveLength(1);
    expect(base.tablas.leads[0]).toMatchObject({ id: "l1", ghl_contact_id: "c-queda", etiquetas: ["a", "b"] });
  });
});
