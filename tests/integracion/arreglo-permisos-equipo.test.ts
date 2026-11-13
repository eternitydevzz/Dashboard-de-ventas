// Arreglo 2 de la auditoría (decisiones de Cristian, 10 oct 2026): aunque se abra Equipo, Programas
// o Finanzas a otros roles, cada uno solo da accesos de su rol o inferior, solo el CEO y el director
// cambian comisiones (nunca la suya ni la de su rol, salvo el CEO) y nadie paga su propia liquidación.
// Paso H5 (Cristian, 10 oct 2026): Equipo y Finanzas NUNCA a callers ni closers, aunque se abran por rol.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, falla, ok, type Escenario } from "../apoyo/escenario";
import { cargarEquipo } from "@/lib/equipo";
import { actualizarMiembroEquipo, crearMiembro, darAccesoMiembro, guardarComisionRol } from "@/app/(panel)/equipo/acciones";
import { guardarPrograma, type DatosPrograma } from "@/app/(panel)/programas/acciones";
import { desmarcarLiquidacion, pagarLiquidacion } from "@/app/(panel)/finanzas/acciones";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
  await cargarEquipo(e.proyecto.id); // prepara áreas, comisiones de rol y miembros
  // Se abren las 3 secciones a directores y closers (el peor caso que describe la auditoría)
  await db.from("permisos_seccion").insert(
    ["director", "closer"].flatMap((rol) => ["equipo", "programas", "finanzas"].map((seccion) => ({ proyecto_id: e.proyecto.id, rol, seccion, permitido: true })))
  );
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

const sinAcceso = { modo: "organigrama" } as const;
const miembroDe = async (perfilId: string) => (await cargarEquipo(e.proyecto.id)).miembros.find((m) => m.perfil_id === perfilId)!;
const datosMiembro = (m: Awaited<ReturnType<typeof miembroDe>>, comision: { pct_venta: number } | null) => ({ nombre: m.nombre, area_id: m.area_id, puesto_id: m.puesto_id, lider: m.lider, activo: m.activo, comision });

describe("Accesos: solo con tu rol o uno inferior", () => {
  it("un closer no entra en Equipo aunque se abra a su rol (H5); el director da accesos de su rol o inferior", async () => {
    const alta = (rol: "director" | "closer" | "caller", n: string) =>
      crearMiembro({ nombres: [n], area_id: null, puesto_id: null, comision: null, acceso: { modo: "crear", email: `${e.pref}-${n}@eternity.test`, password: "Clave-temporal-1", rol, mercado: "latam", telefono: "+54 11 0000 0000" }, lider: false });
    como(e, e.p.closerA);
    await falla(alta("director", "dir1"), /No tienes acceso a esta sección/);
    await falla(alta("caller", "cal0"), /No tienes acceso a esta sección/);
    expect((await db.from("perfiles").select("id").eq("email", `${e.pref}-dir1@eternity.test`)).data).toHaveLength(0);
    como(e, e.p.director); // B2 (13 nov): con Equipo pero sin Administración, no crea cuentas
    await falla(alta("caller", "cal2"), /Administración/);
    como(e, e.p.directorAdmin);
    await ok(alta("closer", "clo1"));
    await ok(alta("caller", "cal1"));
  });
  it("dar acceso después sigue la misma regla", async () => {
    como(e, e.p.ceo);
    await ok(crearMiembro({ nombres: ["Sin cuenta"], area_id: null, puesto_id: null, comision: null, acceso: sinAcceso, lider: false }));
    const { data: m } = await db.from("miembros_equipo").select("id").eq("proyecto_id", e.proyecto.id).eq("nombre", "Sin cuenta").single();
    como(e, e.p.closerA);
    await falla(darAccesoMiembro(m!.id, `${e.pref}-sc@eternity.test`, "Clave-temporal-1", "director", "es", "+34 600 000 000"), /No tienes acceso a esta sección/);
    como(e, e.p.director);
    await falla(darAccesoMiembro(m!.id, `${e.pref}-sc@eternity.test`, "Clave-temporal-1", "caller", "es", "+34 600 000 000"), /Administración/);
    como(e, e.p.directorAdmin);
    await ok(darAccesoMiembro(m!.id, `${e.pref}-sc@eternity.test`, "Clave-temporal-1", "director", "es", "+34 600 000 000")); // igual a su rol: sí
  });
});

