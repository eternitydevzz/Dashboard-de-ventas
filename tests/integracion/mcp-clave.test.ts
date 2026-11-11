// MCP, Fase 2 (11 nov 2026): claves personales y sesión del MCP (plan en VENTAS/API-DASHBOARD/fase-2.md, Tarea 2)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";
import { huellaClave, perfilDeClave, sesionMcpDe } from "@/lib/mcp/clave";

let e: Escenario;
let otroProyecto: string;
const CLAVE = `clave-test-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  e = await crearEscenario();
  // Un segundo proyecto: el CEO ve todos, así que tiene al menos dos
  const { data } = await db.from("proyectos").insert({ nombre: `TEST-AUTO ${e.id} B` }).select("id").single();
  otroProyecto = data!.id;
  await db.from("claves_mcp").insert({ perfil_id: e.p.director.id, huella: huellaClave(CLAVE), nombre: "test" });
});
afterAll(async () => {
  if (e) await borrarEscenario(e); // borra también el proyecto «B» (mismo prefijo) y las claves (en cascada con el perfil)
});

describe("MCP: claves", () => {
  it("una clave válida da su persona; una inventada, nadie", async () => {
    expect(await perfilDeClave(CLAVE)).toBe(e.p.director.id);
    expect(await perfilDeClave("clave-inventada")).toBeNull();
    expect(await perfilDeClave("")).toBeNull();
  });

  it("una clave anulada ya no entra", async () => {
    await db.from("claves_mcp").update({ anulada_en: new Date().toISOString() }).eq("huella", huellaClave(CLAVE));
    expect(await perfilDeClave(CLAVE)).toBeNull();
    await db.from("claves_mcp").update({ anulada_en: null }).eq("huella", huellaClave(CLAVE));
  });
});

describe("MCP: sesión", () => {
  it("con un solo proyecto, ese", async () => {
    const s = await sesionMcpDe(e.p.director.id);
    expect(s.proyecto.id).toBe(e.proyecto.id);
    expect(s.perfil.id).toBe(e.p.director.id);
  });

  it("el CEO, con varios proyectos, tiene que decir cuál (por nombre o id)", async () => {
    await expect(sesionMcpDe(e.p.ceo.id)).rejects.toThrow(/Di el proyecto/);
    expect((await sesionMcpDe(e.p.ceo.id, e.proyecto.nombre.toLowerCase())).proyecto.id).toBe(e.proyecto.id);
    expect((await sesionMcpDe(e.p.ceo.id, otroProyecto)).proyecto.id).toBe(otroProyecto);
  });

  it("un proyecto que no es suyo no vale", async () => {
    await expect(sesionMcpDe(e.p.director.id, otroProyecto)).rejects.toThrow(/No tienes ese proyecto/);
  });

  it("un usuario desactivado no entra", async () => {
    await db.from("perfiles").update({ activo: false }).eq("id", e.p.callerC.id);
    await expect(sesionMcpDe(e.p.callerC.id)).rejects.toThrow(/desactivado/);
    await db.from("perfiles").update({ activo: true }).eq("id", e.p.callerC.id);
  });
});
