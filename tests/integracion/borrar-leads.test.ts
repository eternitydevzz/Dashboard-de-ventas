// Ola 6 · C6: borrar_leads(proyecto, ids) borra en un solo paso los leads sin citas ni ventas (todo o nada)
// y devuelve cuántos borró. Un lead con venta o cita no se toca; tampoco los de otro proyecto.
// Y una cita cerrada no vuelve a otro estado con cambiarEstadoCita.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, falla, type Escenario } from "../apoyo/escenario";
import { cambiarEstadoCita } from "@/app/(panel)/closer/acciones";

let e: Escenario;
let pid: string;
const ids: Record<string, string> = {};

async function lead(nombre: string, proyecto = pid) {
  const { data, error } = await db.from("leads").insert({ proyecto_id: proyecto, nombre }).select("id").single();
  if (error) throw new Error(`leads: ${error.message}`);
  return data.id as string;
}
const existe = async (id: string) => (await db.from("leads").select("id", { count: "exact", head: true }).eq("id", id)).count === 1;
const borrar = (lista: string[]) => db.rpc("borrar_leads", { p_proyecto: pid, p_ids: lista });

beforeAll(async () => {
  e = await crearEscenario();
  pid = e.proyecto.id;
  ids.libre1 = await lead("Libre uno");
  ids.libre2 = await lead("Libre dos");
  ids.conVenta = await lead("Con venta");
  ids.conCita = await lead("Con cita");
  ids.venta = (await db.from("ventas").insert({ proyecto_id: pid, lead_id: ids.conVenta, vendedor_id: e.p.closerA.id, facturacion: 1997, cash_collected: 500, tipo_pago: "reserva" }).select("id").single()).data!.id;
  ids.cita = (await db.from("citas").insert({ proyecto_id: pid, lead_id: ids.conCita, closer_id: e.p.closerA.id, fecha: "2026-11-20T10:00:00Z" }).select("id").single()).data!.id;
  // Un lead de otro proyecto (el escenario borra lo suyo; este se borra a mano al final)
  const { data: otro } = await db.from("proyectos").insert({ nombre: `TEST-AUTO ${e.pref}-otro` }).select("id").single();
  ids.otroProyecto = otro!.id;
  ids.ajeno = await lead("Ajeno", otro!.id);
});
afterAll(async () => {
  if (ids.otroProyecto) await db.from("proyectos").delete().eq("id", ids.otroProyecto);
  if (e) await borrarEscenario(e);
});

describe("borrar_leads", () => {
  it("si algo falla, no borra nada (un id que no es uuid corta la llamada entera)", async () => {
    const { error } = await borrar([ids.libre1, "no-es-uuid"]);
    expect(error).not.toBeNull();
    expect(await existe(ids.libre1)).toBe(true);
  });

  it("borra solo los libres de este proyecto; el de la venta, el de la cita y el ajeno se quedan", async () => {
    const { data, error } = await borrar([ids.libre1, ids.libre2, ids.conVenta, ids.conCita, ids.ajeno]);
    expect(error).toBeNull();
    expect(data).toBe(2);
    expect(await existe(ids.libre1)).toBe(false);
    expect(await existe(ids.libre2)).toBe(false);
    expect(await existe(ids.conVenta)).toBe(true);
    expect(await existe(ids.conCita)).toBe(true);
    expect(await existe(ids.ajeno)).toBe(true);
    // La venta sigue (no se borró en cascada)
    expect((await db.from("ventas").select("id").eq("id", ids.venta)).data).toHaveLength(1);
  });

  it("solo la llama el servidor (service_role)", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { error } = await anon.rpc("borrar_leads", { p_proyecto: pid, p_ids: [ids.conVenta] });
    expect(error).not.toBeNull();
    expect(await existe(ids.conVenta)).toBe(true);
  });
});

describe("cita cerrada", () => {
  it("no vuelve a «pendiente»: avisa y sigue cerrada", async () => {
    await db.from("citas").update({ estado: "cerrada" }).eq("id", ids.cita);
    como(e, e.p.ceo);
    await falla(cambiarEstadoCita(ids.cita, "pendiente", ""), /acaba de cambiar/);
    expect((await db.from("citas").select("estado").eq("id", ids.cita).single()).data!.estado).toBe("cerrada");
  });
});
