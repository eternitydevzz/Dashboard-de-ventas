// V2-3: sincronizar el calendario de GHL de cada closer. GHL se simula (sin internet) con su formato oficial.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, falla, ok, type Escenario } from "../apoyo/escenario";
import { sincronizarCalendarios } from "@/lib/ghl-sync";
import { estadoDesdeGhl, nuevoEstado } from "@/lib/ghl";
import { descartarCitaSinLead, unirCitaSinLead } from "@/app/(panel)/closer/acciones";
import { guardarCalendarioCloser, guardarConexionGhl } from "@/app/(panel)/admin/acciones";

let e: Escenario;
const llamadas: { url: string; headers: Record<string, string>; method?: string; body?: string }[] = [];
let eventos: Record<string, unknown>[] = [];
const contactos: Record<string, unknown> = {};
const nombresCal: Record<string, string> = {}; // sin nombre = 401, como el token real (sin calendars.readonly)
const citasGhl: Record<string, number | string> = {}; // GET de una cita: 404 o su estado («confirmed» por defecto)
let rechazar = false;
const falsoFetch = (async (url: string, init?: { headers?: Record<string, string>; method?: string; body?: string }) => {
  llamadas.push({ url, headers: init?.headers ?? {}, method: init?.method, body: init?.body });
  if (rechazar) return new Response("{}", { status: 401 });
  const u = new URL(url);
  if (u.pathname === "/calendars/events") return Response.json({ events: eventos });
  const ap = u.pathname.match(/^\/calendars\/events\/appointments\/(.+)$/);
  if (ap) return citasGhl[ap[1]] === 404 ? new Response("{}", { status: 404 }) : Response.json({ appointment: { id: ap[1], appointmentStatus: citasGhl[ap[1]] ?? "confirmed" } });
  const cal = u.pathname.match(/^\/calendars\/([^/]+)$/);
  if (cal) return nombresCal[cal[1]] ? Response.json({ calendar: { id: cal[1], name: nombresCal[cal[1]] } }) : new Response("{}", { status: 401 });
  const m = u.pathname.match(/^\/contacts\/(.+)$/);
  if (m) return contactos[m[1]] ? Response.json({ contact: contactos[m[1]] }) : new Response("{}", { status: 404 });
  return new Response("{}", { status: 404 });
}) as unknown as typeof fetch;
const AHORA = new Date("2026-10-09T15:00:00Z");
const sync = () => sincronizarCalendarios(e.proyecto.id, { fetchImpl: falsoFetch, ahora: AHORA });
const cita = async (ghlId: string) => (await db.from("citas").select("*").eq("proyecto_id", e.proyecto.id).eq("ghl_cita_id", ghlId).maybeSingle()).data;

