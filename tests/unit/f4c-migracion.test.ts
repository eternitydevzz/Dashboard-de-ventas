// Fase 4 · zona c: la migración de datos lee bien lo esencial (sin aplicarla en ninguna base).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, "");
const sql = () => sinComentarios(readFileSync("supabase/migrations/20261121100000_datos.sql", "utf8"));
const funcion = (nombre: string) => {
  const s = sql();
  const i = s.indexOf(`create or replace function public.${nombre}(`);
  expect(i).toBeGreaterThan(-1);
  return s.slice(i, s.indexOf("$$;", s.indexOf("$$", i) + 2) + 3);
};

describe("f4c · migración 20261121100000_datos", () => {
  it("solo añade: nada de drop, ni concurrently (la CLI la corre en una transacción)", () => {
    expect(sql()).not.toMatch(/\bdrop\b/i);
    expect(sql()).not.toMatch(/concurrently/i);
  });

  it("A1-03: índice por email tal cual (el código busca con email = …)", () => {
    expect(sql()).toContain("create index if not exists leads_proyecto_email_idx on public.leads (proyecto_id, email)");
  });

  it("S5-5: índices en lead_id de las 5 tablas y en leads.pipeline_id", () => {
    for (const t of ["webhook_eventos", "llamadas_ghl", "analisis_llamadas", "grabaciones_caller", "guion_marcas"]) {
      expect(sql()).toContain(`create index if not exists ${t}_lead_idx on public.${t} (lead_id) where lead_id is not null`);
    }
    expect(sql()).toContain("create index if not exists leads_pipeline_idx on public.leads (pipeline_id, id)");
  });

  it("S5-6: avisar_insertadas no avisa si la dispara otro trigger, y sigue avisando en el resto", () => {
    const f = funcion("avisar_insertadas");
    expect(f).toMatch(/if pg_trigger_depth\(\) > 1 then\s+return null;\s+end if;/);
    expect(f.indexOf("pg_trigger_depth")).toBeLessThan(f.indexOf("avisar_cambio"));
    expect(f).toContain("perform avisar_cambio(array(select distinct proyecto_id from nuevas where proyecto_id is not null), tg_table_name)");
    expect(f).toContain("security definer set search_path = public");
  });

  it("S5-7: unir_leads deja «vendido» al que se queda si tiene ventas, y mantiene permisos y lo de antes", () => {
    const f = funcion("unir_leads");
    expect(f).toContain("estado_caller = case when exists (select 1 from ventas where lead_id = q.id) then 'vendido' else estado_caller end");
    // va en el update del que se queda, después de pasar las ventas
    expect(f.indexOf("update ventas set lead_id = q.id")).toBeLessThan(f.indexOf("estado_caller = case"));
    expect(f).toContain("returns jsonb");
    expect(f).toContain("ghl_contactos_unidos");
    expect(f).toContain("'cita_en_sobra', v_cita_en_sobra");
    expect(sql()).toContain("revoke execute on function public.unir_leads(uuid, uuid, uuid) from public, anon, authenticated;");
    expect(sql()).toContain("grant execute on function public.unir_leads(uuid, uuid, uuid) to service_role;");
  });
});
