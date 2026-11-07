// Permisos de las acciones del servidor: cada rol intenta lo que NO debe poder hacer.
// Se llama a las acciones directamente (como haría alguien que se salta la pantalla).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, falla, formulario, ok, type Escenario } from "../apoyo/escenario";
import { moverLead, asignarLeads, importarCsv, prepararSubidaCsv, crearPipeline, borrarPipeline } from "@/app/(panel)/crm/acciones";
import { registrarLlamada, agendarCita, registrarVenta, cambiarEtapaLead, asignarDesdeFicha } from "@/app/(panel)/leads/acciones";
import { cambiarEstadoCita } from "@/app/(panel)/closer/acciones";
import { registrarCobro, borrarVenta } from "@/app/(panel)/ventas/acciones";
import { crearRecurso, guardarLinkPago, prepararSubidaPdf } from "@/app/(panel)/recursos/acciones";
import { crearUsuario, actualizarMiembro, crearProyecto, anadirAlProyecto, cambiarPassword } from "@/app/(panel)/admin/acciones";
import { guardarPrograma, type DatosPrograma } from "@/app/(panel)/programas/acciones";

// Productos: desde V2-5 se crean en Programas (sección «programas», solo el CEO por defecto)
const programa = (nombre: string, precio: string): DatosPrograma => ({ id: null, nombre, descripcion: "", categoria: "", color: "#7c3aed", activo: true, backend_offer: false, vende_caller: false, modo_pago: "unico", num_cuotas: null, precio, precios_divisa: {}, comisiones: {}, link_pago: "" });
import { enviarReporte } from "@/app/(panel)/reportes/acciones";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("Caller", () => {
  it("no puede mover leads de otro en el CRM ni asignarlos (H7: los suyos sí los mueve)", async () => {
    como(e, e.p.callerA);
    await falla(moverLead(e.leads.LeadB, e.etapas.Cerrados), /no está asignado a ti/);
    await falla(asignarLeads([e.leads.LeadLibre], e.p.callerA.id), /permiso/);
    await falla(cambiarEtapaLead(e.leads.LeadA, e.etapas.Cerrados));
    await falla(asignarDesdeFicha(e.leads.LeadA, "caller_id", e.p.callerA.id));
  });
  it("no puede tocar un lead de otro caller ni uno sin asignar", async () => {
    como(e, e.p.callerA);
    await falla(registrarLlamada(e.leads.LeadB, "llamado", ""), /no está asignado a ti/);
    await falla(registrarLlamada(e.leads.LeadLibre, "llamado", ""), /no está asignado a ti/);
  });
  it("sí puede registrar la llamada de su propio lead", async () => {
    como(e, e.p.callerA);
    await ok(registrarLlamada(e.leads.LeadA, "llamado", ""));
    const { data } = await db.from("leads").select("estado_caller").eq("id", e.leads.LeadA).single();
    expect(data?.estado_caller).toBe("llamado");
  });
  it("no registra ventas, ni siquiera de productos low ticket (Cristian, 12 oct)", async () => {
    como(e, e.p.callerA);
    const fd = formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1997", cash: "1997", tipo_pago: "completo", metodo: "stripe" });
    await falla(registrarVenta(e.leads.LeadA, fd), /no registra ventas/);
    const low = formulario({ producto: e.productos["Low ticket"], facturacion: "47", cash: "47", tipo_pago: "completo", metodo: "stripe" });
    await falla(registrarVenta(e.leads.LeadA, low), /no registra ventas/);
  });
  it("no puede subir CSV, crear pipelines, recursos, usuarios ni productos", async () => {
    como(e, e.p.callerA);
    // Ni puede pedir el enlace para subir, ni importar una ruta aunque la conozca
    await falla(prepararSubidaCsv(), /permiso/);
    await falla(prepararSubidaPdf(), /permiso/);
    expect((await importarCsv(null, formulario({ archivo_ruta: `${e.proyecto.id}/${crypto.randomUUID()}.csv` })))?.error).toMatch(/permiso/);
    await falla(crearPipeline("Hack"), /permiso/);
    expect((await crearRecurso(null, formulario({ titulo: "x", tipo: "enlace", url: "https://x.test" })))?.error).toMatch(/permiso/);
    await falla(guardarLinkPago(e.productos["Low ticket"], "https://x.test"), /permiso/);
    expect((await crearUsuario(null, formulario({ nombre: "x", email: `${e.pref}-hack@eternity.test`, rol: "ceo", password: "12345678" })))?.error).toMatch(/permiso/);
    await falla(guardarPrograma(programa("Gratis", "1")), /No tienes acceso/);
  });
  it("no puede cambiar contraseñas de otros", async () => {
    como(e, e.p.callerA);
    await falla(cambiarPassword(e.p.ceo.id, "nuevaclave123"), /permiso/);
  });
});

