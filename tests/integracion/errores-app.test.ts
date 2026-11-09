// Plan GHL F3: «otros errores» de la app. Mismo sitio y texto = una fila con contador, y un solo aviso del CEO.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarEscenario, crearEscenario, db, type Escenario } from "../apoyo/escenario";
import { guardarError } from "@/lib/errores-app";
import { seguro } from "@/lib/resultado";
import { avisosCeo } from "@/lib/avisos-ceo";

let e: Escenario;
const sitio = `TEST-AUTO-${Math.random().toString(36).slice(2, 8)}`;

beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  await db.from("errores_app").delete().like("sitio", `${sitio}%`);
  if (e) await borrarEscenario(e);
});

describe("Otros errores de la app", () => {
  it("un error que pasa 5 veces sale 1 vez en los avisos, con sus 5 veces", async () => {
    for (let i = 0; i < 5; i++) await guardarError(sitio, "GHL contestó 500", e.proyecto.id);
    await guardarError(sitio, "otro texto", e.proyecto.id);
    const { data } = await db.from("errores_app").select("texto, veces").eq("sitio", sitio).order("texto");
    expect(data).toEqual([
      { texto: "GHL contestó 500", veces: 5 },
      { texto: "otro texto", veces: 1 },
    ]);
    const mios = (await avisosCeo(e.proyecto.id)).filter((a) => a.tipo === "otro_error" && a.texto.startsWith(sitio));
    expect(mios.map((a) => a.cuantos).sort()).toEqual([1, 5]);
  });

  it("los errores sin proyecto (las acciones, resultado.ts) también se agrupan", async () => {
    const accion = () => seguro(async () => { throw new Error(`${sitio} se rompió`); });
    for (let i = 0; i < 3; i++) expect(await accion()).toHaveProperty("error");
    const { data } = await db.from("errores_app").select("proyecto_id, veces").eq("sitio", "acción").eq("texto", `${sitio} se rompió`);
    expect(data).toEqual([{ proyecto_id: null, veces: 3 }]);
    await db.from("errores_app").delete().eq("sitio", "acción").eq("texto", `${sitio} se rompió`);
  });
  it("al guardar un error se borran los de más de 30 días (Cristian, 9 nov)", async () => {
    await db.from("errores_app").insert({ proyecto_id: e.proyecto.id, sitio: `${sitio}-viejo`, texto: "viejo", ultimo_en: new Date(Date.now() - 31 * 86_400_000).toISOString() });
    await db.from("errores_app").insert({ proyecto_id: e.proyecto.id, sitio: `${sitio}-reciente`, texto: "reciente", ultimo_en: new Date(Date.now() - 29 * 86_400_000).toISOString() });
    await guardarError(sitio, "nuevo", e.proyecto.id);
    const { data } = await db.from("errores_app").select("texto").like("sitio", `${sitio}-%`);
    expect(data).toEqual([{ texto: "reciente" }]);
  });
});
