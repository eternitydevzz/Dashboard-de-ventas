// Bloque A (Cristian, 11 oct 2026): «Repartir leads» a mano (sin asignar o reasignar), solo jefes, solo callers
// de verdad (nunca perfiles de prueba), con vista previa y en el historial del lead.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, falla, ok, type Escenario } from "../apoyo/escenario";
import { previsualizarReparto, repartirLeads } from "@/app/(panel)/crm/reparto";
import { guardarLeads } from "@/lib/leads";

let e: Escenario;
let nuevos: string[];
beforeAll(async () => {
  e = await crearEscenario();
  const { data } = await db.from("leads").insert(Array.from({ length: 6 }, (_, i) => ({ proyecto_id: e.proyecto.id, nombre: `R${i}`, apellido: "", email: `${e.pref}-r${i}@x.test`, oferta: i < 4 ? "vip" : "grupal", pipeline_id: e.pipeline.id }))).select("id");
  nuevos = data!.map((x) => x.id);
  await db.from("perfiles").update({ es_prueba: true }).eq("id", e.p.callerC.id);
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});
const callerDe = async (ids: string[]) => (await db.from("leads").select("caller_id").in("id", ids)).data!.map((l) => l.caller_id);

describe("Repartir leads", () => {
  it("solo el CEO y los directores", async () => {
    como(e, e.p.callerA);
    await falla(previsualizarReparto({ origen: "sin_asignar", callers: [e.p.callerA.id], modo: "equitativo", n: 2 }), /acceso|CEO/);
  });
  it("vista previa sin cambiar nada; un perfil de prueba nunca entra", async () => {
    como(e, e.p.director);
    const v = await ok(previsualizarReparto({ origen: "sin_asignar", oferta: "vip", callers: [e.p.callerA.id, e.p.callerB.id, e.p.callerC.id], modo: "equitativo", n: 4 }));
    expect(v.total).toBe(4);
    expect(v.porCaller.map((c) => c.n)).toEqual([2, 2]); // callerC (prueba) fuera
    expect((await callerDe(nuevos)).every((c) => c === null)).toBe(true);
  });
  it("repartir de verdad, filtrando por oferta, y queda en el historial", async () => {
    como(e, e.p.director);
    const r = await ok(repartirLeads({ origen: "sin_asignar", oferta: "vip", callers: [e.p.callerA.id, e.p.callerB.id], modo: "equitativo", n: 10 }));
    expect(r.repartidos).toBe(4); // solo hay 4 VIP
    expect(new Set(await callerDe(nuevos.slice(0, 4)))).toEqual(new Set([e.p.callerA.id, e.p.callerB.id]));
    expect((await callerDe(nuevos.slice(4))).every((c) => c === null)).toBe(true); // los grupal, no
    const { count } = await db.from("actividades").select("id", { count: "exact", head: true }).in("lead_id", nuevos).eq("tipo", "asignacion");
    expect(count).toBe(4);
  });
  it("reasignar: se quitan a unos callers y van a otros", async () => {
    como(e, e.p.ceo);
    await ok(repartirLeads({ origen: "reasignar", deCallers: [e.p.callerA.id], oferta: "vip", callers: [e.p.callerB.id], modo: "fijo", porPersona: 10 }));
    expect((await callerDe(nuevos.slice(0, 4))).every((c) => c === e.p.callerB.id)).toBe(true);
  });
  it("selección del CRM: reparte todos los marcados, también los que ya tienen caller", async () => {
    como(e, e.p.director);
    await db.from("leads").update({ caller_id: e.p.callerA.id }).in("id", nuevos.slice(0, 2));
    await db.from("leads").update({ caller_id: null }).in("id", nuevos.slice(2, 4));
    const marcados = nuevos.slice(0, 4);
    const v = await ok(previsualizarReparto({ origen: "seleccion", leadIds: marcados, callers: [e.p.callerB.id], modo: "equitativo", n: 10 }));
    expect(v.disponibles).toBe(4);
    expect(v.conCaller).toBe(2);
    const r = await ok(repartirLeads({ origen: "seleccion", leadIds: marcados, callers: [e.p.callerB.id], modo: "equitativo", n: 10 }));
    expect(r.repartidos).toBe(4);
    expect((await callerDe(marcados)).every((c) => c === e.p.callerB.id)).toBe(true);
    expect((await callerDe(nuevos.slice(4))).every((c) => c === null)).toBe(true); // los no marcados, igual
    await falla(previsualizarReparto({ origen: "seleccion", leadIds: [], callers: [e.p.callerB.id], modo: "equitativo", n: 1 }), /Selecciona leads/);
  });
  it("sin callers válidos, no", async () => {
    como(e, e.p.ceo);
    await falla(repartirLeads({ origen: "sin_asignar", callers: [e.p.callerC.id], modo: "equitativo", n: 1 }), /al menos un caller/);
  });
  it("1b: por país, solo los de los países elegidos (también «Sin país»), con cuántos hay de cada uno", async () => {
    // Creados por la app, que les pone el país al guardarlos
    const tels = ["+34 600 11 22 33", "+34 611 22 33 44", "+54 9 11 2345 6789", "+1 555 123 4567"];
    const emails = tels.map((_, i) => `${e.pref}-pais-reparto${i}@x.test`);
    await guardarLeads(e.proyecto, tels.map((telefono, i) => ({ ghl_contact_id: null, nombre: `P${i}`, apellido: "", email: emails[i], telefono, etiquetas: [], respuestas: [], creado_en: null })), { pipelineId: null, origen: "ghl", perfilId: null, repartir: false });
    const ids = (await db.from("leads").select("id").in("email", emails).order("email")).data!.map((l) => l.id);
    como(e, e.p.director);
    const v = await ok(previsualizarReparto({ origen: "sin_asignar", leadIds: ids, paises: ["ES", "Sin país"], callers: [e.p.callerA.id], modo: "equitativo", n: 10 }));
    expect(v.porPais).toEqual({ ES: 2, AR: 1, "Sin país": 1 }); // con los demás filtros, antes de elegir país
    expect(v.total).toBe(3);
    const r = await ok(repartirLeads({ origen: "sin_asignar", leadIds: ids, paises: ["ES", "Sin país"], callers: [e.p.callerA.id], modo: "equitativo", n: 10 }));
    expect(r.repartidos).toBe(3);
    const despues = new Map((await db.from("leads").select("id, caller_id").in("id", ids)).data!.map((l) => [l.id, l.caller_id]));
    expect(ids.map((id) => despues.get(id))).toEqual([e.p.callerA.id, e.p.callerA.id, null, e.p.callerA.id]); // el argentino (P2), no
  });
});
