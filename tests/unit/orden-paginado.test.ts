// Arreglo 14 de la auditoría: Supabase devuelve como mucho 1000 filas y `todas` pide de 1000 en 1000.
// Sin un orden fijo, la base no garantiza que las páginas no se repitan o se salten filas.
// Este test revisa el código: cada lectura con `todas(...)` tiene que llevar `.order("id")` (o su columna única) antes de `.range(`.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? archivos(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("Lecturas paginadas con orden fijo", () => {
  it("todas las llamadas a todas(...) ordenan antes de paginar", () => {
    const sinOrden: string[] = [];
    let total = 0;
    for (const p of archivos("src")) {
      const s = readFileSync(p, "utf8");
      for (const m of s.matchAll(/todas(<[^(]*?>)?\(/g)) {
        if (s.slice(Math.max(0, m.index! - 16), m.index).endsWith("async function ")) continue;
        // porTrozos (lib/datos) solo envuelve todas(); la consulta la ponen sus llamadas, revisadas abajo
        if (s.startsWith("todas<T>((d, h) => consulta(", m.index)) continue;
        const fin = s.indexOf(".range(", m.index);
        const trozo = s.slice(m.index, fin);
        total++;
        // Hace falta desempatar por una columna única (id; en clientes, lead_id; en scoring_ia, proyecto_id)
        if (fin < 0 || !/\.order\("(id|lead_id|proyecto_id)"/.test(trozo)) sinOrden.push(`${p}: ${trozo.slice(0, 90).replace(/\s+/g, " ")}`);
      }
      for (const m of s.matchAll(/porTrozos(<[^(]*?>)?\([^,]+, \(t, d, h\) =>/g)) {
        const trozo = s.slice(m.index, s.indexOf(".range(", m.index));
        total++;
        if (!/\.order\("(id|lead_id|proyecto_id)"/.test(trozo)) sinOrden.push(`${p}: ${trozo.slice(0, 90).replace(/\s+/g, " ")}`);
      }
    }
    expect(total).toBeGreaterThan(35);
    expect(sinOrden).toEqual([]);
  });
});