beforeAll(async () => {
  e = await crearEscenario();
  await db.from("leads").update({ ghl_contact_id: `${e.pref}-cA` }).eq("id", e.leads.LeadA);
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("estados de GHL", () => {
  it("se traducen y no pisan lo que ya registró el closer", () => {
    expect(estadoDesdeGhl("confirmed")).toBe("confirmada");
    expect(estadoDesdeGhl("noshow")).toBe("no_show");
    expect(estadoDesdeGhl("showed")).toBeNull();
    expect(nuevoEstado("pendiente", "cancelada")).toBe("cancelada");
    expect(nuevoEstado("cerrada", "cancelada")).toBe("cerrada");
    expect(nuevoEstado("pendiente", null)).toBe("pendiente");
  });
});

describe("Sincronizar calendarios de GHL", () => {
  it("sin conectar GHL da un error claro; solo un admin guarda la conexión", async () => {
    await expect(sync()).rejects.toThrow(/Falta conectar GHL/);
    como(e, e.p.closerA);
    await falla(guardarConexionGhl("x".repeat(30), "loc"), /permiso/i);
    como(e, e.p.ceo);
    await ok(guardarConexionGhl("pit-" + "x".repeat(30), "loc-123"));
    // Arreglo 3: en la base el token está cifrado (el test de cabeceras de abajo comprueba que a GHL llega bien)
    const { data: p } = await db.from("proyectos").select("ghl_token").eq("id", e.proyecto.id).single();
    expect(p!.ghl_token).toMatch(/^v1:/);
    expect(p!.ghl_token).not.toContain("xxxxxxxxxx");
    await expect(sync()).rejects.toThrow(/Ningún closer/);
    await falla(guardarCalendarioCloser(e.p.callerA.id, "cal", ""), /no es closer/);
    await ok(guardarCalendarioCloser(e.p.closerA.id, "cal-A", ""));
  });

  it("primera sincronización: une, crea leads, aparta las que no puede y las inválidas", async () => {
    contactos[`${e.pref}-cNuevo`] = { firstName: "Nuevo", lastName: "De GHL", email: `${e.pref}-nuevo@x.test`, phone: "+1 555 000 1111" };
    contactos[`${e.pref}-cVacio`] = { firstName: "Sin", lastName: "Datos" };
    eventos = [
      { id: `${e.pref}-e1`, contactId: `${e.pref}-cA`, title: "Llamada LeadA", startTime: "2026-10-12T10:00:00-04:00", appointmentStatus: "new" },
      { id: `${e.pref}-e2`, contactId: `${e.pref}-cNuevo`, title: "Llamada nuevo", startTime: "2026-10-13T10:00:00-04:00", appointmentStatus: "confirmed" },
      { id: `${e.pref}-e3`, contactId: `${e.pref}-cVacio`, title: "Sin datos", startTime: "2026-10-14T10:00:00-04:00", appointmentStatus: "new" },
      { id: `${e.pref}-e4`, contactId: `${e.pref}-cA`, title: "Mala", startTime: "2026-10-15T10:00:00-04:00", appointmentStatus: "invalid" },
      { id: `${e.pref}-e5`, contactId: `${e.pref}-cA`, title: "Cancelada", startTime: "2026-10-16T10:00:00-04:00", appointmentStatus: "cancelled" },
      { id: `${e.pref}-e6`, contactId: `${e.pref}-cA`, title: "Sin hora" },
    ];
    llamadas.length = 0;
    const r = await sync();
    expect(r).toMatchObject({ nuevas: 3, actualizadas: 0, sinUnir: 1, invalidas: 1, errores: [] });
    // Cabeceras y parámetros oficiales
    const ev = llamadas.find((l) => l.url.includes("/calendars/events"))!;
    expect(ev.headers).toMatchObject({ Authorization: `Bearer pit-${"x".repeat(30)}`, Version: "2021-04-15" });
    const u = new URL(ev.url);
    expect(u.searchParams.get("calendarId")).toBe("cal-A");
    expect(u.searchParams.get("startTime")).toBe(String(AHORA.getTime() - 30 * 86_400_000));
    expect(llamadas.find((l) => l.url.includes("/contacts/"))!.headers.Version).toBe("2021-07-28");

    // Fase 3 (Cristian, 13 nov): sin el canal «callers» (aquí, por closer, no se lee) la agenda no es de ningún caller
    expect(await cita(`${e.pref}-e1`)).toMatchObject({ lead_id: e.leads.LeadA, closer_id: e.p.closerA.id, estado: "pendiente", origen: "ghl", agendada_por: null });
    expect((await cita(`${e.pref}-e2`))!.estado).toBe("confirmada");
    const { data: nuevo } = await db.from("leads").select("id, nombre, email, ghl_contact_id").eq("proyecto_id", e.proyecto.id).eq("ghl_contact_id", `${e.pref}-cNuevo`).single();
    expect(nuevo).toMatchObject({ nombre: "Nuevo", email: `${e.pref}-nuevo@x.test` });
    expect((await cita(`${e.pref}-e5`))!.estado).toBe("cancelada");
    expect(await cita(`${e.pref}-e3`)).toBeNull();
    const { data: sin } = await db.from("citas_sin_lead").select("ghl_cita_id, estado").eq("proyecto_id", e.proyecto.id).order("ghl_cita_id");
    expect(sin).toEqual([{ ghl_cita_id: `${e.pref}-e3`, estado: "pendiente" }, { ghl_cita_id: `${e.pref}-e4`, estado: "invalida" }]);
  });

  it("segunda sincronización: no duplica, actualiza la hora y el estado, y respeta lo que registró el closer", async () => {
    await db.from("citas").update({ estado: "cerrada" }).eq("ghl_cita_id", `${e.pref}-e2`);
    eventos = [
      { id: `${e.pref}-e1`, contactId: `${e.pref}-cA`, startTime: "2026-10-12T12:00:00-04:00", appointmentStatus: "confirmed" },
      { id: `${e.pref}-e2`, contactId: `${e.pref}-cNuevo`, startTime: "2026-10-13T10:00:00-04:00", appointmentStatus: "cancelled" },
    ];
    const r = await sync();
    expect(r).toMatchObject({ nuevas: 0, actualizadas: 1 });
    expect(await cita(`${e.pref}-e1`)).toMatchObject({ estado: "confirmada", fecha: "2026-10-12T16:00:00+00:00" });
    expect((await cita(`${e.pref}-e2`))!.estado).toBe("cerrada"); // no se pisa
    expect((await db.from("citas").select("id").eq("proyecto_id", e.proyecto.id).eq("ghl_cita_id", `${e.pref}-e1`)).data).toHaveLength(1);
    const { data: p } = await db.from("proyectos").select("ghl_sincronizado_en, ghl_ultimo_resultado").eq("id", e.proyecto.id).single();
    expect(p!.ghl_ultimo_resultado).toMatch(/0 nuevas · 1 actualizadas/);
  });

  it("una cita ya terminada en la app no cambia de hora aunque GHL traiga otra (venta adelantada, 11 oct)", async () => {
    const antes = (await cita(`${e.pref}-e2`))!;
    expect(antes.estado).toBe("cerrada");
    eventos = [
      { id: `${e.pref}-e1`, contactId: `${e.pref}-cA`, startTime: "2026-10-12T12:00:00-04:00", appointmentStatus: "confirmed" },
      { id: `${e.pref}-e2`, contactId: `${e.pref}-cNuevo`, startTime: "2026-10-20T10:00:00-04:00", appointmentStatus: "confirmed" },
    ];
    const r = await sync();
    expect(r).toMatchObject({ nuevas: 0, actualizadas: 0 });
    expect(await cita(`${e.pref}-e2`)).toMatchObject({ estado: "cerrada", fecha: antes.fecha, closer_id: antes.closer_id });
  });

  it("si GHL rechaza el token, se explica y no rompe", async () => {
    rechazar = true;
    const r = await sync();
    rechazar = false;
    expect(r.errores[0]).toMatch(/no acepta el token/);
  });

  it("revisar las sin unir: unir a un lead crea la cita; descartar la quita de la lista", async () => {
    const { data: s } = await db.from("citas_sin_lead").select("id, estado").eq("proyecto_id", e.proyecto.id).eq("ghl_cita_id", `${e.pref}-e3`).single();
    como(e, e.p.closerA);
    await falla(unirCitaSinLead(s!.id, e.leads.LeadB), /director o el CEO/);
    como(e, e.p.director);
    await ok(unirCitaSinLead(s!.id, e.leads.LeadB));
    expect(await cita(`${e.pref}-e3`)).toMatchObject({ lead_id: e.leads.LeadB, closer_id: e.p.closerA.id });
    expect((await db.from("leads").select("ghl_contact_id").eq("id", e.leads.LeadB).single()).data!.ghl_contact_id).toBe(`${e.pref}-cVacio`);
    const { data: inv } = await db.from("citas_sin_lead").select("id").eq("proyecto_id", e.proyecto.id).eq("ghl_cita_id", `${e.pref}-e4`).single();
    await ok(descartarCitaSinLead(inv!.id));
    const { data: quedan } = await db.from("citas_sin_lead").select("estado").eq("proyecto_id", e.proyecto.id).order("ghl_cita_id");
    expect(quedan!.map((x) => x.estado)).toEqual(["resuelta", "descartada"]);
  });
});

describe("Arreglo 21: citas borradas en GHL", () => {
  it("si GHL falla no se cancela nada; si una cita del rango ya no viene, pasa a «cancelada»; fuera del rango no se toca", async () => {
    expect((await cita(`${e.pref}-e1`))!.estado).toBe("confirmada");
    // Fuera del rango consultado (de hace 30 días a dentro de 60): no se toca
    await db.from("citas").insert({ proyecto_id: e.proyecto.id, lead_id: e.leads.LeadA, closer_id: e.p.closerA.id, fecha: "2027-06-01T15:00:00Z", estado: "pendiente", origen: "ghl", ghl_cita_id: `${e.pref}-lejos` });
    rechazar = true;
    expect((await sync()).canceladas).toBe(0);
    rechazar = false;
    expect((await cita(`${e.pref}-e1`))!.estado).toBe("confirmada");
    // e1 ya no viene (se borró en GHL); e2 sigue
    eventos = [{ id: `${e.pref}-e2`, contactId: `${e.pref}-cNuevo`, startTime: "2026-10-13T10:00:00-04:00", appointmentStatus: "new" }];
    const antes = (await cita(`${e.pref}-e3`))?.estado; // la que se unió a mano en el test anterior (sigue abierta)
    const r = await sync();
    expect(antes).toBe("pendiente");
    expect(r.canceladas).toBe(2); // e1 y e3: ninguna viene ya de GHL
    expect((await cita(`${e.pref}-e1`))!.estado).toBe("cancelada");
    expect((await cita(`${e.pref}-e3`))!.estado).toBe("cancelada");
    expect((await cita(`${e.pref}-e2`))!.estado).toBe("cerrada"); // lo del closer no se toca
    expect((await cita(`${e.pref}-lejos`))!.estado).toBe("pendiente");
    const { data: p } = await db.from("proyectos").select("ghl_ultimo_resultado").eq("id", e.proyecto.id).single();
    expect(p!.ghl_ultimo_resultado).toMatch(/2 canceladas \(borradas en GHL\)/);
  });

  it("12 oct (Cristian) + Fase 4: con cita nueva de GHL, el lead nuevo nace en «Orgánico → Agendados» y el que ya existía gana su tarjeta allí sin salir de su pipeline; una cancelada no lo mueve", async () => {
    const { data: org } = await db.from("pipelines").insert({ proyecto_id: e.proyecto.id, nombre: "Orgánico", orden: 5 }).select().single();
    const { data: ets } = await db.from("etapas").insert(["Nuevos", "Agendados"].map((n, i) => ({ pipeline_id: org!.id, nombre: n, orden: i }))).select();
    const agendados = ets!.find((x) => x.nombre === "Agendados")!.id;
    await db.from("leads").update({ ghl_contact_id: `${e.pref}-cB` }).eq("id", e.leads.LeadB);
    contactos[`${e.pref}-cOrg`] = { firstName: "Org", lastName: "Nuevo", email: `${e.pref}-org@x.test` };
    contactos[`${e.pref}-cCan`] = { firstName: "Can", lastName: "Celada", email: `${e.pref}-can@x.test` };
    eventos = [
      { id: `${e.pref}-o1`, contactId: `${e.pref}-cB`, title: "LeadB", startTime: "2026-10-20T10:00:00-04:00", appointmentStatus: "confirmed" },
      { id: `${e.pref}-o2`, contactId: `${e.pref}-cOrg`, title: "Nuevo", startTime: "2026-10-21T10:00:00-04:00", appointmentStatus: "new" },
      { id: `${e.pref}-o3`, contactId: `${e.pref}-cCan`, title: "Cancelada", startTime: "2026-10-22T10:00:00-04:00", appointmentStatus: "cancelled" },
    ];
    await sync();
    const lead = async (filtro: { id?: string; email?: string }) =>
      (await (filtro.id ? db.from("leads").select("pipeline_id, etapa_id").eq("id", filtro.id) : db.from("leads").select("pipeline_id, etapa_id").eq("email", filtro.email!)).single()).data;
    const antesB = (await db.from("leads").select("pipeline_id").eq("id", e.leads.LeadB).single()).data!.pipeline_id;
    expect(antesB).not.toBe(org!.id); // sigue en su pipeline…
    const { data: tarjeta } = await db.from("tarjetas_extra").select("pipeline_id, etapa_id").eq("lead_id", e.leads.LeadB).single();
    expect(tarjeta).toEqual({ pipeline_id: org!.id, etapa_id: agendados }); // …y tiene su tarjeta en Orgánico → Agendados
    expect(await lead({ email: `${e.pref}-org@x.test` })).toEqual({ pipeline_id: org!.id, etapa_id: agendados });
    expect((await lead({ email: `${e.pref}-can@x.test` }))!.pipeline_id).not.toBe(org!.id);
  });
});

describe("Plan GHL (16 oct): por calendario, con el canal del UTM", () => {
  it("lee los calendarios elegidos: canal, calendario, página sin datos personales, closer por su usuario de GHL; un lead vendido sigue vendido", async () => {
    await db.from("proyectos").update({ ghl_calendarios: ["cal-principal", "cal-viejo"] }).eq("id", e.proyecto.id);
    await db.from("miembros_proyecto").update({ ghl_user_id: "u-B" }).eq("proyecto_id", e.proyecto.id).eq("perfil_id", e.p.closerB.id);
    nombresCal["cal-principal"] = "0. Calendar Principal"; // «cal-viejo» sin nombre (401): se guarda su id
    contactos[`${e.pref}-cYT`] = { firstName: "Yt", lastName: "Lead", email: `${e.pref}-yt@x.test`, lastAttributionSource: { url: "https://codigomaestria.com/agenda?utm_source=yt", utmSource: "yt" } };
    contactos[`${e.pref}-cWid`] = { firstName: "Wid", lastName: "Get", email: `${e.pref}-wid@x.test`, lastAttributionSource: { url: `https://api.leadconnectorhq.com/widget/booking/X?email=${e.pref}-wid@x.test&phone=+15550001&utm_source=callers` } };
    contactos[`${e.pref}-cV`] = { firstName: "Ven", lastName: "Dido", lastAttributionSource: { url: "https://codigomaestria.com/agenda" } };
    await db.from("leads").update({ estado_caller: "vendido", ghl_contact_id: `${e.pref}-cV` }).eq("id", e.leads.LeadLibre);
    // Los pipelines «0. Agendas YT» (de antes; ya no recibe citas) y «0. Agendas General», con su «Agendan»
    const agendanDe: Record<string, string> = {};
    for (const [i, nombre] of ["0. Agendas YT", "0. Agendas General"].entries()) {
      const { data: pl } = await db.from("pipelines").insert({ proyecto_id: e.proyecto.id, nombre, orden: 20 + i }).select().single();
      const { data: et } = await db.from("etapas").insert(["Form", "Agendan"].map((n, j) => ({ pipeline_id: pl!.id, nombre: n, orden: j }))).select();
      agendanDe[nombre] = et!.find((x) => x.nombre === "Agendan")!.id;
    }
    eventos = [
      { id: `${e.pref}-k1`, calendarId: "cal-principal", contactId: `${e.pref}-cYT`, assignedUserId: "u-B", startTime: "2026-10-25T10:00:00-04:00", appointmentStatus: "confirmed" },
      { id: `${e.pref}-k2`, calendarId: "cal-principal", contactId: `${e.pref}-cWid`, assignedUserId: "u-otro", startTime: "2026-10-26T10:00:00-04:00", appointmentStatus: "new" },
      { id: `${e.pref}-k3`, calendarId: "cal-principal", contactId: `${e.pref}-cV`, assignedUserId: "u-B", startTime: "2026-10-27T10:00:00-04:00", appointmentStatus: "confirmed" },
    ];
    // Abiertas de antes que ya no vienen: o1 está borrada en GHL (404); o2 sigue en GHL (en otro calendario)
    citasGhl[`${e.pref}-o1`] = 404;
    citasGhl[`${e.pref}-o2`] = "confirmed";
    const antesO2 = (await cita(`${e.pref}-o2`))!.estado;
    llamadas.length = 0;
    const r = await sync();
    expect(r.errores).toEqual([]);
    // Cada calendario se lee por su id (no por closer)
    const leidos = llamadas.filter((l) => new URL(l.url).pathname === "/calendars/events").map((l) => new URL(l.url).searchParams.get("calendarId"));
    expect(leidos).toEqual(["cal-principal", "cal-viejo"]);

    expect(await cita(`${e.pref}-k1`)).toMatchObject({ canal: "yt", ghl_calendario: "0. Calendar Principal", origen_url: "https://codigomaestria.com/agenda?utm_source=yt", closer_id: e.p.closerB.id, estado: "confirmada" });
    const k2 = (await cita(`${e.pref}-k2`))!;
    expect(k2).toMatchObject({ canal: "callers", closer_id: null, origen_url: "https://api.leadconnectorhq.com/widget/booking/X?utm_source=callers" });
    expect(k2.origen_url).not.toContain("@");
    expect(await cita(`${e.pref}-k3`)).toMatchObject({ canal: "directo", lead_id: e.leads.LeadLibre });
    expect((await db.from("leads").select("estado_caller").eq("id", e.leads.LeadLibre).single()).data!.estado_caller).toBe("vendido");

    expect((await cita(`${e.pref}-o1`))!.estado).toBe("cancelada");
    expect((await cita(`${e.pref}-o2`))!.estado).toBe(antesO2);

    // Cristian, 17 oct: un solo pipeline de agendas. El lead de YouTube nace en «0. Agendas General → Agendan» con la
    // etiqueta del canal, y ya no va a «0. Agendas YT» aunque exista
    const { data: ly } = await db.from("leads").select("id, etapa_id, etiquetas").eq("ghl_contact_id", `${e.pref}-cYT`).single();
    expect(ly!.etapa_id).toBe(agendanDe["0. Agendas General"]);
    expect(ly!.etiquetas).toContain("Canal: YouTube");
    const { data: tg } = await db.from("tarjetas_extra").select("etapa_id").eq("lead_id", ly!.id);
    expect(tg!.map((x) => x.etapa_id)).not.toContain(agendanDe["0. Agendas YT"]);
    // Callers: también solo General
    const { data: lw } = await db.from("leads").select("etapa_id, etiquetas").eq("ghl_contact_id", `${e.pref}-cWid`).single();
    expect(lw!.etapa_id).toBe(agendanDe["0. Agendas General"]);
    expect(lw!.etiquetas).toContain("Canal: Callers");
    // El vendido sigue donde estaba (no se mueve), pero lleva su etiqueta
    expect((await db.from("leads").select("etiquetas").eq("id", e.leads.LeadLibre).single()).data!.etiquetas).toContain("Canal: Directo");
  });

  it("una cita reciente que entró sin canal (por el workflow) lo gana en la siguiente lectura; si una lectura falla, no se cancela nada", async () => {
    await db.from("citas").update({ canal: null, ghl_calendario: null, origen_url: null }).eq("ghl_cita_id", `${e.pref}-k1`);
    await sync();
    expect(await cita(`${e.pref}-k1`)).toMatchObject({ canal: "yt", ghl_calendario: "0. Calendar Principal" });

    citasGhl[`${e.pref}-o2`] = 404;
    rechazar = true;
    const r = await sync();
    rechazar = false;
    expect(r.canceladas).toBe(0);
    expect((await cita(`${e.pref}-o2`))!.estado).not.toBe("cancelada");
  });

  it("Plan GHL E1: la cita del usuario de GHL de un caller con «También closer» queda con él de closer; sin el interruptor, sin closer", async () => {
    await db.from("miembros_proyecto").update({ ghl_user_id: "u-F" }).eq("proyecto_id", e.proyecto.id).eq("perfil_id", e.p.callerA.id);
    contactos[`${e.pref}-cF1`] = { firstName: "Fa", lastName: "Uno", email: `${e.pref}-f1@x.test` };
    contactos[`${e.pref}-cF2`] = { firstName: "Fa", lastName: "Dos", email: `${e.pref}-f2@x.test` };
    eventos = [{ id: `${e.pref}-f1`, calendarId: "cal-principal", contactId: `${e.pref}-cF1`, assignedUserId: "u-F", startTime: "2026-10-28T10:00:00-04:00", appointmentStatus: "confirmed" }];
    await sync();
    expect((await cita(`${e.pref}-f1`))!.closer_id).toBeNull();

    await db.from("perfiles").update({ tambien_closer: true }).eq("id", e.p.callerA.id);
    como(e, e.p.ceo);
    await ok(guardarCalendarioCloser(e.p.callerA.id, "", "u-F")); // con el interruptor ya se le puede guardar su usuario de GHL
    eventos = [{ id: `${e.pref}-f2`, calendarId: "cal-principal", contactId: `${e.pref}-cF2`, assignedUserId: "u-F", startTime: "2026-10-29T10:00:00-04:00", appointmentStatus: "confirmed" }];
    await sync();
    await db.from("perfiles").update({ tambien_closer: false }).eq("id", e.p.callerA.id);
    await db.from("miembros_proyecto").update({ ghl_user_id: null }).eq("proyecto_id", e.proyecto.id).eq("perfil_id", e.p.callerA.id);
    expect((await cita(`${e.pref}-f2`))!.closer_id).toBe(e.p.callerA.id);
  });

  it("11 nov: una cita nueva de un lead de un país de otro closer pasa a ese closer, también en GHL (usuario y calendario)", async () => {
    await db.from("miembros_proyecto").update({ ghl_user_id: "u-B", ghl_calendar_id: "cal-B", paises_closer: ["ES", "IT"] }).eq("proyecto_id", e.proyecto.id).eq("perfil_id", e.p.closerB.id);
    await db.from("miembros_proyecto").update({ ghl_user_id: "u-A" }).eq("proyecto_id", e.proyecto.id).eq("perfil_id", e.p.closerA.id);
    contactos[`${e.pref}-cEs`] = { firstName: "Es", lastName: "Paña", email: `${e.pref}-es@x.test`, phone: "+34 611 222 333" };
    contactos[`${e.pref}-cPasada`] = { firstName: "Pa", lastName: "Sada", email: `${e.pref}-pa@x.test`, phone: "+34 611 222 444" };
    eventos = [
      { id: `${e.pref}-es1`, calendarId: "cal-principal", contactId: `${e.pref}-cEs`, assignedUserId: "u-A", startTime: "2026-10-30T10:00:00-04:00", appointmentStatus: "confirmed" },
      // ya pasada: no se toca
      { id: `${e.pref}-es2`, calendarId: "cal-principal", contactId: `${e.pref}-cPasada`, assignedUserId: "u-A", startTime: "2026-10-01T10:00:00-04:00", appointmentStatus: "confirmed" },
    ];
    llamadas.length = 0;
    await sync();
    const puts = llamadas.filter((l) => l.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toContain(`/calendars/events/appointments/${e.pref}-es1`);
    expect(JSON.parse(puts[0].body!)).toEqual({ assignedUserId: "u-B", calendarId: "cal-B", ignoreFreeSlotValidation: true });
    expect((await cita(`${e.pref}-es1`))!.closer_id).toBe(e.p.closerB.id);
    expect((await cita(`${e.pref}-es2`))!.closer_id).toBe(e.p.closerA.id);
    await db.from("miembros_proyecto").update({ ghl_user_id: null, ghl_calendar_id: null, paises_closer: [] }).eq("proyecto_id", e.proyecto.id).in("perfil_id", [e.p.closerA.id, e.p.closerB.id]);
  });
});
