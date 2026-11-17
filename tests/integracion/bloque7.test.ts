// 1.0 Bloque 7 (Cristian, 10 y 11 oct 2026): preguntas del reporte editables (los reportes enviados guardan las suyas),
// onboarding de los clientes de cada closer, link de dossier y productos con precio personalizado (DFY).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, falla, formulario, ok, type Escenario } from "../apoyo/escenario";
import { guardarPreguntasReporte } from "@/app/(panel)/admin/acciones";
import { borrarPasoCloser, guardarPasoCloser, marcarPasoCloser } from "@/app/(panel)/onboarding-closers/acciones";
import { clientesDeCloser, pasosCloser, PASOS_DEFECTO } from "@/lib/onboarding-closer";
import { registrarVenta } from "@/app/(panel)/leads/acciones";
import { guardarLinkPago } from "@/app/(panel)/recursos/acciones";
import { guardarPrograma, type DatosPrograma } from "@/app/(panel)/programas/acciones";
import { PREGUNTAS } from "@/lib/reportes";
import type { Proyecto } from "@/lib/tipos";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});
const alDia = async () => Object.assign(e.proyecto, (await db.from("proyectos").select("*").eq("id", e.proyecto.id).single()).data as Proyecto);

describe("Preguntas del reporte (Administración)", () => {
  it("solo el administrador; las fijas del closer no se quitan", async () => {
    const nuevas = [{ clave: "demos", texto: "¿Cuántas demos?", tipo: "numero" }, { clave: "animo", texto: "¿Cómo te has sentido?", tipo: "texto" }];
    como(e, e.p.director);
    await falla(guardarPreguntasReporte("caller", nuevas), /permiso/);
    como(e, e.p.directorAdmin);
    await falla(guardarPreguntasReporte("closer", PREGUNTAS.closer.filter((p) => p.clave !== "llamadas_realizadas")), /no se puede quitar/);
    await ok(guardarPreguntasReporte("caller", nuevas));
    expect((await alDia()).preguntas_reporte).toEqual({ caller: nuevas });
  });
});

describe("Onboarding de los closers", () => {
  it("los 4 puntos del plan al abrirlo; sus clientes = a quienes él les vendió; los marca él; el CEO ve los de todos", async () => {
    const pasos = await pasosCloser(e.proyecto.id);
    expect(pasos.map((p) => p.nombre)).toEqual(PASOS_DEFECTO);
    como(e, e.p.ceo);
    await ok(registrarVenta(e.leads.LeadA, formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1000", cash: "1000", tipo_pago: "completo", metodo: "stripe", vendedor: e.p.closerA.id })));
    await ok(registrarVenta(e.leads.LeadB, formulario({ producto: e.productos["Mentoría grupal"], facturacion: "1000", cash: "1000", tipo_pago: "completo", metodo: "stripe", vendedor: e.p.closerB.id })));
    expect((await clientesDeCloser(e.proyecto.id, e.p.closerA)).map((c) => c.lead_id)).toEqual([e.leads.LeadA]);
    expect((await clientesDeCloser(e.proyecto.id, e.p.ceo)).length).toBe(2);
    expect((await clientesDeCloser(e.proyecto.id, e.p.ceo, e.p.closerB.id)).map((c) => c.lead_id)).toEqual([e.leads.LeadB]);
    como(e, e.p.closerA);
    await falla(marcarPasoCloser(e.leads.LeadB, pasos[0].id, true), /no es tuyo/);
    await ok(marcarPasoCloser(e.leads.LeadA, pasos[0].id, true));
    expect(Object.keys((await clientesDeCloser(e.proyecto.id, e.p.closerA))[0].hechos)).toEqual([pasos[0].id]);
    await ok(marcarPasoCloser(e.leads.LeadA, pasos[0].id, false));
    expect((await clientesDeCloser(e.proyecto.id, e.p.closerA))[0].hechos).toEqual({});
  });
  it("los puntos los cambian el CEO y los directores, no un closer", async () => {
    como(e, e.p.closerA);
    await falla(guardarPasoCloser(null, "Grupo de WhatsApp"), /CEO o un director/);
    como(e, e.p.director);
    await ok(guardarPasoCloser(null, "Grupo de WhatsApp"));
    await falla(guardarPasoCloser(null, "Grupo de WhatsApp"), /Ya hay un punto/);
    const nuevo = (await pasosCloser(e.proyecto.id)).find((p) => p.nombre === "Grupo de WhatsApp")!;
    await ok(borrarPasoCloser(nuevo.id));
    expect((await pasosCloser(e.proyecto.id)).length).toBe(4);
  });
});

describe("Productos: dossier y precio personalizado", () => {
  it("el link de dossier se guarda (solo https) desde Links y recursos y desde Programas; DFY sin precio", async () => {
    como(e, e.p.director);
    await falla(guardarLinkPago(e.productos["Mentoría grupal"], "http://inseguro.test", "link_dossier"), /https/);
    await ok(guardarLinkPago(e.productos["Mentoría grupal"], "https://dossier.test/grupal", "link_dossier"));
    const { data: p } = await db.from("productos").select("link_dossier, link_pago").eq("id", e.productos["Mentoría grupal"]).single();
    expect(p).toEqual({ link_dossier: "https://dossier.test/grupal", link_pago: null });
    como(e, e.p.ceo);
    const dfy: DatosPrograma = { id: null, nombre: "DFY test", descripcion: "", categoria: "", color: "#7c3aed", activo: true, backend_offer: false, vende_caller: false, modo_pago: "unico", num_cuotas: null, precio: "", precios_divisa: {}, comisiones: {}, link_pago: "", link_dossier: "https://dossier.test/dfy" };
    await ok(guardarPrograma(dfy));
    const { data: d } = await db.from("productos").select("precio, link_dossier").eq("proyecto_id", e.proyecto.id).eq("nombre", "DFY test").single();
    expect(d).toEqual({ precio: null, link_dossier: "https://dossier.test/dfy" });
  });
});
