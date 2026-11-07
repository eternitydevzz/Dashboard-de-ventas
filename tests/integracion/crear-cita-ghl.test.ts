// Encargo de Callers (C11 punto 13, con el OK de Cristian, 7 nov 2026): cuando se agenda en la app, la cita se crea
// también en el calendario de GHL del closer y se guarda su id (así la lectura de cada minuto no la duplica).
// Si no se puede (sin calendario, GHL falla…), la cita de la app se queda y se avisa. GHL de mentira.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { borrarEscenario, como, crearEscenario, db, type Escenario } from "../apoyo/escenario";
import { agendarCita } from "@/app/(panel)/leads/acciones";
import { cifrar } from "@/lib/cifrado";

let e: Escenario;
const ghl = { citas: [] as Record<string, unknown>[], upserts: [] as Record<string, unknown>[], falla: false };
const original = globalThis.fetch;

beforeAll(async () => {
  e = await crearEscenario();
  await db.from("proyectos").update({ ghl_location_id: "loc-test", ghl_token: cifrar("token-de-prueba-no-real"), calendario: { aviso: 0, max_dia: null, descanso: 0, duracion: 45 } }).eq("id", e.proyecto.id);
  // closerA con calendario de GHL; closerB sin calendario
  await db.from("miembros_proyecto").update({ ghl_calendar_id: "cal-closer-a", ghl_user_id: "usr-closer-a" }).eq("proyecto_id", e.proyecto.id).eq("perfil_id", e.p.closerA.id);
  await db.from("miembros_proyecto").update({ ghl_calendar_id: null, ghl_user_id: null }).eq("proyecto_id", e.proyecto.id).eq("perfil_id", e.p.closerB.id);
  vi.spyOn(globalThis, "fetch").mockImplementation((async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url instanceof Request ? url.url : url);
    if (!u.startsWith("https://services.leadconnectorhq.com")) return original(url as never, init);
    if (ghl.falla) return new Response("{}", { status: 401 });
    const cuerpo = init?.body ? JSON.parse(String(init.body)) : {};
    if (u.endsWith("/contacts/upsert")) {
      ghl.upserts.push(cuerpo);
      return Response.json({ contact: { id: `contacto-${ghl.upserts.length}`, tags: [] } });
    }
    if (u.endsWith("/calendars/events/appointments")) {
      ghl.citas.push(cuerpo);
      return Response.json({ id: `cita-ghl-${ghl.citas.length}` }, { status: 201 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch);
});
afterEach(() => {
  ghl.falla = false;
});
afterAll(async () => {
  vi.restoreAllMocks();
  if (e) await borrarEscenario(e);
});

const nuevoLead = async (n: string, extra: Record<string, unknown> = {}) =>
  (await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre: n, email: `${e.pref}-${n}@x.test`, telefono: "+12015550101", ...extra }).select("id").single()).data!.id as string;
const citaDe = async (id: string) => (await db.from("citas").select("ghl_cita_id, closer_id").eq("lead_id", id).single()).data!;
const notas = async (id: string) => ((await db.from("actividades").select("nota").eq("lead_id", id)).data ?? []).map((x) => x.nota as string);

describe("agendar en la app crea la cita también en GHL", () => {
  it("closer con calendario: crea el contacto si el lead no lo tenía, la cita en su calendario (45 min) y guarda su id", async () => {
    const id = await nuevoLead("ana");
    como(e, e.p.ceo);
    const r = await agendarCita(id, e.p.closerA.id, "2026-12-03T10:00", "");
    expect(r).not.toHaveProperty("error");
    expect(r).not.toHaveProperty("aviso");
    expect(ghl.upserts.at(-1)).toMatchObject({ email: `${e.pref}-ana@x.test`, locationId: "loc-test" });
    const c = ghl.citas.at(-1)!;
    expect(c).toMatchObject({ calendarId: "cal-closer-a", locationId: "loc-test", contactId: `contacto-${ghl.upserts.length}`, assignedUserId: "usr-closer-a", appointmentStatus: "confirmed" });
    expect(new Date(String(c.endTime)).getTime() - new Date(String(c.startTime)).getTime()).toBe(45 * 60_000);
    expect((await citaDe(id)).ghl_cita_id).toBe(`cita-ghl-${ghl.citas.length}`);
    expect((await db.from("leads").select("ghl_contact_id").eq("id", id).single()).data!.ghl_contact_id).toBe(`contacto-${ghl.upserts.length}`);
  });
  it("si el lead ya tiene contacto en GHL, no lo vuelve a crear", async () => {
    const id = await nuevoLead("beto", { ghl_contact_id: "contacto-ya" });
    const antes = ghl.upserts.length;
    como(e, e.p.ceo);
    await agendarCita(id, e.p.closerA.id, "2026-12-04T10:00", "");
    expect(ghl.upserts.length).toBe(antes);
    expect(ghl.citas.at(-1)).toMatchObject({ contactId: "contacto-ya" });
  });
  it("closer sin calendario: la cita se queda en la app, sin id de GHL, y se avisa", async () => {
    const id = await nuevoLead("carla");
    const antes = ghl.citas.length;
    como(e, e.p.ceo);
    const r = await agendarCita(id, e.p.closerB.id, "2026-12-05T10:00", "");
    expect(r).toMatchObject({ aviso: expect.stringMatching(/calendario de GHL/) });
    expect(ghl.citas.length).toBe(antes);
    expect(await citaDe(id)).toMatchObject({ ghl_cita_id: null, closer_id: e.p.closerB.id });
    expect((await notas(id)).some((n) => /calendario de GHL/.test(n))).toBe(true);
  });
  it("si GHL falla: la cita se queda, el lead queda agendado y se avisa (con el permiso que falta)", async () => {
    const id = await nuevoLead("dani");
    ghl.falla = true;
    como(e, e.p.ceo);
    const r = await agendarCita(id, e.p.closerA.id, "2026-12-06T10:00", "");
    expect(r).toMatchObject({ aviso: expect.stringMatching(/GHL/) });
    expect((await citaDe(id)).ghl_cita_id).toBeNull();
    expect((await db.from("leads").select("estado_caller").eq("id", id).single()).data!.estado_caller).toBe("agendado");
  });
});
