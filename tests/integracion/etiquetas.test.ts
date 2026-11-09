// Plan GHL B3a (Cristian, 8 nov 2026): etiquetas en el dashboard. Renombrar, unir y borrar cambian a la vez los leads,
// las Entradas (base, fijas y reglas), los pasos de los workflows (también en ramas) y los disparadores de A3.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, falla, ok, type Escenario } from "../apoyo/escenario";
import { crearEtiqueta, marcarEtiquetaGhl, ordenarEtiquetas, renombrarEtiqueta } from "@/app/(panel)/admin/acciones";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

const etiquetas = async (id: string) => (await db.from("leads").select("etiquetas").eq("id", id).single()).data!.etiquetas as string[];
const lista = async () => (await db.rpc("etiquetas_del_proyecto", { p_proyecto: e.proyecto.id })).data as { nombre: string; leads: number; usada_ghl: boolean }[];
const pasos = (t: string) => [
  { id: "e", tipo: "etiquetas_ghl", base: t, fijas: [t, "otra"], campo_completo: "" },
  { id: "r", tipo: "rama", caminos: [{ condicion: { campo: "canal", operador: "existe" }, pasos: [{ id: "q", tipo: "quitar_etiqueta_ghl", etiqueta: t }] }], si_no: [{ id: "q2", tipo: "quitar_etiqueta_ghl", etiqueta: t }] },
];

