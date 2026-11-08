// Plan GHL, A2: limpiar_payload_envios() vacía el cuerpo de los envíos «ok» de más de 12 meses,
// salvo si ese lead tiene otro envío a la misma Entrada en los últimos 12 meses.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, borrarEscenario, db, type Escenario } from "../apoyo/escenario";

let e: Escenario;
const CUERPO = { dato: "x" };
const meses = (n: number) => new Date(Date.now() - n * 30 * 24 * 3600 * 1000).toISOString();

beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

async function lead(nombre: string) {
  const { data } = await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre, email: `${e.pref}-${nombre}@x.test` }).select("id").single();
  return data!.id as string;
}
async function envio(entradaId: string | null, leadId: string | null, hace: number, ghl_estado: string | null) {
  const { data, error } = await db
    .from("webhook_eventos")
    .insert({ proyecto_id: e.proyecto.id, entrada_id: entradaId, lead_id: leadId, payload: CUERPO, ghl_estado, recibido_en: meses(hace) })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}
const payloadDe = async (id: string) => (await db.from("webhook_eventos").select("payload").eq("id", id).single()).data!.payload;

describe("limpiar_payload_envios", () => {
  it("vacía el «ok» viejo sin envíos recientes y deja todo lo demás igual", async () => {
    const { data: ent } = await db.from("entradas").insert({ proyecto_id: e.proyecto.id, nombre: "Retención" }).select("id").single();
    const [a, b, c, d] = await Promise.all(["sinrecientes", "conreciente", "soloerror", "sinestado"].map(lead));

    const viejoSolo = await envio(ent!.id, a, 14, "ok");
    const viejoConReciente = await envio(ent!.id, b, 14, "ok");
    const reciente = await envio(ent!.id, b, 1, "ok");
    const sinLead = await envio(ent!.id, null, 14, "ok");
    const sinEntrada = await envio(null, a, 14, "ok");
    const errorViejo = await envio(ent!.id, c, 14, "error");
    const nuloViejo = await envio(ent!.id, d, 14, null);

    const { error } = await db.rpc("limpiar_payload_envios");
    expect(error).toBeNull();

    expect(await payloadDe(viejoSolo)).toEqual({});
    for (const id of [viejoConReciente, reciente, errorViejo, nuloViejo, sinLead, sinEntrada]) expect(await payloadDe(id)).toEqual(CUERPO);
  });

  it("solo la puede llamar service_role", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    expect((await anon.rpc("limpiar_payload_envios")).error).not.toBeNull();
  });
});
