// D1 (plan GHL 4.3, Cristian 8 nov 2026): unir_leads(proyecto, queda, sobra). Todo o nada; se queda el más antiguo
// y todo lo del otro pasa a él (las 14 tablas que apuntan a un lead). En un choque de «no repetir», lo del antiguo.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";

// Las 14 tablas con lead_id (grep -rn "references public.leads" supabase/migrations)
const TABLAS = [
  "actividades", "citas", "ventas", "clientes", "seguimientos_cliente", "guion_marcas", "cualificaciones", "tarjetas_extra",
  "workflow_ejecuciones", "webhook_eventos", "llamadas_ghl", "grabaciones_caller", "analisis_llamadas", "vencimientos",
] as const;

let e: Escenario;
let viejo: string;
let nuevo: string;
let pid: string;
const ids: Record<string, string> = {};

const cuenta = async (tabla: string, leadId: string) => (await db.from(tabla).select("lead_id", { count: "exact", head: true }).eq("lead_id", leadId)).count;
const unir = (queda: string, sobra: string, proyecto = pid) => db.rpc("unir_leads", { p_proyecto: proyecto, p_queda: queda, p_sobra: sobra });
async function insertar(tabla: string, fila: Record<string, unknown>) {
  const { data, error } = await db.from(tabla).insert(fila).select().single();
  if (error) throw new Error(`${tabla}: ${error.message}`);
  return data as { id: string };
}

