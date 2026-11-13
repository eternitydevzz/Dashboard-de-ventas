// 1.0 Bloque 5 (Cristian, 11 oct 2026): ficha completa de cada persona. Más allá de «datos y comisión», solo el CEO y
// los directores con Administración; el email lo cambia el administrador directamente; la marca de prueba, solo el CEO.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { borrarEscenario, como, crearEscenario, db, falla, ok, PASSWORD, type Escenario } from "../apoyo/escenario";
import { cambiarEmailPersona, cargarFicha, guardarContactoPersona, marcarPrueba } from "@/app/(panel)/equipo/ficha-acciones";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("Quién abre la ficha completa", () => {
  it("el CEO y el director con Administración; no un director sin ella ni un caller", async () => {
    como(e, e.p.callerA);
    await falla(cargarFicha(e.p.callerB.id), /permiso/);
    como(e, e.p.director);
    await falla(cargarFicha(e.p.callerB.id), /permiso/);
    como(e, e.p.directorAdmin);
    const f = await ok(cargarFicha(e.p.closerA.id));
    expect(f.persona).toMatchObject({ id: e.p.closerA.id, rol: "closer", es_prueba: false });
    expect(f.pipelines.find((p) => p.nombre === "Pipeline test")).toMatchObject({ propio: null, delRol: "ver", efectivo: "ver" });
    expect(f.calendario.general.duracion).toBe(30);
    await falla(cargarFicha(e.p.ceo.id), /otro CEO/); // un director no toca al CEO
    como(e, e.p.ceo);
    await ok(cargarFicha(e.p.ceo.id));
  });
});

describe("Acceso", () => {
  it("contacto de otra persona", async () => {
    como(e, e.p.directorAdmin);
    await ok(guardarContactoPersona(e.p.callerA.id, { telefono: "+1 555 0101", whatsapp: "" }));
    const { data } = await db.from("perfiles").select("telefono, whatsapp").eq("id", e.p.callerA.id).single();
    expect(data).toEqual({ telefono: "+1 555 0101", whatsapp: null });
  });
  it("cambiar el email: no repetido; luego entra con el nuevo", async () => {
    como(e, e.p.directorAdmin); // B1 (13 nov): el de otra persona, solo el CEO
    await falla(cambiarEmailPersona(e.p.callerA.id, `${e.pref}-otro@eternity.test`), /Solo el CEO/);
    como(e, e.p.ceo);
    await falla(cambiarEmailPersona(e.p.callerA.id, "no-es-email"), /email válido/);
    await falla(cambiarEmailPersona(e.p.callerA.id, e.p.callerB.email), /otra persona/);
    const nuevo = `${e.pref}-nuevo@eternity.test`;
    await ok(cambiarEmailPersona(e.p.callerA.id, nuevo));
    expect((await db.from("perfiles").select("email").eq("id", e.p.callerA.id).single()).data!.email).toBe(nuevo);
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { error } = await anon.auth.signInWithPassword({ email: nuevo, password: PASSWORD });
    expect(error).toBeNull();
  });
  it("la marca «perfil de prueba»: solo el CEO, y no a sí mismo", async () => {
    como(e, e.p.directorAdmin);
    await falla(marcarPrueba(e.p.callerC.id, true), /Solo el CEO/);
    como(e, e.p.ceo);
    await falla(marcarPrueba(e.p.ceo.id, true), /a ti mismo/);
    await ok(marcarPrueba(e.p.callerC.id, true));
    expect((await db.from("perfiles").select("es_prueba").eq("id", e.p.callerC.id).single()).data!.es_prueba).toBe(true);
    await ok(marcarPrueba(e.p.callerC.id, false));
  });
});
