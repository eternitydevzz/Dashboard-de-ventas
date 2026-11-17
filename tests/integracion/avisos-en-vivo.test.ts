// Velocidad (17 oct 2026), tiempo real: los avisos de la base no rompen ninguna escritura y el canal solo
// lo puede escuchar quien tiene sesión y es del proyecto.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { borrarEscenario, crearEscenario, db, PASSWORD, type Escenario } from "../apoyo/escenario";

let e: Escenario;
const URL_DB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLICA = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

// Un navegador con la sesión de esta persona (como lo hacía avisos-en-vivo.tsx, borrado el 17 nov)
async function navegadorDe(email: string) {
  const c = createClient(URL_DB, PUBLICA, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  expect(error).toBeNull();
  return c;
}

describe("Avisos en vivo", () => {
  it("insertar, cambiar (también sin cambios), mover en bloque y borrar leads sigue funcionando", async () => {
    const { data: nuevo, error } = await db.from("leads").insert({ proyecto_id: e.proyecto.id, nombre: "Aviso", email: `${e.pref}-aviso@x.test`, pipeline_id: e.pipeline.id, etapa_id: e.etapas.Nuevos }).select("id").single();
    expect(error).toBeNull();
    expect((await db.from("leads").update({ nombre: "Aviso 2" }).eq("id", nuevo!.id)).error).toBeNull();
    expect((await db.from("leads").update({ nombre: "Aviso 2" }).eq("id", nuevo!.id)).error).toBeNull(); // nada cambia
    expect((await db.from("leads").update({ etiquetas: ["x"] }).eq("proyecto_id", e.proyecto.id)).error).toBeNull(); // en bloque
    expect((await db.from("leads").delete().eq("id", nuevo!.id)).error).toBeNull();
    const { data } = await db.from("leads").select("id").eq("id", nuevo!.id);
    expect(data).toEqual([]);
  });

  it("el canal del proyecto: sí para un miembro, no para otro proyecto ni sin sesión", async () => {
    const miembro = await navegadorDe(e.p.callerA.email);
    expect((await miembro.rpc("puede_oir_canal", { p_topic: `proyecto:${e.proyecto.id}` })).data).toBe(true);
    expect((await miembro.rpc("puede_oir_canal", { p_topic: "proyecto:00000000-0000-0000-0000-000000000000" })).data).toBe(false);
    expect((await miembro.rpc("puede_oir_canal", { p_topic: "otra-cosa" })).data).toBe(false);
    const anon = createClient(URL_DB, PUBLICA, { auth: { persistSession: false } });
    const { data, error } = await anon.rpc("puede_oir_canal", { p_topic: `proyecto:${e.proyecto.id}` });
    expect(data === true).toBe(false);
    expect(error || data === false).toBeTruthy();
  });

  it("la función que manda los avisos no la puede llamar un navegador", async () => {
    const miembro = await navegadorDe(e.p.callerA.email);
    const { error } = await miembro.rpc("avisar_cambio", { p_proyectos: [e.proyecto.id], p_tabla: "leads" });
    expect(error).not.toBeNull();
  });
});
