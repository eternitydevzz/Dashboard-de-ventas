// S7-4 (auditoría): todos los tests del MCP usaban al director. Un caller con su clave solo debe ver sus leads
// (src/lib/mcp/lectura.ts: buscar_leads filtra por caller/closer y ficha_lead pasa por resumenLead). Si se borra ese
// filtro, un caller sacaría nombre, email y teléfono de todo el proyecto.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { borrarEscenario, crearEscenario, type Escenario } from "../apoyo/escenario";
import { getSesion } from "@/lib/sesion";
import { conSesionMcp, sesionMcp } from "@/lib/mcp/sesion-mcp";
import { sesionMcpDe } from "@/lib/mcp/clave";
import { herramientaBuscarLeads, herramientaFichaLead } from "@/lib/mcp/lectura";
import type { Perfil } from "@/lib/tipos";

let e: Escenario;
const como = async <T,>(p: Perfil, fn: () => Promise<T>) => conSesionMcp(await sesionMcpDe(p.id, e.proyecto.id), fn);

beforeAll(async () => {
  e = await crearEscenario(); // LeadA es de callerA, LeadB de callerB, LeadLibre sin caller
  vi.mocked(getSesion).mockImplementation(async () => {
    const s = sesionMcp();
    if (!s) throw new Error("Test sin sesión del MCP");
    return s;
  });
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("MCP con la clave de un caller", () => {
  it("buscar_leads: solo sus leads (ni los de otro caller ni los libres)", async () => {
    const r = await como(e.p.callerA, () => herramientaBuscarLeads({}));
    expect(r.leads.map((l) => l.id)).toEqual([e.leads.LeadA]);
    expect(r.total).toBe(1);
    // Ni buscando por texto o por el otro caller aparece lo ajeno
    expect((await como(e.p.callerA, () => herramientaBuscarLeads({ texto: "leadb" }))).leads).toEqual([]);
    expect((await como(e.p.callerA, () => herramientaBuscarLeads({ caller: null }))).leads).toEqual([]);
  });
  it("el director, con la misma búsqueda, ve los 3 (el filtro es por persona, no un fallo de la búsqueda)", async () => {
    const r = await como(e.p.director, () => herramientaBuscarLeads({}));
    expect(r.leads.map((l) => l.id).sort()).toEqual([e.leads.LeadA, e.leads.LeadB, e.leads.LeadLibre].sort());
  });
  it("ficha_lead: la suya sí; la de otro caller, «No puedes ver este lead.»", async () => {
    const suya = await como(e.p.callerA, () => herramientaFichaLead({ leadId: e.leads.LeadA }));
    expect(JSON.stringify(suya)).toContain("LeadA");
    await expect(como(e.p.callerA, () => herramientaFichaLead({ leadId: e.leads.LeadB }))).rejects.toThrow(/No puedes ver este lead/);
    await expect(como(e.p.callerA, () => herramientaFichaLead({ leadId: e.leads.LeadLibre }))).rejects.toThrow(/No puedes ver este lead/);
  });
});
