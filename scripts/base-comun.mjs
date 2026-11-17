// Crea (si falta) el proyecto base con sus pipelines, columnas y productos.
// Se puede ejecutar varias veces: no repite lo que ya existe con el mismo nombre exacto
// (un nombre con otra mayúscula, tilde o espacio se crearía otra vez).
import { readFileSync } from "node:fs";

export const BASE = JSON.parse(readFileSync(new URL("./proyecto-base.json", import.meta.url), "utf8"));

async function must(promise, que) {
  const { data, error } = await promise;
  if (error) throw new Error(`${que}: ${error.message}`);
  return data;
}

export async function asegurarProyectoBase(db, { simular = false, log = console.log } = {}) {
  const cfg = BASE.proyecto;
  let [proyecto] = await must(db.from("proyectos").select("*").eq("nombre", cfg.nombre), "leer proyecto");
  if (!proyecto) {
    log(`+ Proyecto ${cfg.nombre} (${cfg.moneda}, ${cfg.zona_horaria})`);
    if (simular) return null;
    [proyecto] = await must(db.from("proyectos").insert(cfg).select(), "crear proyecto");
  } else log(`= Proyecto ${cfg.nombre} ya existe`);

  const existentes = await must(db.from("pipelines").select("nombre").eq("proyecto_id", proyecto.id).eq("tipo", "normal"), "leer pipelines");
  for (const [i, p] of BASE.pipelines.entries()) {
    if (existentes.some((e) => e.nombre === p.nombre)) {
      log(`= Pipeline ${p.nombre} ya existe`);
      continue;
    }
    log(`+ Pipeline ${p.nombre}: ${p.columnas.join(", ")}`);
    if (simular) continue;
    const [pipe] = await must(db.from("pipelines").insert({ proyecto_id: proyecto.id, nombre: p.nombre, orden: i }).select(), `pipeline ${p.nombre}`);
    await must(
      db.from("etapas").insert(p.columnas.map((nombre, j) => ({ pipeline_id: pipe.id, nombre, orden: j, color: BASE.colores[j % BASE.colores.length], ...(nombre === "Cerrados" ? { estado_caller: "vendido" } : {}) }))),
      `columnas ${p.nombre}`
    );
  }

  const prods = await must(db.from("productos").select("nombre").eq("proyecto_id", proyecto.id), "leer productos");
  for (const p of BASE.productos) {
    if (prods.some((x) => x.nombre === p.nombre)) {
      log(`= Producto ${p.nombre} ya existe`);
      continue;
    }
    log(`+ Producto ${p.nombre} (${p.precio ?? "precio personalizado"})`);
    if (!simular) await must(db.from("productos").insert({ ...p, proyecto_id: proyecto.id }), `producto ${p.nombre}`);
  }
  return proyecto;
}
