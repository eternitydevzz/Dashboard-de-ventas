// MCP (Cristian, 13 nov 2026): crear, dar de baja y borrar personas del equipo. La vista previa no cambia nada, con
// confirmar sí; nadie ve contraseñas; con leads, no se hace nada hasta decir a quién van; solo el CEO da de baja o borra.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";
import { getSesion } from "@/lib/sesion";
import { conSesionMcp, sesionMcp } from "@/lib/mcp/sesion-mcp";
import { sesionMcpDe } from "@/lib/mcp/clave";
import { herramientaBorrarMiembro, herramientaCrearMiembro, herramientaDarDeBaja } from "@/lib/mcp/equipo";
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

  it("no se puede tocar a un CEO ni a uno mismo", async () => {
    await expect(como(e.p.ceo, () => herramientaDarDeBaja({ persona: e.p.ceo.id }))).rejects.toThrow(/ti mismo/);
  });
});
