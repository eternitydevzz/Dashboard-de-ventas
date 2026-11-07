// V2-8 y Paso H5: permisos por rol (todos los de un rol iguales). Los cambian el CEO y el director con Administración
// (este, nunca los de los directores ni lo que él no tiene). Equipo y Finanzas, nunca a callers ni closers.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, falla, ok, type Escenario } from "../apoyo/escenario";
import { guardarPermisoSeccion } from "@/app/(panel)/admin/acciones";
import { crearMovimiento } from "@/app/(panel)/finanzas/acciones";
import { seccionesPermitidas } from "@/lib/permisos";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});
const gasto = { tipo: "egreso" as const, importe: "10", fecha: "", categoria_id: null, cuenta_id: null, descripcion: "" };

describe("Permisos por sección", () => {
  it("el director con Administración cambia los de callers y closers, nunca los de los directores; el closer, nada", async () => {
    como(e, e.p.directorAdmin);
    await falla(guardarPermisoSeccion("director", "finanzas", true), /solo los cambia el CEO/);
    await falla(guardarPermisoSeccion("closer", "finanzas", true), /no se puede dar/); // nunca a closers
    await falla(guardarPermisoSeccion("caller", "clientes", true), /tú no la tienes/); // no da lo que no tiene
    await ok(guardarPermisoSeccion("caller", "ranking", false));
    expect((await seccionesPermitidas(e.p.callerA, e.proyecto.id)).has("ranking")).toBe(false);
    await ok(guardarPermisoSeccion("caller", "ranking", true));
    como(e, e.p.closerA);
    await falla(guardarPermisoSeccion("closer", "ranking", false), /No tienes permiso/);
  });

  it("abrir Finanzas a los directores: entran todos los directores, no los closers; cerrarla les quita el acceso", async () => {
    como(e, e.p.ceo);
    await falla(guardarPermisoSeccion("director", "inventada", true), /Sección no válida/);
    await falla(guardarPermisoSeccion("ceo" as "director", "finanzas", true), /Rol no válido/);
    await ok(guardarPermisoSeccion("director", "finanzas", true));
    expect((await seccionesPermitidas(e.p.director, e.proyecto.id)).has("finanzas")).toBe(true);
    expect((await seccionesPermitidas(e.p.directorAdmin, e.proyecto.id)).has("finanzas")).toBe(true);
    expect((await seccionesPermitidas(e.p.closerA, e.proyecto.id)).has("finanzas")).toBe(false);
    como(e, e.p.director);
    await ok(crearMovimiento(gasto));
    como(e, e.p.closerA);
    await falla(crearMovimiento(gasto), /No tienes acceso/);

    como(e, e.p.ceo);
    await ok(guardarPermisoSeccion("director", "finanzas", false));
    como(e, e.p.director);
    await falla(crearMovimiento(gasto), /No tienes acceso/);
  });

  it("el CEO lo tiene todo siempre", async () => {
    expect((await seccionesPermitidas(e.p.ceo, e.proyecto.id)).size).toBe(16); // todas las secciones (16 con «Manuales», C9)
  });
});