describe("Comisiones: solo CEO y director, y nunca la propia", () => {
  it("comisión de un rol: el closer no puede; el director no la de su rol; el CEO todas", async () => {
    como(e, e.p.closerA);
    await falla(guardarComisionRol("caller", "50", "3"), /No tienes acceso a esta sección/);
    await falla(guardarComisionRol("closer", "50", ""), /No tienes acceso a esta sección/);
    como(e, e.p.director);
    await falla(guardarComisionRol("director", "50", ""), /tu propio rol/);
    await ok(guardarComisionRol("closer", "9", ""));
    como(e, e.p.ceo);
    await ok(guardarComisionRol("director", "2", ""));
    await ok(guardarComisionRol("ceo", "1", "")); // el CEO queda fuera de la regla
    expect((await cargarEquipo(e.proyecto.id)).comisionesRol.director.pct_venta).toBe(2);
  });
  it("comisión de una persona: nadie la suya (salvo el CEO); el closer ninguna; el director la de otros", async () => {
    const yo = await miembroDe(e.p.director.id);
    const closer = await miembroDe(e.p.closerA.id);
    como(e, e.p.director);
    await falla(actualizarMiembroEquipo(yo.id, datosMiembro(yo, { pct_venta: 40 })), /tu propia comisión/);
    await ok(actualizarMiembroEquipo(yo.id, { ...datosMiembro(yo, null), nombre: `${yo.nombre} (editado)` })); // otros datos suyos: sí
    await ok(actualizarMiembroEquipo(closer.id, datosMiembro(closer, { pct_venta: 12 })));
    como(e, e.p.closerA); // H5: sin Equipo, nada
    await falla(actualizarMiembroEquipo(closer.id, datosMiembro(closer, { pct_venta: 30 })), /No tienes acceso a esta sección/);
    await falla(actualizarMiembroEquipo(closer.id, { ...datosMiembro(closer, { pct_venta: 12 }), lider: true }), /No tienes acceso a esta sección/);
    await falla(crearMiembro({ nombres: ["Con comisión"], area_id: null, puesto_id: null, comision: { pct_venta: 5 }, acceso: sinAcceso, lider: false }), /No tienes acceso a esta sección/);
    const ceo = await miembroDe(e.p.ceo.id);
    como(e, e.p.ceo);
    await ok(actualizarMiembroEquipo(ceo.id, datosMiembro(ceo, { pct_venta: 5 })));
    expect((await db.from("miembros_equipo").select("comision").eq("id", closer.id).single()).data!.comision).toMatchObject({ pct_venta: 12 });
  });
  it("Programas: las comisiones por rol siguen la misma regla; el resto del programa no", async () => {
    const programa = (comisiones: Record<string, string>, id: string | null = null, nombre = "Programa arreglo 2"): DatosPrograma => ({ id, nombre, descripcion: "", categoria: "", color: "#7c3aed", activo: true, backend_offer: false, vende_caller: false, modo_pago: "unico", num_cuotas: null, precio: "100", precios_divisa: {}, comisiones, link_pago: "" });
    como(e, e.p.closerA); // H5: a un closer, Programas es solo para mirar
    await falla(guardarPrograma(programa({ caller: "5" })), /solo para mirar/);
    await falla(guardarPrograma(programa({})), /solo para mirar/);
    como(e, e.p.director);
    await ok(guardarPrograma(programa({}))); // sin comisiones
    const { data: p } = await db.from("productos").select("id").eq("proyecto_id", e.proyecto.id).eq("nombre", "Programa arreglo 2").single();
    await falla(guardarPrograma(programa({ director: "20" }, p!.id)), /tu propio rol/);
    await ok(guardarPrograma(programa({ closer: "15", caller_agenda: "4" }, p!.id)));
    await ok(guardarPrograma(programa({ closer: "15", caller_agenda: "4" }, p!.id, "Programa arreglo 2 bis"))); // cambia el nombre, no las comisiones
    como(e, e.p.closerA);
    await falla(guardarPrograma(programa({ closer: "15", caller_agenda: "4" }, p!.id, "Otro nombre")), /solo para mirar/);
  });
});

describe("Liquidaciones: nadie paga ni desmarca la suya (salvo el CEO)", () => {
  it("el director no paga la suya pero sí la de otro; el CEO sí la suya", async () => {
    const liq = async (perfilId: string) =>
      (await db.from("liquidaciones").insert({ proyecto_id: e.proyecto.id, perfil_id: perfilId, mes: "2026-09", comision_cobrado: 0 }).select("id").single()).data!.id as string;
    const delDirector = await liq(e.p.director.id);
    const delCloser = await liq(e.p.closerA.id);
    const delCeo = await liq(e.p.ceo.id);
    como(e, e.p.director);
    await falla(pagarLiquidacion(delDirector, null), /tu propia liquidación/);
    await ok(pagarLiquidacion(delCloser, null));
    como(e, e.p.closerA); // H5: sin Finanzas, nada
    await falla(desmarcarLiquidacion(delCloser), /No tienes acceso a esta sección/);
    como(e, e.p.ceo);
    await ok(pagarLiquidacion(delCeo, null));
    await ok(pagarLiquidacion(delDirector, null));
    como(e, e.p.director);
    await falla(desmarcarLiquidacion(delDirector), /tu propia liquidación/);
    const { data } = await db.from("liquidaciones").select("perfil_id, estado").eq("proyecto_id", e.proyecto.id);
    expect(data!.every((l) => l.estado === "pagada")).toBe(true);
  });
});
