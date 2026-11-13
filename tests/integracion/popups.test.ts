// Fase 3 (Cristian, 13 nov 2026): popups de Administración, avisos por persona, textos de la bienvenida y ranking.
// Necesita la migración 20261117090000_fase3_popups.sql en la base local.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, falla, ok, type Escenario } from "../apoyo/escenario";
import { borrarPopup, guardarAjustesRanking, guardarPopup, guardarTextoEntrada, lanzarPopup } from "@/app/(panel)/admin/acciones";
import { marcarVistos, popupsParaMi } from "@/app/(panel)/avisos-acciones";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
  await db.from("miembros_proyecto").update({ mercado: "es" }).eq("proyecto_id", e.proyecto.id).eq("perfil_id", e.p.callerA.id);
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

const base = { texto: "Texto de prueba", imagen: "", boton_texto: "", boton_enlace: "/crm", personas: [], mercados: [], cada_horas: null };
const titulos = async () => (await ok(popupsParaMi(false))).map((t) => t.titulo);
const idDe = async (titulo: string) => (await db.from("popups").select("id").eq("proyecto_id", e.proyecto.id).eq("titulo", titulo).single()).data!.id as string;

describe("Popups", () => {
  it("solo el CEO o un director con Administración los crean", async () => {
    como(e, e.p.director);
    await falla(guardarPopup(null, { ...base, titulo: "No", roles: ["caller"], frecuencia: "sesion" }), /permiso/);
    como(e, e.p.callerA);
    await falla(guardarPopup(null, { ...base, titulo: "No", roles: ["caller"], frecuencia: "sesion" }), /permiso/);
    como(e, e.p.directorAdmin);
    await ok(guardarPopup(null, { ...base, titulo: "Callers de España", roles: ["caller"], mercados: ["es"], frecuencia: "semana" }));
  });

  it("a quién: callers de España sí; callers de Latam y closers no; la persona elegida, sí", async () => {
    como(e, e.p.ceo);
    await ok(guardarPopup(null, { ...base, titulo: "Para closerB", roles: [], personas: [e.p.closerB.id], frecuencia: "sesion" }));
    como(e, e.p.callerA);
    expect(await titulos()).toContain("Callers de España");
    como(e, e.p.callerB);
    expect(await titulos()).not.toContain("Callers de España");
    como(e, e.p.closerA);
    expect(await titulos()).not.toContain("Para closerB");
    como(e, e.p.closerB);
    expect(await titulos()).toContain("Para closerB");
  });

  it("semanal: tras cerrarlo no vuelve esa semana", async () => {
    como(e, e.p.callerA);
    const id = await idDe("Callers de España");
    await ok(marcarVistos([id], []));
    expect(await titulos()).not.toContain("Callers de España");
  });

  it("lanzar ahora: sale en la consulta de cada minuto, una vez; «Lanzar otra vez» lo vuelve a sacar", async () => {
    como(e, e.p.ceo);
    await ok(guardarPopup(null, { ...base, titulo: "Ahora", roles: ["ceo", "director", "closer", "caller"], frecuencia: "ahora" }));
    const id = await idDe("Ahora");
    como(e, e.p.callerB);
    expect((await ok(popupsParaMi(true))).map((t) => t.titulo)).toEqual(["Ahora"]); // solo los «ahora»
    await ok(marcarVistos([id], []));
    expect(await ok(popupsParaMi(true))).toEqual([]);
    await new Promise((r) => setTimeout(r, 20));
    como(e, e.p.ceo);
    await ok(lanzarPopup(id));
    como(e, e.p.callerB);
    expect((await ok(popupsParaMi(true))).map((t) => t.titulo)).toEqual(["Ahora"]);
  });

  it("apagado o borrado, no sale; un popup de otro proyecto no se marca", async () => {
    como(e, e.p.ceo);
    await ok(borrarPopup(await idDe("Ahora")));
    como(e, e.p.callerB);
    expect(await titulos()).not.toContain("Ahora");
    await ok(marcarVistos(["00000000-0000-4000-8000-000000000000"], []));
    expect((await db.from("popups_vistos").select("popup_id").eq("perfil_id", e.p.callerB.id)).data).toEqual([]);
  });
});

describe("Avisos por persona", () => {
  it("salen solo a su persona, sin ver, y se marcan al cerrar", async () => {
    const { data } = await db.from("avisos_persona").insert({ proyecto_id: e.proyecto.id, perfil_id: e.p.closerA.id, tipo: "agenda", titulo: "Nueva agenda", texto: "Tienes una agenda nueva", enlace: "/closer/llamadas" }).select("id").single();
    como(e, e.p.closerB);
    expect(await titulos()).not.toContain("Nueva agenda");
    como(e, e.p.closerA);
    const r = await ok(popupsParaMi(true));
    expect(r).toContainEqual(expect.objectContaining({ origen: "aviso", titulo: "Nueva agenda", boton: { texto: "Abrir", enlace: "/closer/llamadas" } }));
    como(e, e.p.closerB);
    await ok(marcarVistos([], [data!.id])); // el de otro no lo marca
    como(e, e.p.closerA);
    expect(await titulos()).toContain("Nueva agenda");
    await ok(marcarVistos([], [data!.id]));
    expect(await titulos()).not.toContain("Nueva agenda");
  });
});

describe("Textos de la bienvenida y ranking", () => {
  it("cambiar un texto y volver al de siempre", async () => {
    como(e, e.p.directorAdmin);
    await falla(guardarTextoEntrada("otra", { titulo: "a", texto: "b" }), /no existe/);
    await ok(guardarTextoEntrada("v1", { titulo: "¡Venta, {nombre}!", texto: "Bien" }));
    expect((await db.from("proyectos").select("textos_entrada").eq("id", e.proyecto.id).single()).data!.textos_entrada).toEqual({ v1: { titulo: "¡Venta, {nombre}!", texto: "Bien" } });
    await ok(guardarTextoEntrada("v1", null));
    expect((await db.from("proyectos").select("textos_entrada").eq("id", e.proyecto.id).single()).data!.textos_entrada).toEqual({});
  });

  it("los 2 interruptores del ranking, apagados por defecto", async () => {
    const leer = async () => (await db.from("proyectos").select("ranking_mostrar_bajas, ranking_closers_para_callers").eq("id", e.proyecto.id).single()).data;
    expect(await leer()).toEqual({ ranking_mostrar_bajas: false, ranking_closers_para_callers: false });
    como(e, e.p.director);
    await falla(guardarAjustesRanking({ mostrarBajas: true, closersParaCallers: true }), /permiso/);
    como(e, e.p.ceo);
    await ok(guardarAjustesRanking({ mostrarBajas: true, closersParaCallers: false }));
    expect(await leer()).toEqual({ ranking_mostrar_bajas: true, ranking_closers_para_callers: false });
  });
});
