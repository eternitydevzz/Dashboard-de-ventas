// Paso H5 (decisiones de Cristian del 10 oct 2026): permisos de todas las secciones, por rol y por persona.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, falla, ok, type Escenario } from "../apoyo/escenario";
import { guardarPermisoPersona, guardarPermisoSeccion } from "@/app/(panel)/admin/acciones";
import { registrarCobro } from "@/app/(panel)/ventas/acciones";
import { cambiarEstadoCliente } from "@/app/(panel)/clientes/acciones";
import { cambiarEstadoCita } from "@/app/(panel)/closer/acciones";
import { clientesSuyos } from "@/app/(panel)/clientes/cargar";
import { calcularPermisos, rutaInicio, seccionesPermitidas, soloLoSuyo } from "@/lib/permisos";

let e: Escenario;
let venta: string;
beforeAll(async () => {
  e = await crearEscenario();
  venta = (await db.from("ventas").insert({ proyecto_id: e.proyecto.id, lead_id: e.leads.LeadA, vendedor_id: e.p.closerA.id, facturacion: 1000, cash_collected: 100, tipo_pago: "reserva" }).select("id").single()).data!.id;
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});
const tiene = async (p: typeof e.p.ceo) => seccionesPermitidas(p, e.proyecto.id);

describe("Regla: manda la persona, luego su rol, luego lo de siempre", () => {
  it("cálculo puro", () => {
    expect(calcularPermisos("caller", [], []).has("cola")).toBe(true); // lo de siempre
    expect(calcularPermisos("caller", [{ seccion: "cola", permitido: false }], []).has("cola")).toBe(false); // el rol lo cierra
    expect(calcularPermisos("caller", [{ seccion: "cola", permitido: false }], [{ seccion: "cola", permitido: true }]).has("cola")).toBe(true); // la persona manda
    expect(calcularPermisos("caller", [], [{ seccion: "finanzas", permitido: true }]).has("finanzas")).toBe(false); // nunca
    expect(calcularPermisos("director", [], [{ seccion: "mi_funnel", permitido: true }]).has("mi_funnel")).toBe(false); // no aplica
    expect(calcularPermisos("ceo", [{ seccion: "funnel", permitido: false }], []).size).toBe(16); // el CEO, siempre todo (16 con «Manuales», C9)
  });
});

describe("Ficha de una persona", () => {
  it("el CEO le quita «Ventas» a un closer: deja de verla y sus botones dejan de funcionar; «como su rol» lo devuelve", async () => {
    como(e, e.p.ceo);
    await ok(guardarPermisoPersona(e.p.closerA.id, "ventas", false));
    expect((await tiene(e.p.closerA)).has("ventas")).toBe(false);
    expect((await tiene(e.p.closerB)).has("ventas")).toBe(true); // solo a esa persona
    como(e, e.p.closerA);
    await ok(registrarCobro(venta, "10", "stripe")); // el cobro también está en Post-call: con «Agendas» sigue pudiendo
    como(e, e.p.ceo);
    await ok(guardarPermisoPersona(e.p.closerA.id, "agendas", false));
    como(e, e.p.closerA);
    await falla(registrarCobro(venta, "10", "stripe"), /No tienes acceso/); // sin Ventas ni Agendas, no
    como(e, e.p.ceo);
    await ok(guardarPermisoPersona(e.p.closerA.id, "ventas", null));
    await ok(guardarPermisoPersona(e.p.closerA.id, "agendas", null));
    expect((await tiene(e.p.closerA)).has("ventas")).toBe(true);
    como(e, e.p.closerA);
    await ok(registrarCobro(venta, "10", "stripe"));
  });
  it("límites: nada del CEO ni de uno mismo; el director con Administración solo da lo que tiene; Equipo y Finanzas nunca", async () => {
    como(e, e.p.director);
    await falla(guardarPermisoPersona(e.p.callerA.id, "ranking", false), /No tienes permiso/); // sin Administración
    como(e, e.p.directorAdmin);
    await falla(guardarPermisoPersona(e.p.directorAdmin.id, "finanzas", true), /te los cambia el CEO/);
    await falla(guardarPermisoPersona(e.p.ceo.id, "ranking", false), /CEO lo tiene todo/);
    await falla(guardarPermisoPersona(e.p.closerA.id, "equipo", true), /no se puede dar/);
    await falla(guardarPermisoPersona(e.p.callerA.id, "clientes", true), /tú no la tienes/);
    await ok(guardarPermisoPersona(e.p.callerA.id, "agendas", true)); // él la tiene
    await falla(guardarPermisoPersona(e.p.callerA.id, "inventada", true), /no válida/);
  });
});

