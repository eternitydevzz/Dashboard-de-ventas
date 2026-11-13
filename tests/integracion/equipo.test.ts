// V2-4: equipo, alta en 6 pasos, comisiones. V2-8 (base): solo el CEO ve las secciones de empresa por defecto.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { borrarEscenario, como, crearEscenario, db, falla, ok, type Escenario } from "../apoyo/escenario";
import { cargarEquipo } from "@/lib/equipo";
import { puedeSeccion } from "@/lib/permisos";
import { actualizarMiembroEquipo, borrarArea, crearMiembro, darAccesoMiembro, guardarArea, guardarComisionRol } from "@/app/(panel)/equipo/acciones";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("Equipo", () => {
  it("la primera vez prepara 4 áreas, las comisiones de cada rol (caller 3 % por agenda) y mete a la gente del proyecto", async () => {
    const eq = await cargarEquipo(e.proyecto.id);
    expect(eq.areas.map((a) => a.nombre)).toEqual(["Dirección", "Ventas", "Operaciones", "Producto"]);
    expect(eq.comisionesRol.caller).toEqual({ pct_venta: 0, pct_agenda: 3 });
    expect(eq.miembros).toHaveLength(8);
    expect(eq.miembros.find((m) => m.perfil_id === e.p.ceo.id)!.area_id).toBe(eq.areas[0].id);
    await cargarEquipo(e.proyecto.id); // otra vez: no duplica nada
    expect((await cargarEquipo(e.proyecto.id)).miembros).toHaveLength(8);
  });

  it("por defecto solo el CEO tiene la sección; director, closer y caller no", async () => {
    expect(await puedeSeccion(e.p.ceo, e.proyecto.id, "equipo")).toBe(true);
    for (const p of [e.p.director, e.p.directorAdmin, e.p.closerA, e.p.callerA]) expect(await puedeSeccion(p, e.proyecto.id, "finanzas")).toBe(false);
    como(e, e.p.directorAdmin);
    await falla(guardarComisionRol("closer", "10", ""), /No tienes acceso/);
  });

  it("alta solo en el organigrama, con puesto nuevo y comisión propia por producto", async () => {
    como(e, e.p.ceo);
    const eq = await cargarEquipo(e.proyecto.id);
    const ventas = eq.areas.find((a) => a.nombre === "Ventas")!.id;
    const r = await ok(crearMiembro({ nombres: ["Camila Ríos"], area_id: ventas, puesto_id: null, puesto_nuevo: { nombre: "Closer senior", rol_base: "closer" }, comision: { pct_venta: 10, pct_agenda: null, por_producto: { [e.productos["Mentoría grupal"]]: 12, "00000000-0000-0000-0000-000000000000": 50 } }, acceso: { modo: "organigrama" }, lider: true }));
    expect(r).toEqual({ creados: 1 });
    const { data: m } = await db.from("miembros_equipo").select("*, puestos(nombre, rol_base)").eq("proyecto_id", e.proyecto.id).eq("nombre", "Camila Ríos").single();
    expect(m).toMatchObject({ perfil_id: null, lider: true, area_id: ventas, puestos: { nombre: "Closer senior", rol_base: "closer" } });
    expect(m!.comision).toEqual({ pct_venta: 10, pct_agenda: null, por_producto: { [e.productos["Mentoría grupal"]]: 12 } }); // el producto ajeno se ignora
  });

  it("varios a la vez (sin cuenta) y validaciones", async () => {
    como(e, e.p.ceo);
    expect(await ok(crearMiembro({ nombres: ["Uno", " ", "Dos"], area_id: null, puesto_id: null, comision: null, acceso: { modo: "organigrama" }, lider: false }))).toEqual({ creados: 2 });
    await falla(crearMiembro({ nombres: ["A", "B"], area_id: null, puesto_id: null, comision: null, acceso: { modo: "crear", email: "x@y.z", password: "12345678", rol: "closer", mercado: "es", telefono: "+34 600 000 000" }, lider: false }), /de una en una/);
    await falla(crearMiembro({ nombres: ["A"], area_id: null, puesto_id: null, comision: { pct_venta: 150 }, acceso: { modo: "organigrama" }, lider: false }), /entre 0 y 100/);
  });

  it("alta con acceso: crea el usuario, que puede entrar; un director no puede crear un CEO", async () => {
    como(e, e.p.ceo);
    const email = `${e.pref}-nuevo@eternity.test`;
    await ok(crearMiembro({ nombres: ["Nuevo Closer"], area_id: null, puesto_id: null, comision: null, acceso: { modo: "crear", email, password: "Clave-temporal-1", rol: "closer", mercado: "es", telefono: "+34 600 000 000" }, lider: false }));
    const { data: perfil } = await db.from("perfiles").select("id, rol, telefono").eq("email", email).single();
    expect(perfil).toMatchObject({ rol: "closer", telefono: "+34 600 000 000" });
    expect((await db.from("miembros_proyecto").select("mercado").eq("proyecto_id", e.proyecto.id).eq("perfil_id", perfil!.id)).data).toEqual([{ mercado: "es" }]);
    // País y teléfono son obligatorios al crear cuenta (13 nov)
    const sin = (mercado: string, telefono: string) => crearMiembro({ nombres: ["Sin datos"], area_id: null, puesto_id: null, comision: null, acceso: { modo: "crear", email: `${e.pref}-sin@eternity.test`, password: "Clave-temporal-1", rol: "closer", mercado: mercado as "es", telefono }, lider: false });
    await falla(sin("", "+34 600 000 000"), /España o de Latam/);
    await falla(sin("es", "12"), /teléfono válido/);
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    expect((await anon.auth.signInWithPassword({ email, password: "Clave-temporal-1" })).error).toBeNull();
    // Dar acceso más tarde a alguien del organigrama
    const { data: uno } = await db.from("miembros_equipo").select("id").eq("proyecto_id", e.proyecto.id).eq("nombre", "Uno").single();
    await db.from("permisos_seccion").insert({ proyecto_id: e.proyecto.id, rol: "director", seccion: "equipo", permitido: true });
    como(e, e.p.director);
    await falla(darAccesoMiembro(uno!.id, `${e.pref}-uno@eternity.test`, "Clave-temporal-1", "ceo"), /Rol no válido/);
    await ok(darAccesoMiembro(uno!.id, `${e.pref}-uno@eternity.test`, "Clave-temporal-1", "caller"));
    expect((await db.from("miembros_equipo").select("perfil_id").eq("id", uno!.id).single()).data!.perfil_id).not.toBeNull();
    await falla(darAccesoMiembro(uno!.id, `${e.pref}-uno2@eternity.test`, "Clave-temporal-1", "caller"), /ya tiene acceso/);
  });

  it("editar comisión del rol y de la persona; áreas: crear, no borrar con gente dentro", async () => {
    como(e, e.p.ceo);
    await ok(guardarComisionRol("closer", "8,5", ""));
    await ok(guardarComisionRol("caller", "10", "3"));
    const eq = await cargarEquipo(e.proyecto.id);
    expect(eq.comisionesRol.closer).toEqual({ pct_venta: 8.5, pct_agenda: 0 });
    const camila = eq.miembros.find((m) => m.nombre === "Camila Ríos")!;
    await ok(actualizarMiembroEquipo(camila.id, { nombre: "Camila Ríos", area_id: camila.area_id, puesto_id: camila.puesto_id, lider: false, activo: true, comision: null }));
    expect((await db.from("miembros_equipo").select("comision, lider").eq("id", camila.id).single()).data).toEqual({ comision: null, lider: false });
    await ok(guardarArea(null, "Soporte", "#123456"));
    await falla(borrarArea(camila.area_id!), /tiene personas/);
    const soporte = (await cargarEquipo(e.proyecto.id)).areas.find((a) => a.nombre === "Soporte")!;
    await ok(borrarArea(soporte.id));
  });
});
