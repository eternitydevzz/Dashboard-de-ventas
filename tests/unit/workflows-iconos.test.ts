// Arreglo del 18 nov 2026 (error #441 de la campana en /admin): la vista de Workflows (componente de servidor) leía
// ICONOS de workflows-editor.tsx, que es «use client». En el servidor ese objeto llega como referencia de cliente y
// ICONOS[...] daba undefined: «Cannot destructure property 'C' of 'T.ICONOS[Q(...).icono]'» y la pestaña se caía.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ICONOS } from "@/app/(panel)/admin/workflows-iconos";
import { describirPaso, type Nombres } from "@/lib/workflows-vista";
import type { Paso } from "@/lib/workflows";

const esCliente = (ruta: string) => /^\s*["']use client["']/.test(readFileSync(ruta, "utf8"));

describe("ICONOS de los workflows", () => {
  it("vive en un archivo sin «use client» (se puede leer desde el servidor)", () => {
    expect(esCliente("src/app/(panel)/admin/workflows-iconos.ts")).toBe(false);
  });

  it("tiene un icono para cada tipo de paso", () => {
    const nombres: Nombres = { entradas: {}, pipelinesGhl: {}, pipelinesDashboard: {} };
    const pasos = [
      { id: "1", tipo: "esperar", segundos: 60 },
      { id: "2", tipo: "contacto_ghl", campos: {} },
      { id: "3", tipo: "etiquetas_ghl", base: "", fijas: ["x"] },
      { id: "4", tipo: "quitar_etiqueta_ghl", etiqueta: "x" },
      { id: "5", tipo: "oportunidad_ghl", pipeline_id: "p", etapa_id: null },
      { id: "6", tipo: "mover_dashboard", pipeline_id: "p", etapa_id: null },
      { id: "7", tipo: "rama", caminos: [] },
    ] as unknown as Paso[];
    for (const p of pasos) {
      const { C, color } = ICONOS[describirPaso(p, nombres).icono];
      expect(C).toBeTruthy();
      expect(color).toMatch(/^from-/);
    }
  });
});

// Guarda general: un componente de servidor solo puede importar COMPONENTES (PascalCase) de un archivo «use client».
// Cualquier otro valor (constantes, funciones) llega vacío al servidor.
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const r = join(dir, n);
    return statSync(r).isDirectory() ? archivos(r) : /\.tsx?$/.test(n) ? [r] : [];
  });
}
function resolver(desde: string, spec: string) {
  const base = spec.startsWith("@/") ? resolve("src", spec.slice(2)) : resolve(dirname(desde), spec);
  return ["", ".tsx", ".ts", "/index.tsx", "/index.ts"].map((e) => base + e).find((r) => existsSync(r) && statSync(r).isFile());
}

describe("servidor → archivos «use client»", () => {
  it("ningún componente de servidor de src/app importa valores que no sean componentes de un archivo «use client»", () => {
    const malos: string[] = [];
    for (const f of archivos("src/app")) {
      const texto = readFileSync(f, "utf8");
      if (esCliente(f) || /^\s*["']use server["']/.test(texto)) continue;
      for (const m of texto.matchAll(/import\s+(?!type\b)\{([^}]+)\}\s+from\s+["'](\.{1,2}\/[^"']+|@\/[^"']+)["']/g)) {
        const destino = resolver(f, m[2]);
        if (!destino || !esCliente(destino)) continue;
        const valores = m[1].split(",").map((s) => s.trim()).filter((s) => s && !s.startsWith("type "));
        for (const v of valores) {
          const nombre = v.split(/\s+as\s+/)[0].trim();
          if (!/^[A-Z][a-z]/.test(nombre)) malos.push(`${f.replace(/\\/g, "/")}: ${nombre} de ${m[2]}`);
        }
      }
    }
    expect(malos).toEqual([]);
  });
});