describe("Inicio cuando quitan secciones", () => {
  it("sin «Mis leads» el caller empieza en la primera que tenga; sin ninguna, «Sin acceso»", async () => {
    como(e, e.p.ceo);
    expect(await rutaInicio(e.p.callerB, e.proyecto.id)).toBe("/caller");
    await ok(guardarPermisoPersona(e.p.callerB.id, "cola", false));
    expect(await rutaInicio(e.p.callerB, e.proyecto.id)).toBe("/mi-funnel");
    for (const s of ["mi_funnel", "crm", "grabadas", "ranking", "recursos", "reportes", "manuales"]) await ok(guardarPermisoPersona(e.p.callerB.id, s, false));
    expect(await rutaInicio(e.p.callerB, e.proyecto.id)).toBe("/sin-acceso");
  });

  it("26 oct: el CEO y los directores empiezan en KPIs; un director sin «KPIs» pero con «Funnel», en su pestaña", async () => {
    como(e, e.p.ceo);
    expect(await rutaInicio(e.p.ceo, e.proyecto.id)).toBe("/kpis");
    expect(await rutaInicio(e.p.director, e.proyecto.id)).toBe("/kpis");
    await ok(guardarPermisoPersona(e.p.director.id, "kpis", false));
    expect(await rutaInicio(e.p.director, e.proyecto.id)).toBe("/kpis?vista=funnel");
    await ok(guardarPermisoPersona(e.p.director.id, "kpis", true));
  });
});

describe("«Lo suyo» (casos confirmados por Cristian)", () => {
  it("Clientes a un caller: solo los que vendió o agendó; los demás no los toca", async () => {
    como(e, e.p.ceo);
    await ok(guardarPermisoSeccion("caller", "clientes", true));
    expect(soloLoSuyo(e.p.callerA, "clientes")).toBe(true);
    // LeadB: cliente (venta de closerB) agendado por callerA · LeadA: cliente de closerA, no agendado por callerA
    await db.from("ventas").insert({ proyecto_id: e.proyecto.id, lead_id: e.leads.LeadB, vendedor_id: e.p.closerB.id, facturacion: 500, cash_collected: 500, tipo_pago: "completo" });
    await db.from("citas").insert({ proyecto_id: e.proyecto.id, lead_id: e.leads.LeadB, closer_id: e.p.closerB.id, agendada_por: e.p.callerA.id, fecha: "2026-10-05T15:00:00Z", estado: "cerrada" });
    const suyos = await clientesSuyos(e.proyecto.id, e.p.callerA.id);
    expect([...suyos]).toEqual([e.leads.LeadB]);
    como(e, e.p.callerA);
    await ok(cambiarEstadoCliente(e.leads.LeadB, "pausado"));
    await falla(cambiarEstadoCliente(e.leads.LeadA, "pausado"), /no es tuyo/);
  });
  it("Agendas a un caller: ve sus citas pero no puede registrar el resultado", async () => {
    const { data: cita } = await db.from("citas").select("id").eq("lead_id", e.leads.LeadB).single();
    expect((await tiene(e.p.callerA)).has("agendas")).toBe(true); // se la dio el director con Administración arriba
    como(e, e.p.callerA);
    await falla(cambiarEstadoCita(cita!.id, "no_show", ""), /no es tuya/);
  });
});