beforeAll(async () => {
  e = await crearEscenario();
  pid = e.proyecto.id;
  const fecha = "2026-11-20T10:00:00Z";
  viejo = (await insertar("leads", {
    proyecto_id: pid, nombre: "Viejo", ghl_contact_id: `${e.pref}-c-viejo`, etiquetas: ["a", "b"],
    respuestas: [{ pregunta: "p1", respuesta: "r1" }], seguimiento: { utm_source: "ig" }, creado_en: "2026-01-01T00:00:00Z",
  })).id;
  nuevo = (await insertar("leads", {
    proyecto_id: pid, nombre: "Nuevo", email: `${e.pref}-dup@x.test`, telefono: "+34 600 000 001", ghl_contact_id: `${e.pref}-c-nuevo`,
    etiquetas: ["b", "c"], respuestas: [{ pregunta: "p1", respuesta: "r1" }, { pregunta: "p2", respuesta: "r2" }],
    seguimiento: { utm_source: "yt", utm_campaign: "x" }, creado_en: "2026-02-01T00:00:00Z",
  })).id;

  // Filas del que sobra en las 14 tablas, más los choques de «no repetir» con el que queda
  const [p2] = (await db.from("pipelines").insert({ proyecto_id: pid, nombre: "Otro", orden: 1 }).select()).data!;
  const wf = await insertar("workflows", { proyecto_id: pid, nombre: "wf", disparador: { tipo: "entrada" } });
  // La misma cita en 2 leads repetidos llega de GHL (las de la app no pueden repetir closer y hora: citas_closer_hora_unica)
  // Cerradas: así no entra la regla de «una sola cita abierta» (Fase 3, test propio abajo)
  ids.citaViejo = (await insertar("citas", { proyecto_id: pid, lead_id: viejo, closer_id: e.p.closerA.id, fecha, origen: "ghl", estado: "cerrada" })).id;
  ids.citaDoble = (await insertar("citas", { proyecto_id: pid, lead_id: nuevo, closer_id: e.p.closerA.id, fecha, origen: "ghl", estado: "cerrada" })).id;
  ids.citaOtra = (await insertar("citas", { proyecto_id: pid, lead_id: nuevo, closer_id: e.p.closerA.id, fecha: "2026-11-21T10:00:00Z" })).id;
  ids.venta = (await insertar("ventas", { proyecto_id: pid, lead_id: nuevo, vendedor_id: e.p.closerA.id, facturacion: 1997, cash_collected: 500, tipo_pago: "reserva" })).id;
  await insertar("pagos", { venta_id: ids.venta, importe: 500 });
  await insertar("vencimientos", { proyecto_id: pid, venta_id: ids.venta, lead_id: nuevo, importe: 1497, vence_el: "2026-12-01" });
  await insertar("actividades", { proyecto_id: pid, lead_id: nuevo, tipo: "nota", nota: "hola" });
  await db.from("clientes").insert([{ proyecto_id: pid, lead_id: viejo, estado: "activo" }, { proyecto_id: pid, lead_id: nuevo, estado: "pausado" }]);
  await insertar("seguimientos_cliente", { proyecto_id: pid, lead_id: nuevo, nota: "seguir" });
  await insertar("guion_marcas", { proyecto_id: pid, lead_id: nuevo, rol: "caller" });
  await db.from("cualificaciones").insert([{ proyecto_id: pid, lead_id: viejo, campos: { de: "viejo" } }, { proyecto_id: pid, lead_id: nuevo, campos: { de: "nuevo" } }]);
  ids.tarjetaViejo = (await insertar("tarjetas_extra", { proyecto_id: pid, lead_id: viejo, pipeline_id: p2.id })).id;
  await insertar("tarjetas_extra", { proyecto_id: pid, lead_id: nuevo, pipeline_id: p2.id });
  await insertar("workflow_ejecuciones", { workflow_id: wf.id, version: 1, pasos: [], proyecto_id: pid, lead_id: nuevo, siguiente_en: new Date().toISOString() });
  await insertar("webhook_eventos", { proyecto_id: pid, lead_id: nuevo, payload: {} });
  await insertar("llamadas_ghl", { proyecto_id: pid, lead_id: nuevo, ghl_message_id: `${e.pref}-m1` });
  await insertar("grabaciones_caller", { proyecto_id: pid, lead_id: nuevo, archivo_path: `${e.pref}/a.webm` });
  const grab = await insertar("grabaciones", { proyecto_id: pid, recording_id: 1, cita_id: ids.citaDoble });
  ids.analisis = (await insertar("analisis_llamadas", { proyecto_id: pid, grabacion_id: grab.id, cita_id: ids.citaDoble, lead_id: nuevo })).id;
  ids.grabacion = grab.id;
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("unir_leads", () => {
  it("si algo falla, no cambia nada", async () => {
    expect((await unir(nuevo, viejo)).error?.message).toMatch(/más antiguo/);
    expect((await unir(viejo, viejo)).error).not.toBeNull();
    expect((await unir(viejo, nuevo, "00000000-0000-0000-0000-000000000000")).error).not.toBeNull();
    for (const t of TABLAS) expect(await cuenta(t, nuevo), t).toBeGreaterThan(0);
    expect((await db.from("leads").select("id").eq("id", nuevo)).data).toHaveLength(1);
  });

  it("todo pasa al más antiguo: ninguna fila apunta al borrado y no se pierde ninguna venta", async () => {
    const { data, error } = await unir(viejo, nuevo);
    expect(error).toBeNull();
    // el contacto de GHL que sobra (la app lo borra en GHL) y queda apuntando al que se queda
    expect(data).toEqual({ ghl_sobra: `${e.pref}-c-nuevo`, ghl_citas_sobran: [], citas_juntadas: 0, cita_en_sobra: false });
    expect((await db.from("ghl_contactos_unidos").select("lead_id").eq("proyecto_id", pid).eq("contact_id", `${e.pref}-c-nuevo`)).data).toEqual([{ lead_id: viejo }]);

    expect((await db.from("leads").select("id").eq("id", nuevo)).data).toEqual([]);
    for (const t of TABLAS) expect(await cuenta(t, nuevo), t).toBe(0);
    expect((await db.from("ventas").select("id").eq("lead_id", viejo)).data).toEqual([{ id: ids.venta }]);
    expect((await db.from("pagos").select("importe").eq("venta_id", ids.venta)).data).toEqual([{ importe: 500 }]);
    for (const t of ["actividades", "seguimientos_cliente", "guion_marcas", "workflow_ejecuciones", "webhook_eventos", "llamadas_ghl", "grabaciones_caller", "analisis_llamadas", "vencimientos"]) {
      expect(await cuenta(t, viejo), t).toBe(1);
    }

    // Choques: se queda la fila del más antiguo
    expect((await db.from("clientes").select("estado").eq("lead_id", viejo)).data).toEqual([{ estado: "activo" }]);
    expect((await db.from("cualificaciones").select("campos").eq("lead_id", viejo)).data).toEqual([{ campos: { de: "viejo" } }]);
    expect((await db.from("tarjetas_extra").select("id").eq("lead_id", viejo)).data).toEqual([{ id: ids.tarjetaViejo }]);
    const citas = (await db.from("citas").select("id").eq("lead_id", viejo)).data!.map((c) => c.id).sort();
    expect(citas).toEqual([ids.citaViejo, ids.citaOtra].sort());
    // Lo que apuntaba a la cita repetida pasa a la del antiguo
    expect((await db.from("analisis_llamadas").select("cita_id").eq("id", ids.analisis).single()).data!.cita_id).toBe(ids.citaViejo);
    expect((await db.from("grabaciones").select("cita_id").eq("id", ids.grabacion).single()).data!.cita_id).toBe(ids.citaViejo);

    // La ficha: se juntan etiquetas, respuestas y seguimiento; lo vacío del antiguo se rellena; su contacto de GHL se guarda
    const { data: l } = await db.from("leads").select("nombre, email, telefono, ghl_contact_id, etiquetas, respuestas, seguimiento").eq("id", viejo).single();
    expect(l).toEqual({
      nombre: "Viejo", email: `${e.pref}-dup@x.test`, telefono: "+34 600 000 001", ghl_contact_id: `${e.pref}-c-viejo`,
      etiquetas: ["a", "b", "c"],
      respuestas: [{ pregunta: "p1", respuesta: "r1" }, { pregunta: "p2", respuesta: "r2" }],
      seguimiento: { utm_source: "ig", utm_campaign: "x" },
    });
  });

  it("si el antiguo no tiene contacto de GHL, se queda el del otro y no sobra ninguno", async () => {
    const a = (await insertar("leads", { proyecto_id: pid, nombre: "A", creado_en: "2026-01-01T00:00:00Z" })).id;
    const b = (await insertar("leads", { proyecto_id: pid, nombre: "B", ghl_contact_id: `${e.pref}-c-b`, creado_en: "2026-03-01T00:00:00Z" })).id;
    const { data, error } = await unir(a, b);
    expect(error).toBeNull();
    expect(data.ghl_sobra).toBeNull();
    expect((await db.from("leads").select("ghl_contact_id").eq("id", a).single()).data!.ghl_contact_id).toBe(`${e.pref}-c-b`);
  });
  it("las etiquetas se juntan sin distinguir mayúsculas y la tarjeta extra del pipeline donde acaba el lead se borra (1.7, 9 nov)", async () => {
    const [p3] = (await db.from("pipelines").insert({ proyecto_id: pid, nombre: "Tercero", orden: 2 }).select()).data!;
    const a = (await insertar("leads", { proyecto_id: pid, nombre: "A2", etiquetas: ["Agenda"], creado_en: "2026-01-01T00:00:00Z" })).id;
    const b = (await insertar("leads", { proyecto_id: pid, nombre: "B2", etiquetas: ["agenda", "vip"], pipeline_id: p3.id, creado_en: "2026-03-01T00:00:00Z" })).id;
    await insertar("tarjetas_extra", { proyecto_id: pid, lead_id: a, pipeline_id: p3.id });
    expect((await unir(a, b)).error).toBeNull();
    const l = (await db.from("leads").select("etiquetas, pipeline_id").eq("id", a).single()).data!;
    expect(l).toEqual({ etiquetas: ["Agenda", "vip"], pipeline_id: p3.id });
    expect(await cuenta("tarjetas_extra", a)).toBe(0);
  });

  it("Fase 3: con citas abiertas en los dos queda una sola, la última (su hora y su closer), y devuelve el evento de GHL que sobra", async () => {
    const a = (await insertar("leads", { proyecto_id: pid, nombre: "A3", ghl_contact_id: `${e.pref}-c-a3`, creado_en: "2026-01-01T00:00:00Z" })).id;
    const b = (await insertar("leads", { proyecto_id: pid, nombre: "B3", ghl_contact_id: `${e.pref}-c-b3`, creado_en: "2026-03-01T00:00:00Z" })).id;
    // El caller agendó a mano para A; después B reservó por el link a otra hora y con otro closer
    const primera = await insertar("citas", { proyecto_id: pid, lead_id: a, closer_id: e.p.closerA.id, agendada_por: e.p.callerA.id, fecha: "2026-11-25T10:00:00Z", ghl_cita_id: `${e.pref}-g-a3`, origen: "manual", creado_en: "2026-11-14T09:00:00Z" });
    const ultima = await insertar("citas", { proyecto_id: pid, lead_id: b, closer_id: e.p.closerB.id, fecha: "2026-11-26T18:00:00Z", ghl_cita_id: `${e.pref}-g-b3`, origen: "ghl", creado_en: "2026-11-14T12:00:00Z" });
    const grab = await insertar("grabaciones", { proyecto_id: pid, recording_id: 3, cita_id: primera.id });

    const { data, error } = await unir(a, b);
    expect(error).toBeNull();
    expect(data).toEqual({ ghl_sobra: `${e.pref}-c-b3`, ghl_citas_sobran: [`${e.pref}-g-a3`], citas_juntadas: 1, cita_en_sobra: true });
    const { data: citas } = await db.from("citas").select("id, fecha, closer_id, agendada_por, ghl_cita_id, creado_en").eq("lead_id", a);
    expect(citas).toHaveLength(1);
    expect(citas![0]).toMatchObject({ id: ultima.id, closer_id: e.p.closerB.id, agendada_por: e.p.callerA.id, ghl_cita_id: `${e.pref}-g-b3` });
    expect(new Date(citas![0].fecha).toISOString()).toBe("2026-11-26T18:00:00.000Z");
    expect(new Date(citas![0].creado_en).toISOString()).toBe("2026-11-14T09:00:00.000Z"); // cuenta desde la primera agenda
    expect((await db.from("grabaciones").select("cita_id").eq("id", grab.id).single()).data!.cita_id).toBe(ultima.id);
  });

  it("Fase 3: un contacto ya unido al que sobra pasa al que se queda (uniones en cadena)", async () => {
    const a = (await insertar("leads", { proyecto_id: pid, nombre: "A4", ghl_contact_id: `${e.pref}-c-a4`, creado_en: "2026-01-01T00:00:00Z" })).id;
    const b = (await insertar("leads", { proyecto_id: pid, nombre: "B4", ghl_contact_id: `${e.pref}-c-b4`, creado_en: "2026-02-01T00:00:00Z" })).id;
    const c = (await insertar("leads", { proyecto_id: pid, nombre: "C4", ghl_contact_id: `${e.pref}-c-c4`, creado_en: "2026-03-01T00:00:00Z" })).id;
    expect((await unir(b, c)).error).toBeNull();
    expect((await unir(a, b)).error).toBeNull();
    const { data } = await db.from("ghl_contactos_unidos").select("contact_id, lead_id").eq("proyecto_id", pid).in("contact_id", [`${e.pref}-c-b4`, `${e.pref}-c-c4`]).order("contact_id");
    expect(data).toEqual([{ contact_id: `${e.pref}-c-b4`, lead_id: a }, { contact_id: `${e.pref}-c-c4`, lead_id: a }]);
  });
});
