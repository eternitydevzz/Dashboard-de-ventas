// MCP (Cristian, 13 nov 2026): crear, dar de baja y borrar personas del equipo. La vista previa no cambia nada, con
// confirmar sí; nadie ve contraseñas; con leads, no se hace nada hasta decir a quién van; solo el CEO da de baja o borra.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";
import { getSesion } from "@/lib/sesion";
import { conSesionMcp, sesionMcp } from "@/lib/mcp/sesion-mcp";
import { sesionMcpDe } from "@/lib/mcp/clave";
import { herramientaBorrarMiembro, herramientaCrearMiembro, herramientaDarDeBaja } from "@/lib/mcp/equipo";
import { herramientaBorrar, herramientaVenta } from "@/lib/mcp/cambiar";
import type { Perfil } from "@/lib/tipos";

let e: Escenario;
const como = async <T,>(p: Perfil, fn: () => Promise<T>) => conSesionMcp(await sesionMcpDe(p.id, e.proyecto.id), fn);
const previa = (r: unknown) => (r as { vistaPrevia?: boolean }).vistaPrevia === true;
const perfilDe = async (email: string) => (await db.from("perfiles").select("id, nombre, rol, telefono, activo").eq("email", email).maybeSingle()).data;

beforeAll(async () => {
  e = await crearEscenario();
  vi.mocked(getSesion).mockImplementation(async () => {
    const s = sesionMcp();
    if (!s) throw new Error("Test sin sesión del MCP");
    return s;
  });
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("MCP: equipo", () => {
  it("crear_miembro: vista previa sin crear; con confirmar crea cuenta con país, teléfono y sin devolver contraseña", async () => {
    const email = `${e.pref}-nueva@eternity.test`;
    const args = { nombre: "Caller Nueva", email, telefono: "+34 600 111 222", rol: "caller", mercado: "es" };
    const v = await como(e.p.ceo, () => herramientaCrearMiembro(args));
    expect(previa(v)).toBe(true);
    expect(await perfilDe(email)).toBeNull();
    const r = await como(e.p.ceo, () => herramientaCrearMiembro({ ...args, confirmar: true }));
    expect(JSON.stringify(r)).not.toMatch(/password|contraseña:/i);
    const p = await perfilDe(email);
    expect(p).toMatchObject({ nombre: "Caller Nueva", rol: "caller", telefono: "+34 600 111 222", activo: true });
    expect((await db.from("miembros_proyecto").select("mercado").eq("proyecto_id", e.proyecto.id).eq("perfil_id", p!.id)).data).toEqual([{ mercado: "es" }]);
    expect((await db.from("miembros_equipo").select("nombre").eq("proyecto_id", e.proyecto.id).eq("perfil_id", p!.id)).data).toHaveLength(1);
  });

  it("dar de baja: con leads pide a quién van; con confirmar los pasa y la desactiva", async () => {
    await expect(como(e.p.ceo, () => herramientaDarDeBaja({ persona: e.p.callerA.id }))).rejects.toThrow(/Di a quién pasarlos/);
    const v = await como(e.p.ceo, () => herramientaDarDeBaja({ persona: e.p.callerA.id, leadsA: e.p.callerB.id }));
    expect(previa(v)).toBe(true);
    expect((await db.from("leads").select("caller_id").eq("id", e.leads.LeadA).single()).data!.caller_id).toBe(e.p.callerA.id);
    await como(e.p.ceo, () => herramientaDarDeBaja({ persona: e.p.callerA.id, leadsA: e.p.callerB.id, confirmar: true }));
    expect((await db.from("leads").select("caller_id").eq("id", e.leads.LeadA).single()).data!.caller_id).toBe(e.p.callerB.id);
    expect((await db.from("perfiles").select("activo").eq("id", e.p.callerA.id).single()).data!.activo).toBe(false);
  });

  it("borrar: solo el CEO; deja los leads sin asignar con «nadie» y borra la cuenta", async () => {
    await expect(como(e.p.directorAdmin, () => herramientaBorrarMiembro({ persona: e.p.callerB.id, leadsA: "nadie" }))).rejects.toThrow(/Solo el CEO/);
    const v = await como(e.p.ceo, () => herramientaBorrarMiembro({ persona: e.p.callerB.id, leadsA: "nadie" }));
    expect(previa(v)).toBe(true);
    expect(await perfilDe(e.p.callerB.email)).not.toBeNull();
    await como(e.p.ceo, () => herramientaBorrarMiembro({ persona: e.p.callerB.id, leadsA: "nadie", confirmar: true }));
    expect(await perfilDe(e.p.callerB.email)).toBeNull();
    expect((await db.from("leads").select("caller_id").in("id", [e.leads.LeadA, e.leads.LeadB])).data!.every((l) => l.caller_id === null)).toBe(true);
  });

  // Fase 2 (D43): las vistas previas piden el mismo permiso que la acción (antes bastaba con tener sesión)
  it("vistas previas con permiso: crear_miembro sin Administración, borrar sin ser CEO y vender como caller, no", async () => {
    const args = { nombre: "Sin permiso", email: `${e.pref}-sinpermiso@eternity.test`, telefono: "+34 600 000 000", rol: "caller", mercado: "es" };
    await expect(como(e.p.director, () => herramientaCrearMiembro(args))).rejects.toThrow();
    await expect(como(e.p.callerC, () => herramientaBorrar({ leadIds: [e.leads.LeadA] }))).rejects.toThrow();
    await expect(como(e.p.callerC, () => herramientaVenta({ leadId: e.leads.LeadA, producto: "x", facturacion: 1, cash: 0, tipoPago: "completo", metodo: "otro" }))).rejects.toThrow();
  });

  // C4 y C5 (Fase 2): con historial no se borra (se perdería en cascada); dar de baja mueve TODOS sus leads, no solo 1.000
  it("con historial solo se da de baja; dar de baja mueve más de 1.000 leads", async () => {
    const p = e.p.callerC;
    const etapa = (await db.from("leads").select("pipeline_id, etapa_id").eq("id", e.leads.LeadA).single()).data!;
    const nuevos = Array.from({ length: 1005 }, (_, i) => ({ proyecto_id: e.proyecto.id, nombre: `C5-${i}`, email: `${e.pref}-c5-${i}@x.test`, caller_id: p.id, ...etapa }));
    expect((await db.from("leads").insert(nuevos)).error).toBeNull();
    expect((await db.from("reportes").insert({ proyecto_id: e.proyecto.id, perfil_id: p.id, rol: "caller", fecha: "2026-11-13", respuestas: {} })).error).toBeNull();
    await expect(como(e.p.ceo, () => herramientaBorrarMiembro({ persona: p.id, leadsA: "nadie", confirmar: true }))).rejects.toThrow(/historial/);
    expect(await perfilDe(p.email)).not.toBeNull();
    await como(e.p.ceo, () => herramientaDarDeBaja({ persona: p.id, leadsA: "nadie", confirmar: true }));
    const { count } = await db.from("leads").select("id", { count: "exact", head: true }).eq("caller_id", p.id);
    expect(count).toBe(0);
  });

  it("no se puede tocar a un CEO ni a uno mismo", async () => {
    await expect(como(e.p.ceo, () => herramientaDarDeBaja({ persona: e.p.ceo.id }))).rejects.toThrow(/ti mismo/);
  });
});
