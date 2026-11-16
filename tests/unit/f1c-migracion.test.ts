// Fase 1 · zona C (N1, Cristian): fuera «No responde». La migración lee bien lo esencial (sin aplicarla en ninguna base).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leer = () => readFileSync("supabase/migrations/20261119100000_sin_no_responde.sql", "utf8");
const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, "");

describe("f1c · migración sin «No responde»", () => {
  it("los checks nuevos y crear_pipelines_equipo ya no tienen 'no_responde'", () => {
    const sql = sinComentarios(leer());
    const checks = sql.match(/add constraint \w+_estado_caller_check check \([\s\S]*?\)\);/g) ?? [];
    expect(checks).toHaveLength(2);
    for (const c of checks) {
      expect(c).not.toContain("no_responde");
      expect(c).toContain("'nuevo'");
      expect(c).toContain("'vendido'");
    }
    const funcion = sql.slice(sql.indexOf("create or replace function public.crear_pipelines_equipo"));
    expect(funcion).toContain("'Leads', 0");
    expect(funcion).toContain("'Cerrados', 10");
    expect(funcion).not.toContain("no_responde");
    expect(funcion).not.toContain("No responde");
  });

  it("los leads vuelven a «nuevo» y nada apunta a la columna antes de borrarla", () => {
    const sql = sinComentarios(leer());
    const update = sql.indexOf("update public.leads set estado_caller = 'nuevo' where estado_caller = 'no_responde'");
    const borrar = sql.indexOf("delete from public.etapas");
    expect(update).toBeGreaterThan(-1);
    expect(borrar).toBeGreaterThan(update);
    for (const t of ["leads l set etapa_callers_id", "leads l set etapa_id", "tarjetas_extra t set etapa_id", "entradas x set etapa_id"]) {
      expect(sql.indexOf(`update public.${t}`), t).toBeGreaterThan(update);
      expect(sql.indexOf(`update public.${t}`), t).toBeLessThan(borrar);
    }
  });

  it("mantiene los permisos de la fase 2", () => {
    const sql = sinComentarios(leer());
    expect(sql).toContain("revoke execute on function public.crear_pipelines_equipo(uuid) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.crear_pipelines_equipo(uuid) to service_role;");
  });
});
