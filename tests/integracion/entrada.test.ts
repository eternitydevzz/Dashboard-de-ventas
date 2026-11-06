// «Entradas»: las landings envían directamente a la app. Se prueba con los dos envíos reales
// (datos personales inventados) contra un proyecto de prueba que se borra solo.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { crearEscenario, borrarEscenario, como, db, type Escenario } from "../apoyo/escenario";
import { enviarPendientesGhl } from "@/lib/ghl-envios";
import { leerLeadsGhl } from "@/lib/ghl-leads";
import { reintentarEnvioGhl } from "@/app/(panel)/admin/acciones";
import type { Proyecto } from "@/lib/tipos";
import { POST, OPTIONS } from "@/app/api/webhooks/entrada/[token]/route";
import { BIBLIOTECA, OPTIN } from "../apoyo/envios";

let e: Escenario;
let token: string;
let entradaId: string;
beforeAll(async () => {
  e = await crearEscenario();
  const { data: p2 } = await db.from("pipelines").insert({ proyecto_id: e.proyecto.id, nombre: "Biblioteca test", orden: 1 }).select().single();
  const { data: et } = await db.from("etapas").insert([{ pipeline_id: p2!.id, nombre: "Quiz completo", orden: 0 }]).select();
  const { data } = await db
    .from("entradas")
    .insert({
      proyecto_id: e.proyecto.id,
      nombre: "Biblioteca de recursos",
      pipeline_id: e.pipeline.id,
      reglas: [
        { campo: "quiz_completed", operador: "igual", valor: "true", pipeline_id: p2!.id, etapa_id: et![0].id, etiqueta: "quiz-completo" },
        { campo: "quiz_completed", operador: "igual", valor: "false", etiqueta: "quiz-sin-terminar" },
      ],
    })
    .select()
    .single();
  token = data!.token;
  entradaId = data!.id;
  (globalThis as Record<string, unknown>).__p2 = p2!.id;
  (globalThis as Record<string, unknown>).__et = et![0].id;
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

const conEmail = (o: Record<string, unknown>, email: string) => ({ ...o, email });
function enviar(cuerpo: unknown, t = token) {
  const req = new NextRequest(`http://localhost/api/webhooks/entrada/${t}`, {
    method: "POST",
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
    headers: { "content-type": "application/json" },
  });
  return POST(req, { params: Promise.resolve({ token: t }) } as never);
}
const lead = async (email: string) => (await db.from("leads").select("*").eq("proyecto_id", e.proyecto.id).eq("email", email).single()).data!;

describe("Entradas (landings → app)", () => {
  it("un token que no existe da 404 y uno mal formado también", async () => {
    expect((await enviar(BIBLIOTECA, "0".repeat(48))).status).toBe(404);
    expect((await enviar(BIBLIOTECA, "malo")).status).toBe(404);
  });

  it("permite que la landing envíe desde el navegador (CORS)", async () => {
    const r = await OPTIONS();
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect((await enviar("{roto")).headers.get("access-control-allow-origin")).toBe("*");
  });

  it("biblioteca: se guarda todo y las reglas lo llevan a su pipeline y columna", async () => {
    const email = `${e.pref}-bib@ejemplo.test`;
    const r = await enviar(conEmail(BIBLIOTECA, email));
    expect(r.status).toBe(200);
    const l = await lead(email);
    expect(l).toMatchObject({ nombre: "ana", apellido: "maria prueba lopez", fuente: "recursos", quiz_score: 14, origen: "ghl" });
    expect(l.pipeline_id).toBe((globalThis as Record<string, unknown>).__p2);
    expect(l.etapa_id).toBe((globalThis as Record<string, unknown>).__et);
    expect(l.etiquetas).toEqual(["recursos-ia", "quiz-completo"]);
    expect(l.respuestas).toHaveLength(6);
    expect(l.datos.event_id).toBe(BIBLIOTECA.event_id);
    expect(l.datos).not.toHaveProperty("headers");
    // El envío completo queda guardado y unido al lead
    const { data: ev } = await db.from("webhook_eventos").select("*").eq("entrada_id", entradaId).eq("lead_id", l.id).single();
    expect(ev).toMatchObject({ procesado: true, error: null });
    expect(ev!.payload.headers).toBeDefined(); // el original, intacto
  });

  it("opt-in: evento y UTM; si no cumple la regla, queda en el pipeline por defecto", async () => {
    const email = `${e.pref}-opt@ejemplo.test`;
    expect((await enviar(conEmail({ ...OPTIN, quiz_completed: false }, email))).status).toBe(200);
    const l = await lead(email);
    expect(l).toMatchObject({ evento: "Masterclass AI 2026-10-15", fuente: "landing-codigo-maestria", pipeline_id: e.pipeline.id, etapa_id: e.etapas.Nuevos });
    expect(l.seguimiento).toMatchObject({ utm_source: "facebook", utm_campaign: "masterclass-oct", fbclid: "abc123" });
    expect(l.etiquetas).toEqual(["quiz-sin-terminar"]);
    expect(l.respuestas).toHaveLength(8);
  });

  it("si la misma persona vuelve a entrar no se duplica, no pierde nada y se queda su primer origen", async () => {
    const email = `${e.pref}-opt@ejemplo.test`;
    await enviar(conEmail({ ...OPTIN, quiz_completed: true, event: "Masterclass AI 2026-11-20", utm_source: "google", quiz_nueva_pregunta: "Sí" }, email));
    const { data } = await db.from("leads").select("*").eq("proyecto_id", e.proyecto.id).eq("email", email);
    expect(data).toHaveLength(1);
    const l = data![0];
    expect(l.evento).toBe("Masterclass AI 2026-10-15"); // primer evento
    expect(l.seguimiento.utm_source).toBe("facebook"); // primer origen
    expect(l.etiquetas).toEqual(["quiz-sin-terminar", "quiz-completo"]); // se suman
    expect(l.respuestas).toHaveLength(9); // 8 + la nueva
    expect(l.pipeline_id).toBe(e.pipeline.id); // un lead que ya existe no se mueve solo
    const { data: act } = await db.from("actividades").select("nota").eq("lead_id", l.id).like("nota", "%Masterclass AI 2026-11-20%");
    expect(act).toHaveLength(1); // queda apuntado que volvió a otro evento
  });

  it("sin email: se reconoce a la persona por el teléfono", async () => {
    const sinEmail = { ...OPTIN, email: "", phone: "+1 (727) 555-0101" };
    expect((await enviar(sinEmail)).status).toBe(200);
    expect((await enviar({ ...sinEmail, phone: "17275550101" })).status).toBe(200);
    const { data } = await db.from("leads").select("id").eq("proyecto_id", e.proyecto.id).like("telefono", "%555%0101%");
    expect(data).toHaveLength(1);
  });

  it("sin email ni teléfono: se rechaza, pero el envío queda guardado con el motivo", async () => {
    const r = await enviar({ source: "x", quiz_edad: "18" });
    expect(r.status).toBe(422);
    const { data } = await db.from("webhook_eventos").select("procesado, error, payload").eq("entrada_id", entradaId).order("recibido_en", { ascending: false }).limit(1).single();
    expect(data).toMatchObject({ procesado: false, error: "El envío no trae email ni teléfono" });
    expect(data!.payload.quiz_edad).toBe("18");
  });

  it("una entrada desactivada no acepta envíos", async () => {
    await db.from("entradas").update({ activa: false }).eq("id", entradaId);
    expect((await enviar(conEmail(OPTIN, `${e.pref}-off@ejemplo.test`))).status).toBe(404);
    await db.from("entradas").update({ activa: true }).eq("id", entradaId);
  });
});

// ---------- Plan GHL, fase 1 (Cristian, 6 nov 2026): la Entrada hace en GHL lo que hacía el workflow ----------
// GHL se simula (sin internet) con la forma de la especificación oficial: upsert de contacto, etiquetas, búsqueda y
// creación de oportunidades, y la búsqueda de contactos de la lectura de 60 s. El GHL falso reconoce al contacto por
// email, como Maestria (allowDuplicateContact = false).
describe("Entrada → GHL por la API", () => {
  type Contacto = { id: string; email: string; firstName?: string; tags: string[]; customFields: { id: string; value: string }[]; dateAdded: string; dateUpdated: string; source?: string };
  const ghl = { contactos: [] as Contacto[], opps: [] as { id: string; contactId: string; pipelineId: string; pipelineStageId?: string }[], upserts: [] as Record<string, unknown>[], falla: false };
  const avisos: { entrada: string; lead: string; error: string }[] = [];
  const avisar = async (a: { entrada: string; lead: string; error: string }) => void avisos.push(a);
  const PIPE_GHL = "dE7go9T3Mi2zbIT4sGME";
  const COL_GHL = "9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d";
  let n = 0;

  const falsoGhl = (async (url: string, init?: { method?: string; body?: string }) => {
    if (ghl.falla) return new Response("{}", { status: 401 });
    const u = new URL(url);
    const metodo = init?.method ?? "GET";
    const cuerpo = init?.body ? JSON.parse(init.body) : {};
    const ahoraIso = new Date().toISOString();
    if (u.pathname === "/contacts/upsert") {
      ghl.upserts.push(cuerpo);
      let c = ghl.contactos.find((x) => x.email === cuerpo.email);
      const nuevo = !c;
      if (!c) ghl.contactos.push((c = { id: `${e.pref}-c${++n}`, email: cuerpo.email, tags: [], customFields: [], dateAdded: ahoraIso, dateUpdated: ahoraIso }));
      if ("tags" in cuerpo) c.tags = cuerpo.tags; // así se comporta GHL: borra todas
      c.firstName = cuerpo.firstName ?? c.firstName;
      c.source = cuerpo.source ?? c.source;
      for (const f of cuerpo.customFields ?? []) c.customFields = [...c.customFields.filter((x) => x.id !== f.id), { id: f.id, value: f.field_value }];
      c.dateUpdated = ahoraIso;
      return Response.json({ new: nuevo, contact: { id: c.id, tags: [...c.tags] } });
    }
    const t = u.pathname.match(/^\/contacts\/([^/]+)\/tags$/);
    if (t) {
      const c = ghl.contactos.find((x) => x.id === decodeURIComponent(t[1]))!;
      // Como el GHL real (visto el 6 nov): guarda las etiquetas en minúsculas
      const tags = (cuerpo.tags as string[]).map((x) => x.toLowerCase());
      c.tags = metodo === "DELETE" ? c.tags.filter((x) => !tags.includes(x)) : [...new Set([...c.tags, ...tags])];
      return Response.json({ tags: c.tags }, { status: metodo === "DELETE" ? 200 : 201 });
    }
    if (u.pathname === "/opportunities/search") {
      const q = u.searchParams;
      return Response.json({ opportunities: ghl.opps.filter((o) => (!q.get("contact_id") || o.contactId === q.get("contact_id")) && (!q.get("pipeline_id") || o.pipelineId === q.get("pipeline_id"))), meta: {} });
    }
    const mover = u.pathname.match(/^\/opportunities\/([^/]+)$/);
    if (mover && metodo === "PUT") {
      const o = ghl.opps.find((x) => x.id === decodeURIComponent(mover[1]))!;
      o.pipelineStageId = cuerpo.pipelineStageId;
      return Response.json({ opportunity: o });
    }
    if (u.pathname === "/opportunities/" && metodo === "POST") {
      const o = { id: `${e.pref}-o${++n}`, contactId: cuerpo.contactId, pipelineId: cuerpo.pipelineId, pipelineStageId: cuerpo.pipelineStageId };
      ghl.opps.push(o);
      return Response.json({ opportunity: o }, { status: 201 });
    }
    // Lo que usa la lectura de 60 s (ghl-leads.ts)
    if (u.pathname === "/contacts/search") {
      const b = cuerpo;
      const campo = b.filters[0].field as "dateAdded" | "dateUpdated";
      const lista = ghl.contactos.filter((c) => c[campo] > b.filters[0].value.gt).sort((a, z) => a[campo].localeCompare(z[campo]));
      return Response.json({ contacts: lista.slice(0, b.pageLimit), total: lista.length });
    }
    if (/^\/locations\/[^/]+\/customFields$/.test(u.pathname)) return Response.json({ customFields: [] });
    if (u.pathname === "/opportunities/pipelines") return Response.json({ pipelines: [] });
    const c1 = u.pathname.match(/^\/contacts\/([^/]+)$/);
    if (c1) {
      const c = ghl.contactos.find((x) => x.id === decodeURIComponent(c1[1]));
      return c ? Response.json({ contact: c }) : new Response("{}", { status: 404 });
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;

  let tokenGhl: string;
  let entradaGhl: string;
  const pipes: Record<string, string> = {};
  const proyectoGhl = async () => (await db.from("proyectos").select("*").eq("id", e.proyecto.id).single()).data as Proyecto & { ghl_location_id: string };
  const enviarGhl = (ahora = new Date(Date.now() + 61_000)) => proyectoGhl().then((p) => enviarPendientesGhl(p, "tok", { fetchImpl: falsoGhl, ahora, avisar }));
  const post = (cuerpo: unknown) => enviar(cuerpo, tokenGhl);
  const eventos = async (leadId: string) => (await db.from("webhook_eventos").select("*").eq("entrada_id", entradaGhl).eq("lead_id", leadId).order("recibido_en")).data!;
  const registro = (email: string) => ({ name: "ana maria prueba", first_name: "ana", email, phone: "+584220000001", step: "registro", source: "recursos", utm_source: "facebook", utm_campaign: "biblio-nov", tags: ["recursos-ia"] });
  const cuestionario = (email: string) => ({ ...registro(email), step: "cuestionario", utm_source: "", quiz: { situacion: "Tengo una agencia" }, quiz_completed: true });

  beforeAll(async () => {
    await db.from("proyectos").update({ ghl_location_id: "loc-1", ghl_leads_hasta: new Date(Date.now() - 10 * 60_000).toISOString() }).eq("id", e.proyecto.id);
    for (const nombre of ["1. Biblioteca Recursos", "0. Agendas General"]) {
      const { data: p } = await db.from("pipelines").insert({ proyecto_id: e.proyecto.id, nombre, orden: 7 }).select("id").single();
      await db.from("etapas").insert([{ pipeline_id: p!.id, nombre: "Nuevos", orden: 0 }]);
      pipes[nombre] = p!.id;
    }
    const { data } = await db
      .from("entradas")
      .insert({
        proyecto_id: e.proyecto.id,
        nombre: "Web · Biblioteca registro (test)",
        pipeline_id: pipes["1. Biblioteca Recursos"],
        ghl_activo: true,
        ghl_campos: { "quiz.situacion": "EsY9HSZfP5L1FT6h4nX2", utm_source: "BPs2vrG7eqH7D3d5zJEf", utm_campaign: "q5wycj0YpQt8SVlLxXbQ" },
        ghl_pipeline_id: PIPE_GHL,
        ghl_etapa_id: COL_GHL,
        ghl_etiqueta_base: "Biblioteca-form",
      })
      .select()
      .single();
    tokenGhl = data!.token;
    entradaGhl = data!.id;
  });

  it("el lead se guarda al momento y su envío a GHL espera 1 minuto", async () => {
    const email = `${e.pref}-g1@ejemplo.test`;
    const antes = Date.now();
    expect((await post(registro(email))).status).toBe(200);
    const l = await lead(email);
    expect(l.pipeline_id).toBe(pipes["1. Biblioteca Recursos"]);
    const [ev] = await eventos(l.id);
    expect(ev).toMatchObject({ procesado: true, ghl_estado: "esperando", ghl_intentos: 0 });
    const espera = new Date(ev.ghl_enviar_en).getTime() - antes;
    expect(espera).toBeGreaterThanOrEqual(59_000);
    expect(espera).toBeLessThan(65_000);
    // Antes de la hora no se manda nada
    expect((await enviarGhl(new Date())).enviados).toBe(0);
    expect(ghl.upserts).toHaveLength(0);
  });

  it("pasada la espera: contacto (sin tags), campos, UTM, etiqueta -incompleto y oportunidad; el envío queda ok", async () => {
    const email = `${e.pref}-g1@ejemplo.test`;
    const r = await enviarGhl();
    expect(r).toMatchObject({ enviados: 1, errores: [] });
    expect(ghl.upserts).toHaveLength(1);
    expect(ghl.upserts[0]).not.toHaveProperty("tags");
    expect(ghl.upserts[0]).toMatchObject({ locationId: "loc-1", email, firstName: "ana", source: "recursos" });
    const c = ghl.contactos.find((x) => x.email === email)!;
    expect(c.tags).toEqual(["biblioteca-form-incompleto"]);
    expect(c.customFields).toEqual([
      { id: "BPs2vrG7eqH7D3d5zJEf", value: "facebook" },
      { id: "q5wycj0YpQt8SVlLxXbQ", value: "biblio-nov" },
    ]);
    expect(ghl.opps).toEqual([{ id: expect.any(String), contactId: c.id, pipelineId: PIPE_GHL, pipelineStageId: COL_GHL }]);
    const l = await lead(email);
    expect(l.ghl_contact_id).toBe(c.id);
    expect(l.etiquetas).toEqual(["recursos-ia", "biblioteca-form-incompleto"]); // la misma etiqueta que en GHL
    expect((await eventos(l.id))[0]).toMatchObject({ ghl_estado: "ok", ghl_error: null });
  });

  it("el contacto creado vuelve en la lectura de 60 s y NO se duplica ni cae en «General»", async () => {
    const email = `${e.pref}-g1@ejemplo.test`;
    // Ya pasaron los 2 minutos de espera de los contactos sin etiqueta de pipeline (ghl-leads.ts)
    const c = ghl.contactos.find((x) => x.email === email)!;
    c.dateAdded = new Date(Date.now() - 5 * 60_000).toISOString();
    const r = await leerLeadsGhl(await proyectoGhl(), "tok", { fetchImpl: falsoGhl, ahora: new Date() });
    expect(r.errores).toEqual([]);
    const { data } = await db.from("leads").select("id, pipeline_id, ghl_contact_id").eq("proyecto_id", e.proyecto.id).or(`email.eq.${email},ghl_contact_id.eq.${c.id}`);
    expect(data).toHaveLength(1);
    expect(data![0].pipeline_id).toBe(pipes["1. Biblioteca Recursos"]);
    const { data: tarjetas } = await db.from("tarjetas_extra").select("pipeline_id").eq("lead_id", data![0].id);
    expect((tarjetas ?? []).map((x) => x.pipeline_id)).not.toContain(pipes["0. Agendas General"]);
  });

  it("registro + cuestionario dentro de la espera: UN solo envío, completo", async () => {
    const email = `${e.pref}-g2@ejemplo.test`;
    await post(registro(email));
    await post(cuestionario(email));
    const antes = ghl.upserts.length;
    expect((await enviarGhl()).enviados).toBe(1);
    expect(ghl.upserts.length - antes).toBe(1);
    const c = ghl.contactos.find((x) => x.email === email)!;
    expect(c.tags).toEqual(["biblioteca-form-completo"]);
    expect(c.customFields).toContainEqual({ id: "EsY9HSZfP5L1FT6h4nX2", value: "Tengo una agencia" });
    expect(c.customFields).toContainEqual({ id: "BPs2vrG7eqH7D3d5zJEf", value: "facebook" }); // el vacío del cuestionario no lo borra
    const l = await lead(email);
    expect((await eventos(l.id)).map((x) => x.ghl_estado)).toEqual(["ok", "ok"]);
    expect(l.etiquetas).toContain("biblioteca-form-completo");
  });

  it("cuestionario tardío: se actualizan los campos y pasa de -incompleto a -completo, sin otra oportunidad", async () => {
    const email = `${e.pref}-g1@ejemplo.test`;
    const opps = ghl.opps.length;
    await post(cuestionario(email));
    expect((await enviarGhl()).enviados).toBe(1);
    const c = ghl.contactos.find((x) => x.email === email)!;
    expect(c.tags).toEqual(["biblioteca-form-completo"]);
    expect(c.customFields).toContainEqual({ id: "EsY9HSZfP5L1FT6h4nX2", value: "Tengo una agencia" });
    expect(ghl.opps.length).toBe(opps);
    const l = await lead(email);
    expect(l.etiquetas).toEqual(["recursos-ia", "biblioteca-form-completo"]);
  });

  it("la lectura de 60 s con la etiqueta vieja de GHL (-incompleto) no se la devuelve al lead completo (prueba real, 6 nov)", async () => {
    const email = `${e.pref}-g1@ejemplo.test`;
    const c = ghl.contactos.find((x) => x.email === email)!;
    // La búsqueda de GHL tarda en ponerse al día: aún devuelve la etiqueta de antes, como cambio reciente
    const real = c.tags;
    c.tags = ["biblioteca-form-incompleto"];
    c.dateUpdated = new Date().toISOString();
    const r = await leerLeadsGhl(await proyectoGhl(), "tok", { fetchImpl: falsoGhl, ahora: new Date() });
    c.tags = real;
    expect(r.errores).toEqual([]);
    const l = await lead(email);
    expect(l.etiquetas).toEqual(["recursos-ia", "biblioteca-form-completo"]);
  });

  it("fase 3: si la Entrada tiene otra columna, la oportunidad que ya existe se mueve ahí (no se crea otra)", async () => {
    const email = `${e.pref}-g2@ejemplo.test`;
    const c = ghl.contactos.find((x) => x.email === email)!;
    const antes = ghl.opps.filter((o) => o.contactId === c.id);
    expect(antes).toHaveLength(1);
    await db.from("entradas").update({ ghl_etapa_id: "columna-agenda" }).eq("id", entradaGhl);
    await post(cuestionario(email));
    expect((await enviarGhl()).enviados).toBe(1);
    const despues = ghl.opps.filter((o) => o.contactId === c.id);
    expect(despues).toHaveLength(1);
    expect(despues[0].pipelineStageId).toBe("columna-agenda");
    await db.from("entradas").update({ ghl_etapa_id: COL_GHL }).eq("id", entradaGhl);
  });

  it("si GHL falla: 5 intentos, después «error» y UN email; con «Reintentar» termina en ok", async () => {
    const email = `${e.pref}-g3@ejemplo.test`;
    await post(registro(email));
    const l = await lead(email);
    ghl.falla = true;
    let ahora = Date.now() + 61_000;
    for (let i = 1; i <= 5; i++) {
      const r = await enviarGhl(new Date(ahora));
      expect(r.errores).toHaveLength(1);
      expect(r.errores[0]).toMatch(/token/);
      const [ev] = await eventos(l.id);
      expect(ev.ghl_intentos).toBe(i);
      expect(ev.ghl_estado).toBe(i < 5 ? "esperando" : "error");
      ahora += 61_000;
    }
    expect(avisos).toEqual([{ entrada: "Web · Biblioteca registro (test)", lead: email, error: expect.stringMatching(/token/) }]);
    // En error ya no se intenta más
    expect((await enviarGhl(new Date(ahora))).errores).toHaveLength(0);

    ghl.falla = false;
    como(e, e.p.ceo);
    const [ev] = await eventos(l.id);
    await reintentarEnvioGhl(ev.id);
    expect((await eventos(l.id))[0]).toMatchObject({ ghl_estado: "esperando", ghl_intentos: 0, ghl_error: null });
    expect((await enviarGhl()).enviados).toBe(1);
    expect((await eventos(l.id))[0].ghl_estado).toBe("ok");
    expect(avisos).toHaveLength(1);
  });

  it("con el interruptor apagado no se manda nada (y no avisa por email)", async () => {
    const email = `${e.pref}-g4@ejemplo.test`;
    await post(registro(email));
    await db.from("entradas").update({ ghl_activo: false }).eq("id", entradaGhl);
    const antes = ghl.upserts.length;
    await enviarGhl();
    expect(ghl.upserts.length).toBe(antes);
    const [ev] = await eventos((await lead(email)).id);
    expect(ev).toMatchObject({ ghl_estado: "error", ghl_error: expect.stringMatching(/interruptor apagado/) });
    expect(avisos).toHaveLength(1);
    // Y un envío nuevo con el interruptor apagado ni siquiera queda esperando
    const otro = `${e.pref}-g5@ejemplo.test`;
    await post(registro(otro));
    expect((await eventos((await lead(otro)).id))[0].ghl_estado).toBeNull();
    await db.from("entradas").update({ ghl_activo: true }).eq("id", entradaGhl);
  });
});