describe("Closer", () => {
  let citaDeB: string;
  let ventaDeB: string;
  beforeAll(async () => {
    const { data: cita } = await db
      .from("citas")
      .insert({ proyecto_id: e.proyecto.id, lead_id: e.leads.LeadB, closer_id: e.p.closerB.id, fecha: "2026-10-01T14:00:00Z" })
      .select("id")
      .single();
    citaDeB = cita!.id;
    const { data: venta } = await db
      .from("ventas")
      .insert({ proyecto_id: e.proyecto.id, lead_id: e.leads.LeadB, vendedor_id: e.p.closerB.id, facturacion: 1997, cash_collected: 500, tipo_pago: "reserva" })
      .select("id")
      .single();
    ventaDeB = venta!.id;
  });
  it("no puede cambiar la cita de otro closer", async () => {
    como(e, e.p.closerA);
    await falla(cambiarEstadoCita(citaDeB, "no_show", ""), /no es tuya/);
  });
  it("no puede cobrar ni borrar la venta de otro", async () => {
    como(e, e.p.closerA);
    await falla(registrarCobro(ventaDeB, "100", "stripe"), /no es tuya/);
    await falla(borrarVenta(ventaDeB));
  });
  it("Paso H6 (Cristian, 10 oct 2026): el closer sí puede borrar su propia venta; el caller no, ni su low ticket", async () => {
    const nueva = async (vendedor: string) =>
      (await db.from("ventas").insert({ proyecto_id: e.proyecto.id, lead_id: e.leads.LeadB, vendedor_id: vendedor, facturacion: 47, cash_collected: 47, tipo_pago: "completo" }).select("id").single()).data!.id;
    const deCaller = await nueva(e.p.callerB.id);
    como(e, e.p.callerB);
    await falla(borrarVenta(deCaller), /director, el CEO o el closer|No tienes acceso/); // H5: el caller ni siquiera tiene «Ventas»
    const propia = await nueva(e.p.closerB.id);
    como(e, e.p.closerB);
    await ok(borrarVenta(propia));
    expect((await db.from("ventas").select("id").eq("id", propia)).data).toHaveLength(0);
  });
  it("no puede agendar sobre un lead que no es suyo", async () => {
    como(e, e.p.closerA);
    await falla(agendarCita(e.leads.LeadLibre, e.p.closerA.id, "2026-10-20T10:00", ""), /no está asignado/);
  });
});

describe("Director", () => {
  it("sin acceso de admin no puede crear usuarios", async () => {
    como(e, e.p.director);
    expect((await crearUsuario(null, formulario({ nombre: "x", email: `${e.pref}-x@eternity.test`, rol: "caller", password: "12345678" })))?.error).toMatch(/permiso/);
  });
  it("con acceso de admin crea usuarios, pero nunca un CEO", async () => {
    como(e, e.p.directorAdmin);
    const ok = await crearUsuario(null, formulario({ nombre: "Nuevo caller", email: `${e.pref}-nuevo@eternity.test`, rol: "caller", password: "12345678" }));
    expect(ok?.ok).toBeTruthy();
    const ceo = await crearUsuario(null, formulario({ nombre: "Falso CEO", email: `${e.pref}-falsoceo@eternity.test`, rol: "ceo", password: "12345678" }));
    expect(ceo?.error).toMatch(/Solo el CEO/);
  });
  it("no puede subirse a CEO a otro, ni darse admin, ni tocar al CEO", async () => {
    como(e, e.p.directorAdmin);
    await falla(actualizarMiembro(e.p.callerC.id, { rol: "ceo" }), /Solo el CEO/);
    await falla(actualizarMiembro(e.p.director.id, { admin_activo: true }), /Solo el CEO/);
    await falla(actualizarMiembro(e.p.ceo.id, { activo: false }), /Solo el CEO/);
    await falla(actualizarMiembro(e.p.directorAdmin.id, { rol: "ceo" }), /propio/);
  });
  it("no puede crear productos ni proyectos, ni añadir gente de otros proyectos", async () => {
    como(e, e.p.directorAdmin);
    await falla(guardarPrograma(programa("X", "1")), /No tienes acceso/);
    expect((await crearProyecto(null, formulario({ nombre: `TEST-AUTO ${e.id} hack`, region: "us" })))?.error).toMatch(/permiso/);
    await falla(anadirAlProyecto(e.p.callerA.id), /permiso/);
  });
  it("sí puede mover y asignar leads", async () => {
    como(e, e.p.director);
    await ok(asignarLeads([e.leads.LeadLibre], e.p.callerC.id));
    await ok(moverLead(e.leads.LeadLibre, e.etapas.Agendados));
    const { data } = await db.from("leads").select("caller_id, etapa_id").eq("id", e.leads.LeadLibre).single();
    expect(data).toEqual({ caller_id: e.p.callerC.id, etapa_id: e.etapas.Agendados });
  });
});

describe("Proyectos ajenos", () => {
  it("nadie puede tocar un pipeline o lead de otro proyecto", async () => {
    const otro = await crearEscenario();
    try {
      como(e, e.p.ceo); // CEO, pero con la sesión puesta en el proyecto de e
      await falla(borrarPipeline(otro.pipeline.id), /no encontrado/i);
      await falla(moverLead(otro.leads.LeadA, e.etapas.Cerrados), /no encontrado/i);
      await falla(moverLead(e.leads.LeadA, otro.etapas.Cerrados), /no encontrada/i);
    } finally {
      await borrarEscenario(otro);
    }
  });
});

describe("Reportes", () => {
  it("el director no hace reportes de fin de día (son de callers y closers)", async () => {
    como(e, e.p.director);
    expect((await enviarReporte(null, new FormData()))?.error).toMatch(/callers y closers/);
  });
  it("un número negativo se rechaza", async () => {
    como(e, e.p.callerA);
    const fd = formulario({ llamadas: "-3", no_responden: "0", agendas: "0", whatsapps: "0", seguimientos: "0", inconvenientes: "x", mejoras: "x", otros: "x" });
    expect((await enviarReporte(null, fd))?.error).toMatch(/número entero/);
  });
});
