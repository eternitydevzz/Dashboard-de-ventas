// Popup «Recursos» del guion (Cristian, 10 nov): lo mismo que /recursos, con sus reglas de quién ve qué.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, como, crearEscenario, db, type Escenario } from "../apoyo/escenario";
import { recursosLlamada, type RecursosLlamada } from "@/app/(panel)/recursos/acciones";

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
  const pid = e.proyecto.id;
  await db.from("recursos").insert([
    { proyecto_id: pid, titulo: "Para todos", tipo: "enlace", url: "https://ejemplo.test/todos", para_rol: "todos" },
    { proyecto_id: pid, titulo: "Solo callers", tipo: "guion", contenido: "Hola {nombre}", para_rol: "caller" },
    { proyecto_id: pid, titulo: "Solo closers", tipo: "enlace", url: "https://ejemplo.test/closers", para_rol: "closer" },
  ]);
  await db.from("productos").insert([
    { proyecto_id: pid, nombre: "Lo vende el caller", precio: 47, vende_caller: true, link_dossier: "https://ejemplo.test/dossier" },
    { proyecto_id: pid, nombre: "Solo el closer", precio: 3000, vende_caller: false },
  ]);
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

const datos = async () => {
  const r = await recursosLlamada();
  if ("error" in r) throw new Error(r.error);
  return r as RecursosLlamada;
};

describe("Popup «Recursos» del guion", () => {
  it("el caller ve los de todos y los suyos, y solo los productos que vende", async () => {
    como(e, e.p.callerA);
    const r = await datos();
    expect(r.recursos.map((x) => x.titulo).sort()).toEqual(["Para todos", "Solo callers"]);
    expect(r.recursos.find((x) => x.titulo === "Solo callers")?.contenido).toBe("Hola {nombre}");
    expect(r.recursos.find((x) => x.titulo === "Para todos")?.href).toBe("https://ejemplo.test/todos");
    const nombres = r.productos.map((p) => p.nombre);
    expect(nombres).toContain("Lo vende el caller");
    expect(nombres).not.toContain("Solo el closer");
    expect(r.productos.find((p) => p.nombre === "Lo vende el caller")?.dossier).toBe("https://ejemplo.test/dossier");
  });
  it("el closer no ve los de los callers; el director lo ve todo", async () => {
    como(e, e.p.closerA);
    expect((await datos()).recursos.map((x) => x.titulo).sort()).toEqual(["Para todos", "Solo closers"]);
    como(e, e.p.director);
    expect((await datos()).recursos).toHaveLength(3);
  });
});