describe("Etiquetas en el dashboard", () => {
  it("solo un administrador; las del código no se cambian; sin comas ni más de 80 letras", async () => {
    como(e, e.p.director); // sin Administración
    await falla(crearEtiqueta("x"), /permiso/);
    await falla(renombrarEtiqueta("x", "y"), /permiso/);
    como(e, e.p.directorAdmin);
    for (const t of ["biblioteca recursos", "webinar1", "recursos-ia", "form-biblioteca-incompleto", "x-completo", "Canal: YouTube"]) {
      await falla(renombrarEtiqueta(t, "nueva"), /código/);
      await falla(renombrarEtiqueta("nueva", t), /código/);
    }
    await falla(renombrarEtiqueta("webinar1", null), /código/);
    await falla(crearEtiqueta("a,b"), /comas/);
    await falla(crearEtiqueta("x".repeat(81)), /80/);
  });

  it("renombrar cambia los 6 sitios a la vez", async () => {
    await db.from("leads").update({ etiquetas: ["vip", "Agenda Vieja", "Canal: YouTube"] }).eq("id", e.leads.LeadA);
    const { data: en } = await db
      .from("entradas")
      .insert({ proyecto_id: e.proyecto.id, nombre: "Etiquetas", ghl_etiqueta_base: "agenda vieja", ghl_etiquetas_extra: ["agenda vieja", "fija"], reglas: [{ campo: "utm_source", operador: "igual", valor: "yt", etiqueta: "agenda vieja", pipeline_id: null }] })
      .select("id")
      .single();
    const { data: wf } = await db.from("workflows").insert({ proyecto_id: e.proyecto.id, nombre: "Etiqueta «Agenda Vieja»", disparador: { tipo: "etiqueta", etiqueta: "Agenda Vieja" }, pasos: pasos("agenda vieja") }).select("id, version").single();

    como(e, e.p.directorAdmin);
    await ok(crearEtiqueta("Agenda Vieja"));
    await falla(crearEtiqueta("agenda vieja"), /ya existe/);
    await ok(renombrarEtiqueta("agenda vieja", "Agenda Nueva"));

    expect(await etiquetas(e.leads.LeadA)).toEqual(["vip", "agenda nueva", "Canal: YouTube"]);
    const ent = (await db.from("entradas").select("ghl_etiqueta_base, ghl_etiquetas_extra, reglas").eq("id", en!.id).single()).data!;
    expect(ent.ghl_etiqueta_base).toBe("agenda nueva");
    expect(ent.ghl_etiquetas_extra).toEqual(["agenda nueva", "fija"]);
    expect((ent.reglas as { etiqueta: string }[])[0].etiqueta).toBe("agenda nueva");
    const w = (await db.from("workflows").select("nombre, disparador, pasos, version").eq("id", wf!.id).single()).data!;
    expect(w.disparador).toEqual({ tipo: "etiqueta", etiqueta: "agenda nueva" });
    expect(w.nombre).toBe("Etiqueta «agenda nueva»");
    expect(w.pasos).toEqual(pasos("agenda nueva"));
    expect(w.version).toBe(wf!.version + 1);
    expect((await lista()).find((x) => x.nombre === "agenda nueva")).toMatchObject({ leads: 1 });
    expect((await lista()).some((x) => x.nombre === "agenda vieja")).toBe(false);
  });

  it("unir no repite y junta la marca «usada por GHL»", async () => {
    await db.from("leads").update({ etiquetas: ["agenda nueva", "vip", "agenda llamada"] }).eq("id", e.leads.LeadA);
    await db.from("leads").update({ etiquetas: ["agenda nueva"] }).eq("id", e.leads.LeadB);
    await db.from("etiquetas").insert({ proyecto_id: e.proyecto.id, nombre: "agenda llamada", usada_ghl: true });
    const { data: en } = await db.from("entradas").insert({ proyecto_id: e.proyecto.id, nombre: "Unir", ghl_etiquetas_extra: ["agenda llamada", "agenda nueva"] }).select("id").single();
    como(e, e.p.directorAdmin);
    await ok(renombrarEtiqueta("agenda nueva", "agenda llamada"));
    expect(await etiquetas(e.leads.LeadA)).toEqual(["agenda llamada", "vip"]);
    expect(await etiquetas(e.leads.LeadB)).toEqual(["agenda llamada"]);
    expect((await db.from("entradas").select("ghl_etiquetas_extra").eq("id", en!.id).single()).data!.ghl_etiquetas_extra).toEqual(["agenda llamada"]);
    expect((await lista()).find((x) => x.nombre === "agenda llamada")).toMatchObject({ leads: 2, usada_ghl: true });
  });

  it("borrar quita de los leads, de las Entradas y de los pasos, y apaga el workflow de esa etiqueta", async () => {
    const { data: wf } = await db.from("workflows").insert({ proyecto_id: e.proyecto.id, nombre: "Borrar", disparador: { tipo: "etiqueta", etiqueta: "vip" }, pasos: pasos("vip"), encendido: true }).select("id").single();
    const { data: en } = await db.from("entradas").insert({ proyecto_id: e.proyecto.id, nombre: "Borrar", ghl_etiqueta_base: "vip", reglas: [{ campo: "c", operador: "existe", etiqueta: "vip", pipeline_id: null }] }).select("id").single();
    como(e, e.p.directorAdmin);
    await ok(renombrarEtiqueta("VIP", null));
    expect(await etiquetas(e.leads.LeadA)).toEqual(["agenda llamada"]);
    const ent = (await db.from("entradas").select("ghl_etiqueta_base, reglas").eq("id", en!.id).single()).data!;
    expect(ent.ghl_etiqueta_base).toBeNull();
    expect(ent.reglas).toEqual([{ campo: "c", operador: "existe", etiqueta: null, pipeline_id: null }]); // la regla se queda
    const w = (await db.from("workflows").select("encendido, pasos").eq("id", wf!.id).single()).data!;
    expect(w.encendido).toBe(false);
    expect(w.pasos).toEqual([
      { id: "e", tipo: "etiquetas_ghl", base: null, fijas: ["otra"], campo_completo: "" },
      { id: "r", tipo: "rama", caminos: [{ condicion: { campo: "canal", operador: "existe" }, pasos: [] }], si_no: [] },
    ]);
  });

  it("ordenar guarda el orden sin tocar la marca", async () => {
    como(e, e.p.directorAdmin);
    await ok(ordenarEtiquetas(["canal: youtube", "agenda llamada", "agenda vieja"]));
    expect((await lista()).map((x) => x.nombre).slice(0, 3)).toEqual(["canal: youtube", "agenda llamada", "agenda vieja"]);
    expect((await lista()).find((x) => x.nombre === "agenda llamada")?.usada_ghl).toBe(true);
  });
  it("renombrar la etiqueta base de una Entrada cambia también sus -completo/-incompleto (1.7, 9 nov)", async () => {
    await db.from("leads").update({ etiquetas: ["Base-Prueba-completo", "vip"] }).eq("id", e.leads.LeadB);
    await db.from("entradas").insert({ proyecto_id: e.proyecto.id, nombre: "Con base", ghl_etiqueta_base: "Base-Prueba" });
    como(e, e.p.directorAdmin);
    await ok(renombrarEtiqueta("base-prueba", "base-nueva"));
    expect(await etiquetas(e.leads.LeadB)).toEqual(["base-nueva-completo", "vip"]);
  });

  it("la marca «usada por GHL» se cambia en pantalla", async () => {
    como(e, e.p.directorAdmin);
    await ok(marcarEtiquetaGhl("marca-ghl", true));
    expect((await lista()).find((f) => f.nombre === "marca-ghl")?.usada_ghl).toBe(true);
    await ok(marcarEtiquetaGhl("marca-ghl", false));
    expect((await lista()).find((f) => f.nombre === "marca-ghl")?.usada_ghl).toBe(false);
  });
});
