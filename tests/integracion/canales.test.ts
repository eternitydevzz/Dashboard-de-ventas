// Plan GHL B2b (Cristian, 8 nov 2026): los canales en la base. Un proyecto sin filas usa los de siempre; guardar la
// tabla lo hace solo un administrador, y renombrar cambia «Canal: X» en los leads, las reglas y los disparadores.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, falla, ok, type Escenario } from "../apoyo/escenario";
import { guardarCanales } from "@/app/(panel)/admin/acciones";
import { canalesDe } from "@/lib/canales-datos";
import { CANALES_POR_DEFECTO } from "@/lib/canal";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

const etiquetas = async (id: string) => (await db.from("leads").select("etiquetas").eq("id", id).single()).data!.etiquetas as string[];
const con = (cambios: Record<string, string>) => CANALES_POR_DEFECTO.map((c) => (cambios[c.clave] ? { ...c, nombre: cambios[c.clave] } : c));

describe("Canales en la base", () => {
  it("sin filas, los de siempre; solo un administrador guarda", async () => {
    expect(await canalesDe(e.proyecto.id)).toEqual(CANALES_POR_DEFECTO);
    como(e, e.p.director); // sin Administración
    await falla(guardarCanales(CANALES_POR_DEFECTO), /permiso/);
    como(e, e.p.directorAdmin);
    await falla(guardarCanales(CANALES_POR_DEFECTO.slice(1)), /canales/);
    expect((await db.from("canales").select("clave").eq("proyecto_id", e.proyecto.id)).data).toEqual([]);
  });

  it("renombrar cambia la etiqueta de los leads, las reglas de las Entradas y los disparadores, a la vez", async () => {
    await db.from("leads").update({ etiquetas: ["Canal: YouTube", "vip", "Canal: Callers"] }).eq("id", e.leads.LeadA);
    await db.from("leads").update({ etiquetas: ["Canal: Instagram"] }).eq("id", e.leads.LeadB);
    const { data: en } = await db
      .from("entradas")
      .insert({ proyecto_id: e.proyecto.id, nombre: "Canales", reglas: [{ campo: "utm_source", operador: "igual", valor: "yt", etiqueta: "Canal: YouTube" }, { campo: "utm_source", operador: "igual", valor: "x", etiqueta: "otra" }] })
      .select("id")
      .single();
    const { data: wf } = await db.from("workflows").insert({ proyecto_id: e.proyecto.id, nombre: "Al ponerse Callers", disparador: { tipo: "etiqueta", etiqueta: "canal: callers" } }).select("id").single();

    como(e, e.p.directorAdmin);
    // YouTube y Callers se cambian el nombre entre sí: vale porque se cambia todo de una vez
    const tabla = con({ yt: "Callers", callers: "YouTube" }).reverse();
    await ok(guardarCanales(tabla));

    expect(await canalesDe(e.proyecto.id)).toEqual(tabla); // y en ese orden
    expect(await etiquetas(e.leads.LeadA)).toEqual(["Canal: Callers", "vip", "Canal: YouTube"]);
    expect(await etiquetas(e.leads.LeadB)).toEqual(["Canal: Instagram"]);
    const reglas = (await db.from("entradas").select("reglas").eq("id", en!.id).single()).data!.reglas as { etiqueta: string }[];
    expect(reglas.map((r) => r.etiqueta)).toEqual(["Canal: Callers", "otra"]);
    expect((await db.from("workflows").select("disparador").eq("id", wf!.id).single()).data!.disparador).toEqual({ tipo: "etiqueta", etiqueta: "Canal: YouTube" });

    // Con filas ya guardadas, renombrar otra vez sale de la base; un lead que ya tenía la nueva no la repite
    await db.from("leads").update({ etiquetas: ["Canal: Instagram", "Canal: IG"] }).eq("id", e.leads.LeadB);
    await ok(guardarCanales(tabla.map((c) => (c.clave === "ig" ? { ...c, nombre: "IG" } : c))));
    expect(await etiquetas(e.leads.LeadB)).toEqual(["Canal: IG"]);
    expect((await canalesDe(e.proyecto.id)).find((c) => c.clave === "ig")?.nombre).toBe("IG");
  });
  it("renombrar cambia también la base y las fijas de las Entradas y los pasos de los workflows (Plan GHL 1.7, 9 nov)", async () => {
    // Ahora yt se llama «Callers» y callers «YouTube» (test anterior): se vuelven a cambiar entre sí
    const { data: en } = await db
      .from("entradas")
      .insert({ proyecto_id: e.proyecto.id, nombre: "Canales base", ghl_etiqueta_base: "Canal: Callers", ghl_etiquetas_extra: ["Canal: YouTube", "x"] })
      .select("id")
      .single();
    const pasos = [
      { tipo: "etiquetas_ghl", base: "Canal: Callers", fijas: ["Canal: YouTube", "y"] },
      { tipo: "quitar_etiqueta_ghl", etiqueta: "canal: youtube" },
    ];
    const { data: wf } = await db.from("workflows").insert({ proyecto_id: e.proyecto.id, nombre: "Pasos con canal", disparador: { tipo: "entrada" }, pasos }).select("id, version").single();

    como(e, e.p.directorAdmin);
    const actual = await canalesDe(e.proyecto.id);
    await ok(guardarCanales(actual.map((c) => (c.clave === "yt" ? { ...c, nombre: "YouTube" } : c.clave === "callers" ? { ...c, nombre: "Callers" } : c))));

    const fila = (await db.from("entradas").select("ghl_etiqueta_base, ghl_etiquetas_extra").eq("id", en!.id).single()).data!;
    expect(fila).toEqual({ ghl_etiqueta_base: "Canal: YouTube", ghl_etiquetas_extra: ["Canal: Callers", "x"] });
    const w = (await db.from("workflows").select("pasos, version").eq("id", wf!.id).single()).data!;
    expect(w.pasos).toEqual([
      { tipo: "etiquetas_ghl", base: "Canal: YouTube", fijas: ["Canal: Callers", "y"] },
      { tipo: "quitar_etiqueta_ghl", etiqueta: "Canal: Callers" },
    ]);
    expect(w.version).toBeGreaterThan(wf!.version);
  });
});
